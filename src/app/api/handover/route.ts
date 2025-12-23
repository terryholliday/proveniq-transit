
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CustodyMachine } from '../../../domain/custodyMachine';
import { CustodyState, ActorRole } from '../../../domain/custodyState';

// Schema for Handover Request
const HandoverSchema = z.object({
    shipmentId: z.string().uuid(),
    currentState: z.nativeEnum(CustodyState),
    precomposedState: z.nativeEnum(CustodyState), // Target state
    actorRole: z.nativeEnum(ActorRole),
    signature: z.string().min(1), // Ed25519 signature implies presence
    signerPublicKey: z.string(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = HandoverSchema.parse(body);

        // 1. Verify Signature (Mocked here, but implies crypto verification of the Intent)
        // In real impl, verify(data.shipmentId + data.precomposedState, data.signature, data.signerPublicKey)
        const isSignatureValid = true; // Placeholder for actual verify
        if (!isSignatureValid) {
            return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 });
        }

        // 2. Validate State Transition (The Brain)
        const result = CustodyMachine.validateTransition(
            data.currentState,
            data.precomposedState,
            data.actorRole,
            true // We define "hasSignature" as true if signature is present/valid
        );

        if (!result.valid) {
            return NextResponse.json({
                error: 'INVALID_TRANSITION',
                detail: result.error
            }, { status: 400 }); // Fail Loud
        }

        // 3. Execute (Write to DB/Ledger) - Stubbed
        // await db.shipments.update(...)
        // await ledger.writeEvent('TRANSIT_HANDOFF_ACCEPTED', ...)

        return NextResponse.json({
            success: true,
            newState: result.nextState
        });

    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'VALIDATION_FAILED', details: e.errors }, { status: 400 });
        }
        return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
