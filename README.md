# PROVENIQ Transit

**The Chain — Secure Custody Logistics**

Cryptographically verified chain-of-custody for physical assets with Ed25519 signature verification.

## Architecture

```
Sender → [Create Shipment] → Custody Token → [Challenge/Accept] → Carrier → ... → Recipient
    ↓                              ↓                  ↓
Anchors (Seal Events)         Ledger Events      Protect (Insurance)
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL + Prisma
- **Validation:** Zod
- **Crypto:** Ed25519 signatures
- **Port:** 3004 (frontend), DB: 5436

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with DATABASE_URL
npm run db:push
npm run dev
```

## API Endpoints

### Shipments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shipments` | Create shipment + custody token |
| `GET` | `/api/shipments` | List shipments |
| `GET` | `/api/shipments/[id]` | Get shipment details |

### Custody Transfers
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/custody/challenge` | Create handoff challenge (FROM party) |
| `POST` | `/api/custody/transfer` | Accept handoff (TO party) |

### Wallets
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/wallets` | Register wallet |
| `GET` | `/api/wallets` | List wallets |
| `GET` | `/api/wallets/[id]` | Get wallet details |
| `PATCH` | `/api/wallets/[id]` | Update wallet status |

### Anchor Integration
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/anchors/events` | Webhook for anchor events |

## Custody State Machine

```
OFFERED_FOR_PICKUP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED → CLOSED
                          ↓              ↓               ↓
                       DISPUTED ←──────────────────────────
```

## Handoff Flow

1. **Sender creates shipment** → Custody token created, state = `OFFERED_FOR_PICKUP`
2. **Sender creates challenge** → Signs challenge, specifies TO wallet
3. **Carrier accepts** → Signs acceptance, custody transfers, state = `IN_TRANSIT`
4. **Repeat for each handoff** → Chain of custody recorded
5. **Final delivery** → State = `DELIVERED`, then `CLOSED`

## Database Models

- **Wallet** — Parties in the custody chain (individuals, carriers, lockers)
- **Shipment** — Transport job with parties, route, insurance
- **CustodyToken** — Who holds the asset, state machine
- **HandoffChallenge** — Challenge/acceptance pairs with signatures
- **ShipmentEvent** — Audit trail of all events
- **AnchorEvent** — Consumed anchor signals

## Anchor Integration

| Event Type | Action |
|------------|--------|
| `ANCHOR_SEAL_ARMED` | Mark shipment as SEALED |
| `ANCHOR_SEAL_BROKEN` (TAMPER) | Mark shipment as DISPUTED |
| `ANCHOR_SEAL_BROKEN` (other) | Log event |
| `ANCHOR_ENVIRONMENTAL_ALERT` | Log event, flag risk |

## Protect Integration

When creating a shipment with `request_insurance: true`:
- Transit calls Protect `/api/quote` to get premium
- Quote ID stored on shipment
- User can bind policy separately

## Environment Variables

```env
DATABASE_URL=postgresql://...
LEDGER_API_URL=http://localhost:8006/api/v1
ANCHORS_API_URL=http://localhost:8005/api/v1
PROTECT_API_URL=http://localhost:3003/api
USE_REAL_LEDGER=false
```

## License

Proprietary — PROVENIQ Inc.
