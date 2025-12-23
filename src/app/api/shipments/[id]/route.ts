import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        custodyToken: {
          include: {
            currentCustodian: { select: { walletId: true, ownerName: true, ownerType: true } },
            challenges: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
        senderWallet: { select: { walletId: true, ownerName: true, ownerType: true } },
        recipientWallet: { select: { walletId: true, ownerName: true, ownerType: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: shipment.id,
      shipment_number: shipment.shipmentNumber,
      asset_id: shipment.assetId,
      asset_description: shipment.assetDescription,
      declared_value_micros: shipment.declaredValueMicros,
      currency: shipment.currency,
      status: shipment.status,
      
      // Parties
      sender: shipment.senderWallet,
      recipient: shipment.recipientWallet,
      
      // Custody
      custody_token: shipment.custodyToken ? {
        id: shipment.custodyToken.custodyTokenId,
        state: shipment.custodyToken.state,
        current_custodian: shipment.custodyToken.currentCustodian,
        handoff_count: shipment.custodyToken.handoffCount,
        last_transition_at: shipment.custodyToken.lastTransitionAt.toISOString(),
        challenges: shipment.custodyToken.challenges.map((c) => ({
          id: c.challengeId,
          status: c.status,
          from_wallet_id: c.fromWalletId,
          to_wallet_id: c.toWalletId,
          expires_at: c.expiresAt.toISOString(),
        })),
      } : null,
      
      // Anchor
      anchor_id: shipment.anchorId,
      seal_id: shipment.sealId,
      anchor_status: shipment.anchorStatus,
      
      // Insurance
      insured: shipment.insured,
      protect_policy_id: shipment.protectPolicyId,
      protect_quote_id: shipment.protectQuoteId,
      
      // Route
      origin_address: shipment.originAddress,
      destination_address: shipment.destinationAddress,
      
      // Timestamps
      estimated_pickup: shipment.estimatedPickup?.toISOString(),
      actual_pickup: shipment.actualPickup?.toISOString(),
      estimated_delivery: shipment.estimatedDelivery?.toISOString(),
      actual_delivery: shipment.actualDelivery?.toISOString(),
      
      // Events
      events: shipment.events.map((e) => ({
        id: e.id,
        type: e.eventType,
        description: e.description,
        actor_wallet_id: e.actorWalletId,
        created_at: e.createdAt.toISOString(),
      })),
      
      created_at: shipment.createdAt.toISOString(),
      updated_at: shipment.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("Get shipment error:", e);
    return NextResponse.json({ error: "Failed to get shipment" }, { status: 500 });
  }
}
