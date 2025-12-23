import { CustodyTokenWire, HandoffChallengeWire } from "@proveniq/contracts";
export declare class LedgerView {
    static getChallenge(challenge_id: string): Promise<HandoffChallengeWire | null>;
    static getCustodyToken(custody_token_id: string): Promise<CustodyTokenWire | null>;
}
