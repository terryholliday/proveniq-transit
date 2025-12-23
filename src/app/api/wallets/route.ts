import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";

const RegisterWalletSchema = z.object({
  wallet_id: z.string().min(8).max(64),
  owner_type: z.enum(["INDIVIDUAL", "CARRIER", "LOCKER", "WAREHOUSE"]),
  owner_name: z.string().min(1).max(256),
  owner_id: z.string().optional(),
  public_key_pem: z.string().min(50), // Ed25519 PEM format
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = RegisterWalletSchema.parse(body);

    // Check if wallet already exists
    const existing = await prisma.wallet.findUnique({
      where: { walletId: input.wallet_id },
    });

    if (existing) {
      return NextResponse.json({ error: "Wallet ID already registered" }, { status: 409 });
    }

    // Create wallet
    const wallet = await prisma.wallet.create({
      data: {
        walletId: input.wallet_id,
        ownerType: input.owner_type,
        ownerName: input.owner_name,
        ownerId: input.owner_id,
        publicKeyPem: input.public_key_pem,
        status: "ACTIVE",
        metadata: input.metadata,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action: "WALLET_REGISTERED",
        resourceType: "wallet",
        resourceId: wallet.id,
        details: {
          wallet_id: wallet.walletId,
          owner_type: wallet.ownerType,
          owner_name: wallet.ownerName,
        },
      },
    });

    return NextResponse.json({
      id: wallet.id,
      wallet_id: wallet.walletId,
      owner_type: wallet.ownerType,
      owner_name: wallet.ownerName,
      status: wallet.status,
      created_at: wallet.createdAt.toISOString(),
    }, { status: 201 });

  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: e.issues }, { status: 400 });
    }
    console.error("Wallet registration error:", e);
    return NextResponse.json({ error: "Failed to register wallet" }, { status: 500 });
  }
}

// List wallets
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerType = searchParams.get("owner_type");
    const status = searchParams.get("status");

    const where: any = {};
    if (ownerType) where.ownerType = ownerType;
    if (status) where.status = status;

    const wallets = await prisma.wallet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      wallets: wallets.map((w) => ({
        id: w.id,
        wallet_id: w.walletId,
        owner_type: w.ownerType,
        owner_name: w.ownerName,
        status: w.status,
        created_at: w.createdAt.toISOString(),
      })),
      total: wallets.length,
    });
  } catch (e: any) {
    console.error("List wallets error:", e);
    return NextResponse.json({ error: "Failed to list wallets" }, { status: 500 });
  }
}
