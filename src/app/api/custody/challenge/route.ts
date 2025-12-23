import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { hash256Hex, canonicalize, signEd25519 } from "@/shared/crypto/src";
import { MockLedgerClient } from "@/shared/ledger-client/src/mock";
import { LiveLedgerClient } from "@/shared/ledger-client/src/live";
import { CustodyState, validateTransition } from "@/logic/stateMachine";

const USE_REAL_LEDGER = process.env.USE_REAL_LEDGER === "true";
const ledger = USE_REAL_LEDGER ? new LiveLedgerClient() : new MockLedgerClient();

const CreateChallengeSchema = z.object({
  custody_token_id: z.string().uuid(),
  to_wallet_id: z.string(),
  expires_in_minutes: z.number().int().min(5).max(1440).default(60),
  geo_snapshot: z.object({
    lat_e7: z.number().int(),
    lon_e7: z.number().int(),
  }).optional(),
  condition_snapshot: z.array(z.object({
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })).optional(),
  from_signature: z.string().regex(/^[a-f0-9]+$/i),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateChallengeSchema.parse(body);

    // Get custody token
    const custodyToken = await prisma.custodyToken.findUnique({
      where: { custodyTokenId: input.custody_token_id },
      include: {
        currentCustodian: true,
        shipment: true,
      },
    });

    if (!custodyToken) {
      return NextResponse.json({ error: "Custody token not found" }, { status: 404 });
    }

    // Verify TO wallet exists
    const toWallet = await prisma.wallet.findFirst({
      where: { walletId: input.to_wallet_id, status: "ACTIVE" },
    });
    if (!toWallet) {
      return NextResponse.json({ error: "Recipient wallet not found or inactive" }, { status: 404 });
    }

    // Check for pending challenges
    const pendingChallenge = await prisma.handoffChallenge.findFirst({
      where: {
        custodyTokenId: custodyToken.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (pendingChallenge) {
      return NextResponse.json(
        { error: "Active challenge already exists for this custody token" },
        { status: 400 }
      );
    }

    // Generate challenge
    const challengeId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + input.expires_in_minutes * 60 * 1000);

    // Create challenge
    const challenge = await prisma.handoffChallenge.create({
      data: {
        challengeId,
        custodyTokenId: custodyToken.id,
        fromWalletId: custodyToken.currentCustodian.id,
        toWalletId: toWallet.id,
        nonce,
        expiresAt,
        geoSnapshot: input.geo_snapshot,
        conditionSnapshot: input.condition_snapshot,
        fromSignature: input.from_signature,
        status: "PENDING",
      },
    });

    // Create shipment event
    await prisma.shipmentEvent.create({
      data: {
        shipmentId: custodyToken.shipment.id,
        eventType: "CHALLENGE_CREATED",
        description: `Handoff challenge created for ${toWallet.ownerName}`,
        actorWalletId: custodyToken.currentCustodian.walletId,
        payload: {
          challenge_id: challengeId,
          to_wallet_id: input.to_wallet_id,
          expires_at: expiresAt.toISOString(),
        },
      },
    });

    // Write to Ledger
    const challengePayload = {
      challenge_id: challengeId,
      custody_token_id: custodyToken.custodyTokenId,
      from_wallet_id: custodyToken.currentCustodian.walletId,
      to_wallet_id: input.to_wallet_id,
      nonce,
      expires_at: expiresAt.toISOString(),
    };

    try {
      const receipt = await ledger.appendEvent({
        type: "TRANSIT_HANDOFF_COMPLETED",
        asset_id: custodyToken.assetId,
        custody_token_id: custodyToken.custodyTokenId,
        payload: {
          event_subtype: "CHALLENGE_CREATED",
          ...challengePayload,
          canonical_hash_hex: hash256Hex(canonicalize(challengePayload)),
        },
        correlation_id: crypto.randomUUID(),
        idempotency_key: `challenge-create-${challenge.id}`,
        created_at: new Date().toISOString(),
        schema_version: "1.0.0",
      });

      await prisma.handoffChallenge.update({
        where: { id: challenge.id },
        data: { ledgerEventId: receipt.ledger_event_id },
      });
    } catch (ledgerError) {
      console.error("Ledger write failed:", ledgerError);
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "CHALLENGE_CREATED",
        resourceType: "handoff_challenge",
        resourceId: challenge.id,
        actorId: custodyToken.currentCustodian.walletId,
        details: {
          challenge_id: challengeId,
          custody_token_id: custodyToken.custodyTokenId,
          to_wallet_id: input.to_wallet_id,
        },
      },
    });

    return NextResponse.json({
      challenge_id: challengeId,
      custody_token_id: custodyToken.custodyTokenId,
      from_wallet_id: custodyToken.currentCustodian.walletId,
      to_wallet_id: input.to_wallet_id,
      nonce,
      expires_at: expiresAt.toISOString(),
      status: "PENDING",
    }, { status: 201 });

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Challenge creation error:", e);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
