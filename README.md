# SuiSage — DeepBook Intelligence

Autonomous AI trading agent on Sui. Natural language in, onchain actions out.

🌐 **Live demo:** [suisage.vercel.app](https://suisage.vercel.app)

> Built for Sui Overflow 2026 — submitted under **Agentic Web**, **DeFi & Financial Rails**, and **Walrus** tracks.

---

## What it does

SuiSage is an AI agent with its own Sui wallet that monitors DeepBook v3 in real time, reasons about market conditions using an LLM, and logs every decision permanently to Walrus decentralized storage.

- **Natural language trading** — "Analyze SUI/USDC market" → agent fetches live orderbook, reasons, responds with specific prices and recommendations
- **Live DeepBook data** — real-time bids, asks, mid price, spread across SUI/USDC and DEEP/SUI pools
- **Wallet connect** — connect any Sui wallet, agent reads your live balance and positions
- **Onchain trade log** — every trade signal stored as a blob on Walrus with a verifiable link shown in the UI
- **Agent vault (Move)** — smart contract for holding agent funds with scoped authority and full owner control

---

## Architecture

```
User (browser)
    │
    ▼
Next.js 15 frontend (Vercel)
    │  natural language command
    ▼
/api/agent  (Next.js API route)
    │
    ▼
Agent loop (src/lib/agent.ts)
    │  Groq LLM (llama-3.3-70b-versatile)
    │  Market data injected as context
    ├─► getOrderbook()   ──► DeepBook v3 indexer (Sui testnet)
    ├─► getTicker()      ──► DeepBook v3 indexer
    └─► maybeLogTrade()  ──► Walrus publisher (blob storage)
                                    │
                                    ▼
                         /api/logs  (blob retrieval)
                                    │
                                    ▼
                         Trade Log drawer (UI)

Onchain (Move — testnet-v1.73.1)
└── sources/agent_vault.move  — vault + trade signal events
```

---

## Tracks

**Agentic Web**
Autonomous agent with its own Sui wallet — reads live market data, reasons using LLM, emits onchain trade signals, acts without manual input.

**DeFi & Financial Rails**
Native DeepBook v3 integration — live orderbook, spread analysis, multi-pool comparison (SUI/USDC, DEEP/SUI), position management.

**Walrus (sponsored bounty)**
Every trade signal the agent emits is stored as an immutable blob on Walrus testnet — retrievable via aggregator URL, shown live in the UI.

---

## Move Contract

The `AgentVault` contract gives the agent a secure onchain home. It holds SUI, emits verifiable trade signal events, and enforces owner-only access.

```move
module suisage::agent_vault {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    public struct AgentVault has key {
        id: UID,
        owner: address,
        balance: u64,
    }

    public struct VaultCreated has copy, drop {
        vault_id: address,
        owner: address,
    }

    public struct Deposited has copy, drop {
        vault_id: address,
        amount: u64,
        new_balance: u64,
    }

    public struct Withdrawn has copy, drop {
        vault_id: address,
        amount: u64,
        new_balance: u64,
    }

    public struct TradeSignal has copy, drop {
        vault_id: address,
        pool: vector<u8>,
        side: vector<u8>,
        price_e9: u64,
        timestamp_ms: u64,
    }

    public entry fun create_vault(ctx: &mut TxContext) {
        let vault = AgentVault {
            id: object::new(ctx),
            owner: ctx.sender(),
            balance: 0,
        };
        event::emit(VaultCreated {
            vault_id: object::uid_to_address(&vault.id),
            owner: ctx.sender(),
        });
        transfer::share_object(vault);
    }

    public entry fun deposit(vault: &mut AgentVault, coin: Coin<SUI>, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        let amount = coin::value(&coin);
        vault.balance = vault.balance + amount;
        coin::put(&mut vault.id, coin);
        event::emit(Deposited {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance: vault.balance,
        });
    }

    public entry fun withdraw(vault: &mut AgentVault, amount: u64, ctx: &mut TxContext) {
        assert!(vault.owner == ctx.sender(), 0);
        assert!(vault.balance >= amount, 1);
        vault.balance = vault.balance - amount;
        let coin = coin::take(&mut vault.id, amount, ctx);
        event::emit(Withdrawn {
            vault_id: object::uid_to_address(&vault.id),
            amount,
            new_balance: vault.balance,
        });
        transfer::public_transfer(coin, ctx.sender());
    }

    public entry fun emit_trade_signal(
        vault: &AgentVault,
        pool: vector<u8>,
        side: vector<u8>,
        price_e9: u64,
        ctx: &mut TxContext
    ) {
        assert!(vault.owner == ctx.sender(), 0);
        event::emit(TradeSignal {
            vault_id: object::uid_to_address(&vault.id),
            pool,
            side,
            price_e9,
            timestamp_ms: tx_context::epoch_timestamp_ms(ctx),
        });
    }

    public fun balance(vault: &AgentVault): u64 { vault.balance }
    public fun owner(vault: &AgentVault): address { vault.owner }
}
```

> Contract written for testnet-v1.73.1. Testnet deployment pending resolution of network-level GitHub git clone restriction in build environment.

---

## Stack

- **Frontend** — Next.js 15, TypeScript, deployed on Vercel
- **AI Agent** — Groq API (llama-3.3-70b-versatile)
- **Blockchain** — Sui testnet via @mysten/sui SDK
- **DEX** — DeepBook v3 — SUI/USDC, DEEP/SUI pools
- **Storage** — Walrus testnet (blob storage for trade logs)
- **Wallet** — @mysten/dapp-kit — Sui Wallet, Slush, Suiet
- **Contracts** — Move (Edition 2024)

---

## Getting started

**Prerequisites:** Node.js 20+, Groq API key from [console.groq.com](https://console.groq.com), Sui wallet with testnet SUI from [faucet.sui.io](https://faucet.sui.io)

**1. Clone and install**

```bash
git clone https://github.com/Isaaco3349/suisage
cd suisage/app
npm install
```

**2. Configure environment**

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```
GROQ_API_KEY=gsk_...
SUI_PRIVATE_KEY=suiprivkey1...
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID=0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
```

**3. Run locally**

```bash
npm run dev
# Open http://localhost:3000
```

**4. Deploy Move contracts**

```bash
cd ../move
sui move build
sui client publish --gas-budget 100000000
```

---

## Project structure

```
suisage/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── agent_vault.move     # Agent vault + trade signal events
│       ├── agent_wallet.move    # Agent wallet management
│       └── strategy.move        # Configurable trade strategy
├── app/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Chat dashboard UI
│   │   │   └── api/
│   │   │       ├── agent/       # Agent API endpoint
│   │   │       └── logs/        # Walrus trade log retrieval
│   │   └── lib/
│   │       ├── agent.ts         # Groq agentic loop + Walrus logging
│   │       ├── deepbook.ts      # DeepBook v3 data fetching
│   │       ├── sui.ts           # Sui SDK client + keypair
│   │       └── walrus.ts        # Blob storage for trade logs
│   └── .env.example
└── README.md
```

---

## Team

Built by [@Isaaco3349](https://github.com/Isaaco3349) for Sui Overflow 2026.

---

## License

MIT
