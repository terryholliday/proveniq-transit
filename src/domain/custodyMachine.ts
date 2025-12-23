
import { CustodyState, ActorRole } from './custodyState';

export interface TransitionResult {
    valid: boolean;
    error?: string;
    nextState?: CustodyState;
}

export class CustodyMachine {
    /**
     * Validate strict custody transitions.
     * Enforces the "Physical Physics" of the chain of custody.
     * 
     * @param currentState Current state of the shipment
     * @param action Attempted action
     * @param role Role of the actor attempting the action
     * @param hasSignature Whether the counterparty has signed (required for handoffs)
     */
    static validateTransition(
        currentState: CustodyState,
        nextState: CustodyState,
        role: ActorRole,
        hasSignature: boolean
    ): TransitionResult {

        // 1. CREATED -> OFFERED (Seller offers to Driver)
        if (currentState === CustodyState.CREATED && nextState === CustodyState.OFFERED) {
            if (role !== ActorRole.SELLER && role !== ActorRole.DRIVER) {
                // Driver typically "picks up" which initiates the offer/scan, or Seller "offers".
                // Let's assume Driver scan initiates "OFFERED" (Challenge).
                return { valid: true, nextState };
            }
            return { valid: true, nextState };
        }

        // 2. OFFERED -> IN_TRANSIT (Driver accepts / Seller hands off)
        // STRICT RULE: Needs signature/acceptance
        if (currentState === CustodyState.OFFERED && nextState === CustodyState.IN_TRANSIT) {
            if (!hasSignature) {
                return { valid: false, error: 'TRANSIT_HANDOFF_REQUIRES_SIGNATURE' };
            }
            return { valid: true, nextState };
        }

        // 3. IN_TRANSIT -> OFFERED (Driver offers to Buyer)
        // Actually, usually Driver -> IN_TRANSIT -> (Arrive) -> OFFERED (to Buyer)
        if (currentState === CustodyState.IN_TRANSIT && nextState === CustodyState.OFFERED) {
            if (role !== ActorRole.DRIVER) {
                return { valid: false, error: 'ONLY_DRIVER_CAN_OFFER_DELIVERY' };
            }
            return { valid: true, nextState };
        }

        // 4. OFFERED -> DELIVERED (Buyer accepts)
        // STRICT RULE: Needs Buyer Signature
        if (currentState === CustodyState.OFFERED && nextState === CustodyState.DELIVERED) {
            if (role !== ActorRole.BUYER) {
                // Or Driver submitting Buyer's signature
            }
            if (!hasSignature) {
                return { valid: false, error: 'DELIVERY_REQUIRES_BUYER_SIGNATURE' };
            }
            return { valid: true, nextState };
        }

        // 5. ANY -> DISPUTED
        if (nextState === CustodyState.DISPUTED) {
            return { valid: true, nextState };
        }

        // Default: Invalid
        return {
            valid: false,
            error: `INVALID_TRANSITION: ${currentState} -> ${nextState} by ${role}`
        };
    }
}
