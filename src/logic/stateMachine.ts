export enum CustodyState {
    OFFERED = "OFFERED_FOR_PICKUP",
    TRANSIT = "IN_TRANSIT",
    DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
    DISPUTED = "DISPUTED",
    CLOSED = "CLOSED",
}

const ALLOWED: Record<CustodyState, CustodyState[]> = {
    [CustodyState.OFFERED]: [CustodyState.TRANSIT, CustodyState.CLOSED],
    [CustodyState.TRANSIT]: [CustodyState.DELIVERY, CustodyState.DISPUTED],
    [CustodyState.DELIVERY]: [CustodyState.DELIVERED, CustodyState.DISPUTED],
    [CustodyState.DELIVERED]: [CustodyState.CLOSED, CustodyState.DISPUTED],
    [CustodyState.DISPUTED]: [CustodyState.CLOSED], // requires explicit resolution event in later phase
    [CustodyState.CLOSED]: [],
};

export function validateTransition(current: CustodyState, next: CustodyState): boolean {
    return ALLOWED[current].includes(next);
}
