
import { NextRequest, NextResponse } from "next/server";
import { HandoffAcceptanceSchema } from "@/shared/contracts/src";
import { canonicalize, stripSig, verifyEd25519 } from "@/shared/crypto/src";
import { MockLedgerClient } from "@/shared/ledger-client/src/mock";
import { validateTransition, CustodyState } from "@/logic/stateMachine";
import { WalletRegistry } from "@/logic/walletRegistry";
import { LedgerView } from "@/logic/ledgerView";

const ledger = new MockLedgerClient();

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const acceptance = HandoffAcceptanceSchema.parse(body);

        const challenge = await LedgerView.getChallenge(acceptance.challenge_id);
        if (!challenge) return NextResponse.json({ error: "CHALLENGE_NOT_FOUND" }, { status: 404 });

        if (new Date() > new Date(challenge.expires_at)) {
            return NextResponse.json({ error: "CHALLENGE_EXPIRED" }, { status: 400 });
        }

        const toWallet = await WalletRegistry.get(acceptance.to_wallet_id);
        if (!toWallet) return NextResponse.json({ error: "UNKNOWN_TO_WALLET" }, { status: 404 });

        const fromWallet = await WalletRegistry.get(challenge.from_wallet_id);
        if (!fromWallet) return NextResponse.json({ error: "UNKNOWN_FROM_WALLET" }, { status: 404 });

        // Verify TO signature
        const unsignedAcceptance = stripSig(acceptance, ["to_signature"]);
        const canonicalAcceptance = canonicalize(unsignedAcceptance);

        if (!verifyEd25519(toWallet.publicKeyPem, canonicalAcceptance, acceptance.to_signature)) {
            return NextResponse.json({ error: "INVALID_TO_SIGNATURE" }, { status: 401 });
        }

        // Verify FROM signature
        const unsignedChallenge = stripSig(challenge, ["from_signature"]);
        const canonicalChallenge = canonicalize(unsignedChallenge);
        if (!verifyEd25519(fromWallet.publicKeyPem, canonicalChallenge, challenge.from_signature)) {
            return NextResponse.json({ error: "INVALID_FROM_SIGNATURE_ON_CHALLENGE" }, { status: 401 });
        }

        // Verify linkage
        if (acceptance.challenge_id !== challenge.challenge_id) {
            return NextResponse.json({ error: "CHALLENGE_ID_MISMATCH" }, { status: 400 });
        }

        const token = await LedgerView.getCustodyToken(challenge.custody_token_id);
        if (!token) return NextResponse.json({ error: "CUSTODY_TOKEN_NOT_FOUND" }, { status: 404 });

        // Determine next state
        const nextState =
            token.state === CustodyState.OFFERED ? CustodyState.TRANSIT :
                token.state === CustodyState.TRANSIT ? CustodyState.DELIVERY :
                    token.state === CustodyState.DELIVERY ? CustodyState.DELIVERED :
                        token.state;

        if (!validateTransition(token.state as CustodyState, nextState as CustodyState)) {
            return NextResponse.json({ error: `INVALID_TRANSITION_${token.state}_TO_${nextState}` }, { status: 400 });
        }

        const receipt = await ledger.appendEvent({
            type: "TRANSIT_HANDOFF_COMPLETED",
            asset_id: token.asset_id,
            custody_token_id: token.custody_token_id,
            payload: {
                challenge_id: challenge.challenge_id,
                from_wallet_id: challenge.from_wallet_id,
                to_wallet_id: acceptance.to_wallet_id,
                new_state: nextState,
            },
            correlation_id: acceptance.correlation_id,
            idempotency_key: acceptance.idempotency_key,
            created_at: acceptance.created_at,
            schema_version: "1.0.0",
        });

        return NextResponse.json({ ledger_receipt: receipt, new_state: nextState });
    } catch (e: any) {
        return NextResponse.json({ error: "VALIDATION_OR_SYSTEM_ERROR", details: e?.message ?? String(e) }, { status: 400 });
    }
}
