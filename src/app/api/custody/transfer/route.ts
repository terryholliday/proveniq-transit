
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { canonicalize, stripSig, verifyEd25519, hash256Hex } from "@/shared/crypto/src";
import { MockLedgerClient } from "@/shared/ledger-client/src/mock";
import { LiveLedgerClient } from "@/shared/ledger-client/src/live";
import { validateTransition, CustodyState } from "@/logic/stateMachine";

const USE_REAL_LEDGER = process.env.USE_REAL_LEDGER === "true";
const ledger = USE_REAL_LEDGER ? new LiveLedgerClient() : new MockLedgerClient();

const AcceptTransferSchema = z.object({
  challenge_id: z.string().uuid(),
  to_wallet_id: z.string(),
  accepted_at: z.string().datetime(),
  to_signature: z.string().regex(/^[a-f0-9]+$/i),
  geo_snapshot: z.object({
    lat_e7: z.number().int(),
    lon_e7: z.number().int(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = AcceptTransferSchema.parse(body);

    // Get challenge from database
    const challenge = await prisma.handoffChallenge.findUnique({
      where: { challengeId: input.challenge_id },
      include: {
        custodyToken: {
          include: {
            shipment: true,
          },
        },
        fromWallet: true,
        toWallet: true,
      },
    });

    if (!challenge) {
      return NextResponse.json({ error: "CHALLENGE_NOT_FOUND" }, { status: 404 });
    }

    if (challenge.status !== "PENDING") {
      return NextResponse.json({ error: `CHALLENGE_${challenge.status}` }, { status: 400 });
    }

    if (new Date() > challenge.expiresAt) {
      await prisma.handoffChallenge.update({
        where: { id: challenge.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json({ error: "CHALLENGE_EXPIRED" }, { status: 400 });
    }

    // Verify TO wallet matches
    const toWallet = await prisma.wallet.findFirst({
      where: { walletId: input.to_wallet_id, status: "ACTIVE" },
    });

    if (!toWallet || toWallet.id !== challenge.toWalletId) {
      return NextResponse.json({ error: "WALLET_MISMATCH" }, { status: 400 });
    }

    // Verify TO signature
    const unsignedAcceptance = {
      challenge_id: input.challenge_id,
      to_wallet_id: input.to_wallet_id,
      accepted_at: input.accepted_at,
    };
    const canonicalAcceptance = canonicalize(unsignedAcceptance);

    if (!verifyEd25519(toWallet.publicKeyPem, canonicalAcceptance, input.to_signature)) {
      return NextResponse.json({ error: "INVALID_TO_SIGNATURE" }, { status: 401 });
    }

    // Verify FROM signature on original challenge
    const unsignedChallenge = {
      challenge_id: challenge.challengeId,
      custody_token_id: challenge.custodyToken.custodyTokenId,
      from_wallet_id: challenge.fromWallet.walletId,
      to_wallet_id: challenge.toWallet.walletId,
      nonce: challenge.nonce,
      expires_at: challenge.expiresAt.toISOString(),
    };
    const canonicalChallenge = canonicalize(unsignedChallenge);

    if (!verifyEd25519(challenge.fromWallet.publicKeyPem, canonicalChallenge, challenge.fromSignature)) {
      return NextResponse.json({ error: "INVALID_FROM_SIGNATURE_ON_CHALLENGE" }, { status: 401 });
    }

    // Determine next state
    const currentState = challenge.custodyToken.state as CustodyState;
    let nextState: CustodyState;

    if (currentState === CustodyState.OFFERED) {
      nextState = CustodyState.TRANSIT;
    } else if (currentState === CustodyState.TRANSIT) {
      nextState = CustodyState.DELIVERY;
    } else if (currentState === CustodyState.DELIVERY) {
      nextState = CustodyState.DELIVERED;
    } else {
      return NextResponse.json({ error: `INVALID_STATE_FOR_TRANSFER: ${currentState}` }, { status: 400 });
    }

    if (!validateTransition(currentState, nextState)) {
      return NextResponse.json({ error: `INVALID_TRANSITION_${currentState}_TO_${nextState}` }, { status: 400 });
    }

    // Update challenge
    await prisma.handoffChallenge.update({
      where: { id: challenge.id },
      data: {
        status: "ACCEPTED",
        toSignature: input.to_signature,
        acceptedAt: new Date(input.accepted_at),
      },
    });

    // Update custody token
    await prisma.custodyToken.update({
      where: { id: challenge.custodyToken.id },
      data: {
        currentCustodianId: toWallet.id,
        state: nextState,
        lastTransitionAt: new Date(),
        handoffCount: { increment: 1 },
      },
    });

    // Update shipment status if needed
    let shipmentStatus = challenge.custodyToken.shipment.status;
    if (nextState === CustodyState.TRANSIT && shipmentStatus === "CREATED") {
      shipmentStatus = "IN_TRANSIT";
    } else if (nextState === CustodyState.DELIVERED) {
      shipmentStatus = "DELIVERED";
    }

    await prisma.shipment.update({
      where: { id: challenge.custodyToken.shipment.id },
      data: {
        status: shipmentStatus,
        actualPickup: nextState === CustodyState.TRANSIT ? new Date() : undefined,
        actualDelivery: nextState === CustodyState.DELIVERED ? new Date() : undefined,
      },
    });

    // Create shipment event
    await prisma.shipmentEvent.create({
      data: {
        shipmentId: challenge.custodyToken.shipment.id,
        eventType: "HANDOFF_COMPLETED",
        description: `Custody transferred to ${toWallet.ownerName}`,
        actorWalletId: toWallet.walletId,
        geoSnapshot: input.geo_snapshot,
        payload: {
          challenge_id: challenge.challengeId,
          from_wallet_id: challenge.fromWallet.walletId,
          to_wallet_id: toWallet.walletId,
          new_state: nextState,
        },
      },
    });

    // Write to Ledger
    const transferPayload = {
      challenge_id: challenge.challengeId,
      custody_token_id: challenge.custodyToken.custodyTokenId,
      from_wallet_id: challenge.fromWallet.walletId,
      to_wallet_id: toWallet.walletId,
      new_state: nextState,
      accepted_at: input.accepted_at,
    };

    let ledgerReceipt;
    try {
      ledgerReceipt = await ledger.appendEvent({
        type: "TRANSIT_HANDOFF_COMPLETED",
        asset_id: challenge.custodyToken.assetId,
        custody_token_id: challenge.custodyToken.custodyTokenId,
        payload: {
          ...transferPayload,
          canonical_hash_hex: hash256Hex(canonicalize(transferPayload)),
        },
        correlation_id: crypto.randomUUID(),
        idempotency_key: `transfer-accept-${challenge.id}`,
        created_at: new Date().toISOString(),
        schema_version: "1.0.0",
      });

      await prisma.handoffChallenge.update({
        where: { id: challenge.id },
        data: { acceptLedgerEventId: ledgerReceipt.ledger_event_id },
      });
    } catch (ledgerError) {
      console.error("Ledger write failed:", ledgerError);
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "HANDOFF_COMPLETED",
        resourceType: "custody_token",
        resourceId: challenge.custodyToken.id,
        actorId: toWallet.walletId,
        details: transferPayload,
      },
    });

    return NextResponse.json({
      success: true,
      custody_token_id: challenge.custodyToken.custodyTokenId,
      new_state: nextState,
      new_custodian: {
        wallet_id: toWallet.walletId,
        owner_name: toWallet.ownerName,
      },
      handoff_count: challenge.custodyToken.handoffCount + 1,
      ledger_event_id: ledgerReceipt?.ledger_event_id,
    });

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Transfer error:", e);
    return NextResponse.json({ error: "TRANSFER_FAILED", details: e?.message }, { status: 500 });
  }
}
