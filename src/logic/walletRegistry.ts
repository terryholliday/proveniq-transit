export interface Wallet {
    walletId: string;
    publicKeyPem: string;
    status: "ACTIVE" | "SUSPENDED";
}

export class WalletRegistry {
    static async get(wallet_id: string): Promise<Wallet | null> {
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
