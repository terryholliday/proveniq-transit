import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { PolicyBindRequestSchema } from "@/shared/contracts/src";
import { ledger } from "@/app/api/_utils/ledger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const bindRequest = PolicyBindRequestSchema.parse(body);

        const policy_id = crypto.randomUUID();

        const receipt = await ledger.appendEvent({
            type: "POLICY_BOUND",
            asset_id: bindRequest.asset_id,
            payload: {
                policy_id,
                ...bindRequest,
            },
            correlation_id: bindRequest.correlation_id,
            idempotency_key: bindRequest.idempotency_key,
            created_at: bindRequest.created_at,
            schema_version: "1.0.0",
        });

        return NextResponse.json({ policy_id, ledger_receipt: receipt });
    } catch (e: any) {
        return NextResponse.json(
            { error: "VALIDATION_OR_SYSTEM_ERROR", details: e?.message ?? String(e) },
            { status: 400 }
        );
    }
}
