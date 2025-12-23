"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustodyState = void 0;
exports.validateTransition = validateTransition;
var CustodyState;
(function (CustodyState) {
    CustodyState["OFFERED"] = "OFFERED_FOR_PICKUP";
    CustodyState["TRANSIT"] = "IN_TRANSIT";
    CustodyState["DELIVERY"] = "OUT_FOR_DELIVERY";
    CustodyState["DELIVERED"] = "DELIVERED";
    CustodyState["DISPUTED"] = "DISPUTED";
    CustodyState["CLOSED"] = "CLOSED";
})(CustodyState || (exports.CustodyState = CustodyState = {}));
const ALLOWED = {
    [CustodyState.OFFERED]: [CustodyState.TRANSIT, CustodyState.CLOSED],
    [CustodyState.TRANSIT]: [CustodyState.DELIVERY, CustodyState.DISPUTED],
    [CustodyState.DELIVERY]: [CustodyState.DELIVERED, CustodyState.DISPUTED],
    [CustodyState.DELIVERED]: [CustodyState.CLOSED, CustodyState.DISPUTED],
    [CustodyState.DISPUTED]: [CustodyState.CLOSED], // requires explicit resolution event in later phase
    [CustodyState.CLOSED]: [],
};
function validateTransition(current, next) {
    return ALLOWED[current].includes(next);
}
