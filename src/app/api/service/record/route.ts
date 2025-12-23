import { NextRequest, NextResponse } from "next/server";
import { ServiceRecordSchema } from "@/shared/contracts/src";
import { canonicalize, hash256Hex, stripSig, verifyEd25519 } from "@/shared/crypto/src";
import { ProviderRegistry } from "@/logic/providerRegistry";
import { ledger } from "@/app/api/_utils/ledger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const serviceRecord = ServiceRecordSchema.parse(body);

        const provider = await ProviderRegistry.get(serviceRecord.provider_id);
        if (!provider) {
            return NextResponse.json({ error: "UNKNOWN_PROVIDER" }, { status: 404 });
        }

        const unsignedRecord = stripSig(serviceRecord, ["provider_signature"]);
        const canonicalRecord = canonicalize(unsignedRecord);

        if (!verifyEd25519(provider.publicKeyPem, canonicalRecord, serviceRecord.provider_signature)) {
            return NextResponse.json({ error: "INVALID_PROVIDER_SIGNATURE" }, { status: 401 });
        }

        const canonicalHash = hash256Hex(canonicalRecord);

        const receipt = await ledger.appendEvent({
            type: "SERVICE_RECORDED",
            asset_id: serviceRecord.asset_id,
            payload: {
                ...serviceRecord,
                canonical_hash_hex: canonicalHash,
            },
            correlation_id: serviceRecord.correlation_id,
            idempotency_key: serviceRecord.idempotency_key,
            created_at: serviceRecord.created_at,
            schema_version: "1.0.0",
        });

        return NextResponse.json({ ledger_receipt: receipt, canonical_hash_hex: canonicalHash });
    } catch (e: any) {
        return NextResponse.json(
            { error: "VALIDATION_OR_SYSTEM_ERROR", details: e?.message ?? String(e) },
            { status: 400 }
        );
    }
}
