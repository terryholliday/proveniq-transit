"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletRegistry = void 0;
class WalletRegistry {
    static async get(wallet_id) {
        // Stub
        if (wallet_id.startsWith("wallet_")) {
            return {
                walletId: wallet_id,
                publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
                status: "ACTIVE"
            };
        }
        return null;
    }
}
exports.WalletRegistry = WalletRegistry;
