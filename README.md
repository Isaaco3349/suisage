# SuiSage Recall

A DeFi copilot that remembers its mistakes and unlearns them.

Built for the Total Recall hackathon by Tatum and Walrus Memory. Track 3 Consumer Finance Apps, with entries for Best Walrus Memory.

Demo link goes here. Blog post link goes here. Video link goes here.

## The problem

Retail users get DeFi advice from chatbots that start from zero every session. They repeat the same mistake because nothing remembers that the last buy in a similar market lost money. And when an agent does store memories they only pile up. A lesson that was true last week and false today keeps steering decisions.

## What SuiSage Recall does

1. Signal. You ask for a signal. The agent reads live DeepBook v3 orderbooks, reads the wallet through the Tatum Sui RPC gateway, and recalls its past lessons from Walrus Memory on mainnet before it answers.
2. Grade. Each signal is anchored to a Sui checkpoint through Tatum. After a delay it is graded against the price move.
3. Learn. The result is written to Walrus Memory as a lesson that records a win or a loss in a specific market regime.
4. Unlearn. When new evidence contradicts an older lesson for the same setup, the agent writes a superseding memory. The old lesson is struck through, retired from recall, and the agent follows the new one.
5. Prove it. The Memory Diff button asks the same question with memory off and on, side by side. The memory on answer cites the exact memory ids that changed it.

Signals are paper signals. The agent never claims to have executed a trade.

## Why it is different

Most memory apps only append. Here memory has a lifecycle of learn, confirm and overturn. The product behavior visibly changes because of what is stored, which is what the Best Walrus Memory award asks for.

## How it uses the hackathon stack

| Requirement | Where |
|---|---|
| Walrus Memory on mainnet | app/src/lib/memory.ts using the MemWal SDK and the relayer at relayer.memory.walrus.xyz |
| 10 or more memories on mainnet | npm run seed drives the real loop and writes signals, lessons and supersedes |
| Tatum Sui gateway | app/src/lib/tatum.ts uses the Tatum gRPC gateway with the official Sui protos, because Sui retired JSON-RPC. It reads wallet balance, coin types held, reference gas price and a checkpoint stamp on every signal and grade. Lessons record how long a signal was held in chain time. A live health pill in the interface shows the latest checkpoint and round trip time |

## Architecture

```
Browser (Next.js 15)
  |  question
  v
/api/agent runs runAgent
   Tatum Sui RPC gives wallet balance, history and a checkpoint stamp
   DeepBook v3 indexer gives live orderbooks and the spread regime
   Walrus Memory recall gives active lessons and overturned lessons
   Groq llama 3.3 70b answers in JSON and cites memory ids
/api/grade runs gradeSignals
   price move since the signal
   writes a lesson to Walrus Memory
   if a contradicting lesson exists it writes a superseding memory
/api/memory returns what the agent knows, what it unlearned and the learning feed
```

Each memory is a readable sentence plus a json line, so semantic recall finds it and code can still parse it.

## Run it

```bash
cd app
cp .env.example .env.local
npm install --legacy-peer-deps
npm run dev
```

You need a Tatum API key from dashboard.tatum.io (run npm run tatum:check to confirm which Tatum gateway answers for your key), a Walrus Memory account and delegate key on mainnet from memory.walrus.xyz, a Groq key, and a funded testnet Sui key for the agent wallet. The Walrus Memory SDK needs a newer Sui library than the wallet kit uses, so it installs into its own folder called memwal-runtime. The postinstall step in package.json does this automatically when you run npm install.

Create the mainnet memories through the real loop.

```bash
DEMO_MODE=true npm run seed
```

Demo mode enables clearly labelled simulated price moves so the learning loop can be shown inside the hackathon window. Those lessons carry a simulated flag and say simulated move in their text. With demo mode off, signals are graded on the real market move after the delay set in GRADE_AFTER_MIN.

## Honest limits

DeepBook signals run on testnet while memory runs on mainnet, which is a hackathon requirement. The two are independent.

Signals waiting to be graded live in server memory while lessons persist in Walrus Memory. On a serverless host a cold start drops ungraded signals, so grade right after signalling or run on a long lived server.

Lessons are matched by pool, side and spread regime. That is deliberately simple and deterministic.

If the DeepBook indexer cannot be reached the app falls back to built in sample numbers. The interface says Sample market data when that happens. With demo mode off the agent records no signals and writes no lessons from sample data. With demo mode on it does, and those lessons are flagged as simulated. On testnet the SUI USDC pool is looked up as SUI DBUSDC first.

## What is new in the Total Recall window

This project began earlier as a DeepBook agent with Walrus testnet blob logging and a Move vault. During the build window from 20 October to 10 November 2026 the following was added.

1. Walrus Memory integration on mainnet in memory.ts, replacing testnet blob logs
2. Tatum Sui RPC gateway for all chain reads and checkpoint anchoring in tatum.ts
3. A graded learning loop that writes lessons and overturns old ones in grader.ts
4. Structured agent output with memory citations in agent.ts
5. Memory Diff, a memory vault panel and grading controls in the interface
6. A seed script, a new README and a blog post

The Move vault in the move folder is earlier work and is not part of what this submission claims.
