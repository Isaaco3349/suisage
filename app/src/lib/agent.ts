import Groq from "groq-sdk";
import { getOrderbook } from "./deepbook";
import { getAgentKeypair } from "./sui";
import { getSuiBalance, chainStamp, getCoinTypeCount, getReferenceGasPrice, tatumConfigured, tatumMatchesApp } from "./tatum";
import { DEMO_MODE } from "./grader";
import { complete } from "./llm";
import { recallLessons, writeMemory, memoryLive, type LessonView } from "./memory";
import { store, pushEvent, regimeOf, type Signal } from "./store";

let _groq: Groq | null = null;
const getGroq = () => (_groq ??= new Groq({ apiKey: process.env.GROQ_API_KEY }));

export interface AgentState {
  isRunning: boolean;
  lastAction: string;
  signals: number;
}
export const agentState: AgentState = { isRunning: false, lastAction: "Idle", signals: 0 };

export interface UsedMemory {
  blobId: string;
  sentence: string;
  retired: boolean;
}
export interface AgentResult {
  reply: string;
  action: "buy" | "sell" | "hold" | "none";
  pool: string;
  regime: string;
  memoryOn: boolean;
  memoriesUsed: UsedMemory[];
  retiredSeen: number;
  signal?: Signal;
  dataSource: "indexer" | "fallback";
  wallet: { address: string; sui: number | null; coinTypes: number | null; via: "tatum" | "unavailable"; gasPrice: string | null };
}

async function walletSnapshot(address: string): Promise<AgentResult["wallet"]> {
  // Chain reads must never crash the agent. If Tatum is unavailable the agent simply reasons without wallet data.
  const out: AgentResult["wallet"] = { address, sui: null, coinTypes: null, via: "unavailable", gasPrice: null };
  if (!tatumConfigured) return out;
  const gas = await getReferenceGasPrice().catch(() => null);
  out.gasPrice = gas;
  if (gas) out.via = "tatum";
  if (tatumMatchesApp) {
    const [bal, coins] = await Promise.all([getSuiBalance(address).catch(() => null), getCoinTypeCount(address).catch(() => null)]);
    if (bal !== null) {
      out.sui = Number(bal) / 1e9;
      out.via = "tatum";
    }
    out.coinTypes = coins;
  }
  return out;
}

function lessonLine(l: LessonView) {
  return `memory ${l.blobId.slice(0, 8)}. ${l.sentence}${l.retired ? " This lesson was overturned so do not follow it." : ""}`;
}

