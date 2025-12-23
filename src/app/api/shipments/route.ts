import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import prisma from "@/lib/db";
import { hash256Hex, canonicalize } from "@/shared/crypto/src";
import { MockLedgerClient } from "@/shared/ledger-client/src/mock";
import { LiveLedgerClient } from "@/shared/ledger-client/src/live";

const USE_REAL_LEDGER = process.env.USE_REAL_LEDGER === "true";
const ledger = USE_REAL_LEDGER ? new LiveLedgerClient() : new MockLedgerClient();

const CreateShipmentSchema = z.object({
  asset_id: z.string().uuid(),
  asset_description: z.string().optional(),
  declared_value_micros: z.string().optional(),
  currency: z.string().length(3).default("USD"),
  sender_wallet_id: z.string(),
  recipient_wallet_id: z.string(),
  anchor_id: z.string().optional(),
  origin_address: z.string().optional(),
  origin_geo: z.object({
    lat_e7: z.number().int(),
    lon_e7: z.number().int(),
  }).optional(),
  destination_address: z.string().optional(),
  destination_geo: z.object({
    lat_e7: z.number().int(),
    lon_e7: z.number().int(),
  }).optional(),
  estimated_pickup: z.string().datetime().optional(),
  estimated_delivery: z.string().datetime().optional(),
  request_insurance: z.boolean().default(false),
});

function generateShipmentNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `TRX-${year}${month}${day}-${random}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateShipmentSchema.parse(body);

    // Verify sender wallet exists
    const senderWallet = await prisma.wallet.findFirst({
      where: { walletId: input.sender_wallet_id, status: "ACTIVE" },
    });
    if (!senderWallet) {
      return NextResponse.json({ error: "Sender wallet not found or inactive" }, { status: 404 });
    }

    // Verify recipient wallet exists
    const recipientWallet = await prisma.wallet.findFirst({
      where: { walletId: input.recipient_wallet_id, status: "ACTIVE" },
    });
    if (!recipientWallet) {
      return NextResponse.json({ error: "Recipient wallet not found or inactive" }, { status: 404 });
    }

    // Create shipment
    const shipment = await prisma.shipment.create({
      data: {
        shipmentNumber: generateShipmentNumber(),
        assetId: input.asset_id,
        assetDescription: input.asset_description,
        declaredValueMicros: input.declared_value_micros,
        currency: input.currency,
        senderWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        anchorId: input.anchor_id,
        originAddress: input.origin_address,
        originGeo: input.origin_geo,
        destinationAddress: input.destination_address,
        destinationGeo: input.destination_geo,
        estimatedPickup: input.estimated_pickup ? new Date(input.estimated_pickup) : null,
        estimatedDelivery: input.estimated_delivery ? new Date(input.estimated_delivery) : null,
        status: "CREATED",
      },
    });

    // Create custody token (sender is initial custodian)
    const custodyToken = await prisma.custodyToken.create({
      data: {
        custodyTokenId: crypto.randomUUID(),
        shipmentId: shipment.id,
        assetId: input.asset_id,
        currentCustodianId: senderWallet.id,
        state: "OFFERED_FOR_PICKUP",
        lastTransitionAt: new Date(),
      },
    });

    // Create initial event
    await prisma.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        eventType: "CREATED",
        description: "Shipment created",
        actorWalletId: senderWallet.id,
        payload: { custody_token_id: custodyToken.custodyTokenId },
      },
    });

    // Write to Ledger
    const shipmentPayload = {
      shipment_id: shipment.id,
      shipment_number: shipment.shipmentNumber,
      asset_id: shipment.assetId,
      custody_token_id: custodyToken.custodyTokenId,
      sender_wallet_id: input.sender_wallet_id,
      recipient_wallet_id: input.recipient_wallet_id,
      anchor_id: shipment.anchorId,
    };

    try {
      const receipt = await ledger.appendEvent({
        type: "TRANSIT_HANDOFF_COMPLETED", // Using existing type
        asset_id: shipment.assetId,
        custody_token_id: custodyToken.custodyTokenId,
        payload: {
          event_subtype: "SHIPMENT_CREATED",
          ...shipmentPayload,
          canonical_hash_hex: hash256Hex(canonicalize(shipmentPayload)),
        },
        correlation_id: crypto.randomUUID(),
        idempotency_key: `shipment-create-${shipment.id}`,
        created_at: new Date().toISOString(),
        schema_version: "1.0.0",
      });

      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { ledgerEventId: receipt.ledger_event_id },
      });
    } catch (ledgerError) {
      console.error("Ledger write failed:", ledgerError);
    }

    // Request insurance from Protect if requested
    if (input.request_insurance && input.declared_value_micros) {
      try {
        const protectUrl = process.env.PROTECT_API_URL || "http://localhost:3003/api";
        const quoteResponse = await fetch(`${protectUrl}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              schema_version: "1.0.0",
              created_at: new Date().toISOString(),
              correlation_id: crypto.randomUUID(),
              idempotency_key: `transit-quote-${shipment.id}`,
              asset_id: input.asset_id,
              asset_valuation_micros: input.declared_value_micros,
              security_level: input.anchor_id ? "VERIFIED" : "MED",
              last_verified_service_days: 0,
              transit_damage_history: false,
            },
            request: {
              schema_version: "1.0.0",
              created_at: new Date().toISOString(),
              correlation_id: crypto.randomUUID(),
              idempotency_key: `transit-quote-req-${shipment.id}`,
              asset_id: input.asset_id,
              coverage_type: "FULL",
              term_days: 30,
            },
          }),
        });

        if (quoteResponse.ok) {
          const quote = await quoteResponse.json();
          await prisma.shipment.update({
            where: { id: shipment.id },
            data: { protectQuoteId: quote.quote_id },
          });
        }
      } catch (protectError) {
        console.error("Protect quote request failed:", protectError);
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "SHIPMENT_CREATED",
        resourceType: "shipment",
        resourceId: shipment.id,
        actorId: senderWallet.walletId,
        details: {
          shipment_number: shipment.shipmentNumber,
          asset_id: shipment.assetId,
          custody_token_id: custodyToken.custodyTokenId,
        },
      },
    });

    return NextResponse.json({
      shipment_id: shipment.id,
      shipment_number: shipment.shipmentNumber,
      custody_token_id: custodyToken.custodyTokenId,
      asset_id: shipment.assetId,
      status: shipment.status,
      sender_wallet_id: input.sender_wallet_id,
      recipient_wallet_id: input.recipient_wallet_id,
      created_at: shipment.createdAt.toISOString(),
    }, { status: 201 });

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Shipment creation error:", e);
    return NextResponse.json({ error: "Failed to create shipment" }, { status: 500 });
  }
}

// List shipments
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const assetId = searchParams.get("asset_id");
    const anchorId = searchParams.get("anchor_id");

    const where: any = {};
    if (status) where.status = status;
    if (assetId) where.assetId = assetId;
    if (anchorId) where.anchorId = anchorId;

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        custodyToken: true,
        senderWallet: { select: { walletId: true, ownerName: true } },
        recipientWallet: { select: { walletId: true, ownerName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      shipments: shipments.map((s) => ({
        id: s.id,
        shipment_number: s.shipmentNumber,
        asset_id: s.assetId,
        status: s.status,
        custody_token_id: s.custodyToken?.custodyTokenId,
        custody_state: s.custodyToken?.state,
        sender: s.senderWallet,
        recipient: s.recipientWallet,
        anchor_id: s.anchorId,
        insured: s.insured,
        created_at: s.createdAt.toISOString(),
      })),
      total: shipments.length,
    });
  } catch (e: any) {
    console.error("List shipments error:", e);
    return NextResponse.json({ error: "Failed to list shipments" }, { status: 500 });
  }
}
