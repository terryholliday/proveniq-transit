export interface Wallet {
    walletId: string;
    publicKeyPem: string;
    status: "ACTIVE" | "SUSPENDED";
}
export declare class WalletRegistry {
    static get(wallet_id: string): Promise<Wallet | null>;
}
