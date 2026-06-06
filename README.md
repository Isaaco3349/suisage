# SuiPilot

**Autonomous DeFi agent on DeepBook — Sui Overflow 2026**

SuiPilot is an AI-powered trading agent that lives onchain on Sui. It holds its own wallet, executes limit orders on DeepBook via natural language commands, and logs every trade permanently to Walrus decentralized storage.

> Built for Sui Overflow 2026 — submitted under **Agentic Web** and **DeFi & Financial Rails** tracks.

---

## What it does

- **Natural language trading** — tell SuiPilot "buy 10 SUI at market" or "set a stop loss at 5% below entry" and it figures out the rest using Claude
- **Autonomous agent loop** — the agent uses Claude's tool-use to fetch the orderbook, reason about the market, and place/cancel orders on DeepBook v3
- **Onchain vault** — funds are held in a Move smart contract; the agent has scoped authority, the owner always retains full control
- **Configurable strategy** — set max position size, stop loss, take profit all stored onchain in a `Strategy` object
- **Permanent trade log** — every executed trade is stored on Walrus, giving a verifiable immutable history

---

## Architecture

```
User (browser)
    │
    ▼
Next.js frontend (Vercel)
    │  natural language command
    ▼
/api/agent  (Next.js API route)
    │
    ▼
Agent loop (src/lib/agent.ts)
    │  Claude claude-sonnet-4-20250514 + tool use
    ├─► get_orderbook  ──► DeepBook v3 (Sui testnet)
    ├─► place_order    ──► DeepBook v3
    └─► cancel_order   ──► DeepBook v3
                              │
                              ▼
                        Walrus (trade log blob)

Onchain (Move)
├── agent_wallet.move  — vault holding agent funds
└── strategy.move      — configurable trade parameters
```

---

## Tracks

| Track | Why SuiPilot qualifies |
|---|---|
| **Agentic Web** | Autonomous agent with its own wallet that acts, transacts, and coordinates using Sui's object model |
| **DeFi & Financial Rails** | Native DeepBook v3 integration — spot orders, configurable strategy, real financial logic |
| **Walrus (sponsored bounty)** | All trade history stored as blobs on Walrus decentralized storage |

---

## Getting started

### Prerequisites

- Node.js 20+
- [Sui CLI](https://docs.sui.io/references/cli) (`brew install sui` or download from releases)
- Anthropic API key — [console.anthropic.com](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone https://github.com/Isaaco3349/suipilot
cd suipilot/app
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY and SUI_PRIVATE_KEY
```

Generate a new Sui keypair for the agent:

```bash
sui keytool generate ed25519
# Copy the private key into SUI_PRIVATE_KEY
# Fund the address on testnet: https://faucet.sui.io
```

### 3. Deploy Move contracts

```bash
cd ../move
sui move build
sui client publish --gas-budget 100000000
# Copy the package ID into NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID
```

### 4. Run locally

```bash
cd ../app
npm run dev
# Open http://localhost:3000
```

---

## Project structure

```
suipilot/
├── move/                        # Sui smart contracts
│   ├── Move.toml
│   └── sources/
│       ├── agent_wallet.move    # Agent's onchain vault
│       └── strategy.move        # Configurable trade strategy
├── app/                         # Next.js 15 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Chat dashboard
│   │   │   └── api/agent/       # Agent API endpoint
│   │   └── lib/
│   │       ├── agent.ts         # Claude agentic loop
│   │       ├── deepbook.ts      # DeepBook order placement
│   │       ├── sui.ts           # Sui SDK client
│   │       └── walrus.ts        # Trade log storage
│   └── .env.example
└── .github/workflows/ci.yml     # Move tests + build check on push
```

---

## Live demo

🌐 [suipilot.vercel.app](https://suipilot.vercel.app)

---

## Team

Built by [@Isaaco3349](https://github.com/Isaaco3349) for Sui Overflow 2026.

---

## License

MIT
