"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerView = void 0;
class LedgerView {
    static async getChallenge(challenge_id) {
        // Stub
        // In real life, query Redia/SQL projection of ledger
        return {
            schema_version: "1.0.0",
            created_at: new Date().toISOString(),
            correlation_id: "corr_123",
            idempotency_key: "idem_123",
            challenge_id: challenge_id,
            custody_token_id: "token_123",
            from_wallet_id: "wallet_A",
            to_wallet_id: "wallet_B",
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            nonce: "nonce_123",
            from_signature: "deadbeef" // Mock
        };
    }
    static async getCustodyToken(custody_token_id) {
        // Stub
        return {
            schema_version: "1.0.0",
            created_at: new Date().toISOString(),
            correlation_id: "corr_token",
            idempotency_key: "idem_token",
            custody_token_id: custody_token_id,
            asset_id: "asset_123",
            current_custodian_wallet_id: "wallet_A",
            state: "OFFERED_FOR_PICKUP",
            last_transition_at: new Date().toISOString()
        };
    }
}
exports.LedgerView = LedgerView;
