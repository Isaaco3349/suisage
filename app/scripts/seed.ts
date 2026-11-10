// Drives the REAL agent loop to build up memories on Walrus Memory mainnet.
// Usage: npm run seed            (needs MEMWAL_* + TATUM_API_KEY + GROQ_API_KEY in .env.local)
// With DEMO_MODE=true the price move is simulated and every lesson is flagged sim:true, so the loop
// can be shown inside the hackathon window. With DEMO_MODE off, signals are graded on the real move.
import { runAgent, persistSignal } from "@/lib/agent";
import { gradeSignals, DEMO_MODE } from "@/lib/grader";
import { memoryLive, memoryWriteCount } from "@/lib/memory";
import { tatumConfigured, tatumCallCount } from "@/lib/tatum";

// Signals are generated with memory OFF so the agent always answers with the side we ask for. If memory were on,
// the earlier lessons would make it answer HOLD and no signal would be recorded. Lessons are still written to
// Walrus Memory and overturned by the grader, which reads memory itself.
const PLAN: { side: "BUY" | "SELL"; shift: number }[] = [
  { side: "BUY", shift: 1.2 },   // buy WIN
  { side: "BUY", shift: -1.1 },  // buy LOSS, overturns the win
  { side: "SELL", shift: -0.9 }, // sell WIN (price fell)
  { side: "SELL", shift: 1.0 },  // sell LOSS, overturns the win
  { side: "BUY", shift: 0.9 },   // buy WIN, overturns the loss
  { side: "BUY", shift: -1.3 },  // buy LOSS, overturns the win
];

async function main() {
  if (!memoryLive) throw new Error("MEMWAL_PRIVATE_KEY / MEMWAL_ACCOUNT_ID missing: refusing to seed the mock client.");
  if (!tatumConfigured) throw new Error("TATUM_API_KEY missing.");
  console.log(`Seeding. demoMode=${DEMO_MODE}`);

  for (let i = 0; i < PLAN.length; i++) {
    let sig;
    for (let attempt = 0; attempt < 3 && !sig; attempt++) {
      const r = await runAgent({ input: `Give me a ${PLAN[i].side} signal on SUI USDC`, useMemory: false, record: true });
      console.log(`[${i + 1}] ${r.action} ${r.pool} ${r.regime} market data ${r.dataSource} memories used ${r.memoriesUsed.length}`);
      sig = r.signal;
    }
    if (!sig) { console.log("  no signal produced, skipping"); continue; }
    await persistSignal(sig);
    const events = await gradeSignals({ force: true, shiftPct: DEMO_MODE ? PLAN[i].shift : undefined });
    for (const e of events) console.log("   ", e.type, e.text);
    console.log(`   memory writes so far: ${memoryWriteCount()}, tatum calls: ${tatumCallCount()}`);
  }
  console.log("Done. Check memory.walrus.xyz dashboard and walruscan.");
}
main().catch((e) => { console.error(e); process.exit(1); });