export async function runAgent(opts: { input: string; useMemory: boolean; record: boolean }): Promise<AgentResult> {
  const address = getAgentKeypair().getPublicKey().toSuiAddress();
  const [wallet, suiUsdc, deepSui] = await Promise.all([
    walletSnapshot(address),
    getOrderbook("SUI_USDC"),
    getOrderbook("DEEP_SUI"),
  ]);

  const sample = suiUsdc.source === "fallback";
  const mid = suiUsdc.midPrice ?? 0;
  const spreadBps = mid && suiUsdc.spread ? (suiUsdc.spread / mid) * 1e4 : 0;
  const regime = regimeOf(spreadBps);

  // 1. RECALL: what has this agent learned (and unlearned) from Walrus Memory?
  let active: LessonView[] = [];
  let retired: LessonView[] = [];
  if (opts.useMemory) {
    try {
      const r = await recallLessons(`${opts.input} SUI USDC ${regime} spread`);
      active = r.active.slice(0, 5);
      retired = r.retired.slice(0, 3);
    } catch (e) {
      console.error("recall failed:", (e as Error).message);
    }
  }
  const memBlock = opts.useMemory
    ? active.length + retired.length
      ? [...active, ...retired].map(lessonLine).join("\n")
      : "No lessons stored yet. You are a rookie."
    : "MEMORY DISABLED. You have no knowledge of your past trades.";

  const system = `You are SuiSage Recall, a DeFi copilot on Sui DeepBook that learns from its own graded trades.
Wallet ${address}: ${wallet.sui !== null ? `${wallet.sui.toFixed(3)} SUI${wallet.coinTypes !== null ? ` across ${wallet.coinTypes} coin types` : ""}, read through Tatum` : "balance unavailable right now, do not guess it"}.

MARKET DATA ${sample ? "IS A BUILT IN SAMPLE because the live DeepBook indexer could not be reached. Say clearly that these numbers are sample data and never present them as live." : "is live from the DeepBook indexer."}
${wallet.gasPrice ? `Network reference gas price ${wallet.gasPrice} MIST, read through Tatum.` : ""}
SUI USDC pool bid ${suiUsdc.bestBid ?? "N/A"} ask ${suiUsdc.bestAsk ?? "N/A"} mid ${suiUsdc.midPrice ?? "N/A"} spread ${spreadBps.toFixed(1)} bps (regime: ${regime})
DEEP/SUI bid ${deepSui.bestBid ?? "N/A"} ask ${deepSui.bestAsk ?? "N/A"}

LESSONS FROM YOUR PAST TRADES (Walrus Memory):
${memBlock}

RULES
- If an active lesson matches the current setup (same pool, side, regime), it outranks your instinct. Follow it and cite it by writing the word memory followed by its id, for example memory a1b2c3d4.
- Never follow a lesson that was overturned.
- Write plainly. No hyphens, slashes, parentheses, semicolons or brackets in the reply. Write pair names like SUI USDC.
- Respond ONLY with JSON {"reply": string of 2 to 4 sentences, "action": "buy" or "sell" or "hold", "pool": "SUI_USDC" or "DEEP_SUI", "used": array of the ids you relied on}.
- If the user explicitly asks for a buy signal or a sell signal and the market data is live, issue exactly that action and put the risks in the reply, unless an active lesson says to avoid that exact setup. In that case answer hold and cite the lesson. If the user only asks what to do, use hold when you see no real edge.
- Paper signals only. Never claim a trade was executed.`;

  const { text } = await complete(
    getGroq() as any,
    [
      { role: "system", content: system },
      { role: "user", content: opts.input },
    ],
    { json: true }
  );

  let parsed: { reply?: string; action?: string; pool?: string; used?: string[] } = {};
  try {
    // some models wrap JSON in text or code fences, so pull out the first object
    const m = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text);
  } catch {
    parsed = { reply: text.trim() || "Done", action: "hold" };
  }
  const action = (["buy", "sell", "hold"].includes(parsed.action ?? "") ? parsed.action : "hold") as AgentResult["action"];
  const pool = parsed.pool === "DEEP_SUI" ? "DEEP_SUI" : "SUI_USDC";
  const reply = parsed.reply ?? "Done.";

  const fromText = [...reply.matchAll(/memory ([0-9A-Za-z_-]{8})/g)].map((m) => m[1]);
  const citedPrefixes = new Set([...(parsed.used ?? []).map((u) => String(u).replace(/[\[\]]/g, "").slice(0, 8)), ...fromText]);
  const memoriesUsed: UsedMemory[] = [...active, ...retired]
    .filter((l) => citedPrefixes.has(l.blobId.slice(0, 8)))
    .map((l) => ({ blobId: l.blobId, sentence: l.sentence, retired: l.retired }));

  const result: AgentResult = {
    reply,
    action,
    pool,
    regime,
    dataSource: suiUsdc.source,
    memoryOn: opts.useMemory,
    memoriesUsed,
    retiredSeen: retired.length,
    wallet,
  };

  // 2. SIGNAL: anchor to a Sui checkpoint through Tatum, remember who influenced it.
  if (opts.record && sample && !DEMO_MODE && (action === "buy" || action === "sell")) {
    pushEvent({ type: "skip", text: "Market data is a sample right now so no signal was recorded" });
  } else if (opts.record && (action === "buy" || action === "sell")) {
    const book = pool === "SUI_USDC" ? suiUsdc : deepSui;
    const entry = (action === "buy" ? book.bestAsk : book.bestBid) ?? 0;
    if (entry) {
      const stamp = await chainStamp();
      const signal: Signal = {
        id: `sig_${Date.now().toString(36)}`,
        pool,
        side: action,
        entry,
        spreadBps,
        regime,
        checkpoint: stamp?.checkpoint,
        checkpointTs: stamp?.timestampMs,
        usedMemories: memoriesUsed.map((m) => m.blobId),
        ts: Date.now(),
        graded: false,
        sample,
      };
      store.signals.push(signal);
      agentState.signals += 1;
      pushEvent({ type: "signal", text: `${action === "buy" ? "Buy" : "Sell"} ${pool.replace(/_/g, " ")} at ${entry.toFixed(4)} in a ${regime} spread${stamp ? ` at checkpoint ${stamp.checkpoint}` : ""}` });
      result.signal = signal;
    }
  }
  agentState.lastAction = reply.slice(0, 80);
  return result;
}

/** Persist the signal itself as a memory (audit trail). Called after the response is sent. */
export async function persistSignal(s: Signal) {
  try {
    s.signalBlobId = await writeMemory(
      `Signal issued. The agent said ${s.side} on ${s.pool.replace(/_/g, " ")} at ${s.entry.toFixed(4)} in a ${s.regime} spread regime.`,
      { kind: "SIGNAL", id: s.id, pool: s.pool, side: s.side, entry: s.entry, regime: s.regime, checkpoint: s.checkpoint, usedMemories: s.usedMemories, ts: s.ts }
    );
  } catch (e) {
    console.error("persistSignal failed:", (e as Error).message);
  }
}

export { memoryLive };
