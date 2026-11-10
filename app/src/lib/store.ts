// Server-side session state (signals waiting to be graded + an event feed for the UI).
// Lessons live in Walrus Memory; this only holds short-lived, not-yet-graded signals.
export interface Signal {
  id: string;
  pool: string;
  side: "buy" | "sell";
  entry: number;
  spreadBps: number;
  regime: string;
  checkpoint?: number;
  checkpointTs?: number;
  usedMemories: string[];
  ts: number;
  graded: boolean;
  signalBlobId?: string | null;
  /** true when the market numbers were the built in sample, not live DeepBook data */
  sample?: boolean;
}

export interface FeedEvent {
  ts: number;
  type: "signal" | "lesson" | "confirm" | "overturn" | "skip";
  text: string;
  blobId?: string;
  oldBlobId?: string;
}

const g = globalThis as unknown as { __sage?: { signals: Signal[]; events: FeedEvent[] } };
g.__sage ??= { signals: [], events: [] };
export const store = g.__sage;

export function pushEvent(e: Omit<FeedEvent, "ts">) {
  store.events.push({ ts: Date.now(), ...e });
  if (store.events.length > 100) store.events.shift();
}

export function regimeOf(spreadBps: number): string {
  if (spreadBps < 10) return "tight";
  if (spreadBps < 40) return "normal";
  return "wide";
}
