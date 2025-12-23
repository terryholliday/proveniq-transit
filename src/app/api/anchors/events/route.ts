import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";

/**
 * Webhook endpoint for receiving anchor events from the Anchors service.
 * Transit uses these to track seal status and trigger disputes on tampering.
 */

const AnchorEventSchema = z.object({
  anchor_id: z.string(),
  event_type: z.enum([
    "ANCHOR_REGISTERED",
    "ANCHOR_SEAL_ARMED",
    "ANCHOR_SEAL_BROKEN",
    "ANCHOR_ENVIRONMENTAL_ALERT",
    "ANCHOR_CUSTODY_SIGNAL",
  ]),
  payload: z.record(z.unknown()),
  event_timestamp: z.string().datetime(),
  ledger_event_id: z.string(),
});

function calculateRiskImpact(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "ANCHOR_SEAL_BROKEN":
      const triggerType = payload.trigger_type as string;
      if (triggerType === "TAMPER" || triggerType === "FORCE") {
        return "CRITICAL";
      }
      return "MAJOR";
    
    case "ANCHOR_ENVIRONMENTAL_ALERT":
      const metric = payload.metric as string;
      if (metric === "SHOCK") {
        return "MAJOR";
      }
      return "MINOR";
    
    case "ANCHOR_CUSTODY_SIGNAL":
      return "MINOR";
    
    case "ANCHOR_SEAL_ARMED":
      return "NONE";
    
    default:
      return "NONE";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = AnchorEventSchema.parse(body);

    // Find shipments linked to this anchor
    const shipments = await prisma.shipment.findMany({
      where: {
        anchorId: input.anchor_id,
        status: { in: ["CREATED", "SEALED", "IN_TRANSIT"] },
      },
      include: {
        custodyToken: true,
      },
    });

    const riskImpact = calculateRiskImpact(input.event_type, input.payload as Record<string, unknown>);

    // Store the anchor event
    const anchorEvent = await prisma.anchorEvent.create({
      data: {
        anchorId: input.anchor_id,
        eventType: input.event_type,
        payload: input.payload,
        eventTimestamp: new Date(input.event_timestamp),
        ledgerEventId: input.ledger_event_id,
        shipmentId: shipments[0]?.id,
        custodyTokenId: shipments[0]?.custodyToken?.id,
        riskImpact,
        processed: false,
      },
    });

    // Process each affected shipment
    for (const shipment of shipments) {
      // Update shipment anchor status
      const updateData: any = {};

      if (input.event_type === "ANCHOR_SEAL_ARMED") {
        updateData.anchorStatus = "ARMED";
        updateData.sealId = (input.payload as any).seal_id;
        if (shipment.status === "CREATED") {
          updateData.status = "SEALED";
        }
      } else if (input.event_type === "ANCHOR_SEAL_BROKEN") {
        updateData.anchorStatus = "BROKEN";
        
        // If tampered in transit, mark as DISPUTED
        if (riskImpact === "CRITICAL" && shipment.status === "IN_TRANSIT") {
          updateData.status = "DISPUTED";
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: updateData,
        });
      }

      // Create shipment event
      await prisma.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          eventType: `ANCHOR_${input.event_type.replace("ANCHOR_", "")}`,
          description: `Anchor event: ${input.event_type}`,
          anchorEventId: anchorEvent.id,
          payload: {
            anchor_id: input.anchor_id,
            risk_impact: riskImpact,
            ...input.payload,
          },
        },
      });

      // If CRITICAL, create audit alert
      if (riskImpact === "CRITICAL") {
        await prisma.auditLog.create({
          data: {
            action: "ANCHOR_TAMPER_DETECTED",
            resourceType: "shipment",
            resourceId: shipment.id,
            details: {
              anchor_id: input.anchor_id,
              event_type: input.event_type,
              risk_impact: riskImpact,
              custody_token_id: shipment.custodyToken?.custodyTokenId,
              message: "Tamper detected - shipment marked as DISPUTED",
            },
          },
        });
      }
    }

    // Mark as processed
    await prisma.anchorEvent.update({
      where: { id: anchorEvent.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return NextResponse.json({
      received: true,
      anchor_event_id: anchorEvent.id,
      shipments_affected: shipments.length,
      risk_impact: riskImpact,
    });

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Anchor event processing error:", e);
    return NextResponse.json({ error: "Failed to process anchor event" }, { status: 500 });
  }
}
