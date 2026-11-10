// Walrus Memory (MemWal) wrapper. Memories are written to Walrus Memory on mainnet through the relayer.
// Recall is semantic only, so every memory is "a sentence + a JSON line" and we match structure in code.
import path from "path";
import { pathToFileURL } from "url";

// The Walrus Memory SDK needs @mysten/sui 2.5 or later and @mysten/seal, while the wallet UI needs @mysten/sui 1.x.
// So the SDK lives in its own folder with its own node_modules and is loaded at runtime from there.
interface SdkClient {
  rememberAndWait(text: string, namespace?: string, opts?: { timeoutMs?: number }): Promise<{ blob_id: string }>;
  recall(params: { query: string; limit?: number; maxDistance?: number }): Promise<{ results?: { blob_id: string; text: string; distance: number }[] }>;
}
async function loadSdk(): Promise<{ MemWal: { create(cfg: any): SdkClient }; MemWalMock: { create(cfg: any): SdkClient } }> {
  const entry = path.join(process.cwd(), "memwal-runtime", "node_modules", "@mysten-incubation", "memwal", "dist", "index.js");
  return import(/* webpackIgnore: true */ pathToFileURL(entry).href);
}

export const NAMESPACE = process.env.MEMWAL_NAMESPACE ?? "suisage-recall";
export const memoryLive = Boolean(process.env.MEMWAL_PRIVATE_KEY && process.env.MEMWAL_ACCOUNT_ID);

export type MemoryData =
  | {
      kind: "LESSON";
      key: string; // pool|side|regime
      pool: string;
      side: "buy" | "sell";
      regime: string;
      outcome: "WIN" | "LOSS";
      pnlPct: number;
      entry: number;
      exit: number;
      checkpoint?: number;
      checkpointTs?: number;
      holdSec?: number;
      sim: boolean;
      ts: number;
    }
  | { kind: "SUPERSEDE"; supersedes: string; key: string; reason: string; ts: number }
  | {
      kind: "SIGNAL";
      id: string;
      pool: string;
      side: "buy" | "sell";
      entry: number;
      regime: string;
      checkpoint?: number;
      usedMemories: string[];
      ts: number;
    };

export interface ParsedMemory {
  blobId: string;
  distance: number;
  sentence: string;
  data: MemoryData;
}

const g = globalThis as unknown as { __memwal?: SdkClient };

async function client(): Promise<SdkClient> {
  if (!g.__memwal) {
    const { MemWal, MemWalMock } = await loadSdk();
    g.__memwal = memoryLive
      ? MemWal.create({
          key: process.env.MEMWAL_PRIVATE_KEY!,
          accountId: process.env.MEMWAL_ACCOUNT_ID!,
          serverUrl: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
          namespace: NAMESPACE,
        })
      : MemWalMock.create({ namespace: NAMESPACE });
  }
  return g.__memwal;
}

let writes = 0;
export const memoryWriteCount = () => writes;

export async function writeMemory(sentence: string, data: MemoryData): Promise<string> {
  const text = `${sentence}\n#json ${JSON.stringify(data)}`;
  const r = await (await client()).rememberAndWait(text, undefined, { timeoutMs: 90_000 });
  writes += 1;
  return r.blob_id;
}

function parse(text: string, blobId: string, distance: number): ParsedMemory | null {
  const i = text.indexOf("#json ");
  if (i < 0) return null;
  try {
    return { blobId, distance, sentence: text.slice(0, i).trim(), data: JSON.parse(text.slice(i + 6)) };
  } catch {
    return null; // malformed memory: ignore, never crash the agent
  }
}

export async function recallMemories(query: string, limit = 10): Promise<ParsedMemory[]> {
  const r = await (await client()).recall({ query, limit, maxDistance: 1.0 });
  const seen = new Set<string>();
  const out: ParsedMemory[] = [];
  for (const m of r.results ?? []) {
    if (seen.has(m.blob_id)) continue;
    seen.add(m.blob_id);
    const p = parse(m.text, m.blob_id, m.distance);
    if (p) out.push(p);
  }
  return out;
}

export interface LessonView extends ParsedMemory {
  retired: boolean;
  retiredBy?: string; // blob id of the SUPERSEDE memory
}

/** Lessons relevant to a query, split into active vs overturned (retired). */
export async function recallLessons(query: string): Promise<{ active: LessonView[]; retired: LessonView[] }> {
  const [found, sups] = await Promise.all([
    recallMemories(`lesson ${query}`, 12),
    recallMemories("overturned lesson superseded", 40),
  ]);
  const retiredMap = new Map<string, string>();
  for (const s of sups) if (s.data.kind === "SUPERSEDE") retiredMap.set(s.data.supersedes, s.blobId);
  const lessons = found
    .filter((m) => m.data.kind === "LESSON")
    .map((m) => ({ ...m, retired: retiredMap.has(m.blobId), retiredBy: retiredMap.get(m.blobId) }));
  return { active: lessons.filter((l) => !l.retired), retired: lessons.filter((l) => l.retired) };
}

/** Everything in the namespace we can see, for the memory panel. */
export async function recallEverything(): Promise<ParsedMemory[]> {
  const [a, b, c] = await Promise.all([
    recallMemories("lesson learned from trade outcome", 40),
    recallMemories("overturned lesson superseded", 40),
    recallMemories("signal recorded buy sell", 40),
  ]);
  const map = new Map<string, ParsedMemory>();
  for (const m of [...a, ...b, ...c]) map.set(m.blobId, m);
  return [...map.values()];
}
