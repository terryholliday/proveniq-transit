export declare enum CustodyState {
    OFFERED = "OFFERED_FOR_PICKUP",
    TRANSIT = "IN_TRANSIT",
    DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
    DISPUTED = "DISPUTED",
    CLOSED = "CLOSED"
}
export declare function validateTransition(current: CustodyState, next: CustodyState): boolean;
