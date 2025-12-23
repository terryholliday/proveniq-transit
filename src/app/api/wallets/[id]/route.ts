import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try to find by wallet_id first, then by id
    let wallet = await prisma.wallet.findUnique({
      where: { walletId: id },
    });

    if (!wallet) {
      wallet = await prisma.wallet.findUnique({
        where: { id },
      });
    }

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: wallet.id,
      wallet_id: wallet.walletId,
      owner_type: wallet.ownerType,
      owner_name: wallet.ownerName,
      owner_id: wallet.ownerId,
      status: wallet.status,
      public_key_pem: wallet.publicKeyPem,
      metadata: wallet.metadata,
      created_at: wallet.createdAt.toISOString(),
      updated_at: wallet.updatedAt.toISOString(),
    });
  } catch (e: any) {
    console.error("Get wallet error:", e);
    return NextResponse.json({ error: "Failed to get wallet" }, { status: 500 });
  }
}

const UpdateWalletSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).optional(),
  owner_name: z.string().min(1).max(256).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = UpdateWalletSchema.parse(body);

    let wallet = await prisma.wallet.findUnique({
      where: { walletId: id },
    });

    if (!wallet) {
      wallet = await prisma.wallet.findUnique({
        where: { id },
      });
    }

    if (!wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (input.status) updateData.status = input.status;
    if (input.owner_name) updateData.ownerName = input.owner_name;
    if (input.metadata) updateData.metadata = input.metadata;

    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: `WALLET_${input.status || "UPDATED"}`,
        resourceType: "wallet",
        resourceId: wallet.id,
        details: updateData,
      },
    });

    return NextResponse.json({
      id: updated.id,
      wallet_id: updated.walletId,
      status: updated.status,
      updated_at: updated.updatedAt.toISOString(),
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Update wallet error:", e);
    return NextResponse.json({ error: "Failed to update wallet" }, { status: 500 });
  }
}
