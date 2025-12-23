import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { QuoteRequestSchema, QuoteResponseSchema } from "@/shared/contracts/src";
import { canonicalize, hash256Hex } from "@/shared/crypto/src";
import { ledger } from "@/app/api/_utils/ledger";

const RISK_BPS_BY_COVERAGE: Record<string, number> = {
    THEFT: 420,
    DAMAGE: 360,
    FULL: 520,
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const quoteRequest = QuoteRequestSchema.parse(body);

        const risk_bps = RISK_BPS_BY_COVERAGE[quoteRequest.coverage_type] ?? 400;
        const baseMicros = BigInt(quoteRequest.term_days) * BigInt(risk_bps) * 1000n;
        const premium_micros = baseMicros.toString();
        const inputs_snapshot_hash = hash256Hex(canonicalize(quoteRequest));

        const quoteResponse = QuoteResponseSchema.parse({
            quote_id: crypto.randomUUID(),
            premium_micros,
            currency: "USD",
            pricing_version: "1.0.0",
            inputs_snapshot_hash,
            risk_bps,
            reasons: ["AUTOMATED_BASELINE_PRICING"],
            expires_at: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
        });

        const receipt = await ledger.appendEvent({
            type: "PROTECT_QUOTE_CREATED",
            asset_id: quoteRequest.asset_id,
            payload: {
                request: quoteRequest,
                quote: quoteResponse,
            },
            correlation_id: quoteRequest.correlation_id,
            idempotency_key: quoteRequest.idempotency_key,
            created_at: quoteRequest.created_at,
            schema_version: "1.0.0",
        });

        return NextResponse.json({ quote: quoteResponse, ledger_receipt: receipt });
    } catch (e: any) {
        return NextResponse.json(
            { error: "VALIDATION_OR_SYSTEM_ERROR", details: e?.message ?? String(e) },
            { status: 400 }
        );
    }
}
