export interface Provider {
    providerId: string;
    publicKeyPem: string;
    status: "ACTIVE" | "SUSPENDED";
}

export class ProviderRegistry {
    static async get(provider_id: string): Promise<Provider | null> {
        if (provider_id.startsWith("provider_")) {
            return {
                providerId: provider_id,
                publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----",
                status: "ACTIVE",
            };
        }

        return null;
    }
}
