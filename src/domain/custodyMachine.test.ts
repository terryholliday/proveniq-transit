
import { describe, it, expect } from 'vitest';
import { CustodyMachine } from './custodyMachine';
import { CustodyState, ActorRole } from './custodyState';

describe('Transit Custody Machine (Physics)', () => {

    it('should allow valid handoff with signature', () => {
        const result = CustodyMachine.validateTransition(
            CustodyState.OFFERED,
            CustodyState.IN_TRANSIT,
            ActorRole.DRIVER,
            true // Signed
        );
        expect(result.valid).toBe(true);
        expect(result.nextState).toBe(CustodyState.IN_TRANSIT);
    });

    it('should REJECT handoff without signature', () => {
        const result = CustodyMachine.validateTransition(
            CustodyState.OFFERED,
            CustodyState.IN_TRANSIT,
            ActorRole.DRIVER,
            false // Unsigned
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe('TRANSIT_HANDOFF_REQUIRES_SIGNATURE');
    });

    it('should REJECT delivery without buyer signature', () => {
        const result = CustodyMachine.validateTransition(
            CustodyState.OFFERED,
            CustodyState.DELIVERED,
            ActorRole.DRIVER, // Driver claiming delivery
            false // But no buyer signature provided
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe('DELIVERY_REQUIRES_BUYER_SIGNATURE');
    });

    it('should allow any transition to DISPUTED', () => {
        const result = CustodyMachine.validateTransition(
            CustodyState.IN_TRANSIT,
            CustodyState.DISPUTED,
            ActorRole.SYSTEM,
            false
        );
        expect(result.valid).toBe(true);
        expect(result.nextState).toBe(CustodyState.DISPUTED);
    });
});
