// Grades signals against what the market did, writes the lesson to Walrus Memory, and OVERTURNS
// earlier lessons that the new evidence contradicts. This is the learning loop.
import { getOrderbook } from "./deepbook";
import { chainStamp } from "./tatum";
import { recallLessons, writeMemory } from "./memory";
import { store, pushEvent, type FeedEvent } from "./store";

const GRADE_AFTER_MIN = Number(process.env.GRADE_AFTER_MIN ?? 15);
export const DEMO_MODE = process.env.DEMO_MODE === "true";
const NEUTRAL_BAND_PCT = 0.05;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export async function gradeSignals(opts: { force?: boolean; shiftPct?: number } = {}): Promise<FeedEvent[]> {
  const before = store.events.length;
  const now = Date.now();
  const due = store.signals.filter((s) => !s.graded && (opts.force || now - s.ts >= GRADE_AFTER_MIN * 60_000));
  // Simulated price moves exist only so the loop can be demonstrated inside the hackathon window.
  const sim = DEMO_MODE && typeof opts.shiftPct === "number";

  for (const s of due) {
    const book = await getOrderbook(s.pool);
    if (book.source === "fallback" && !DEMO_MODE) {
      pushEvent({ type: "skip", text: `Live market data is unavailable so ${s.pool.replace(/_/g, " ")} will be graded later` });
      continue;
    }
    s.graded = true;
    const sample = Boolean(s.sample) || book.source === "fallback";
    const mid = book.midPrice ?? s.entry;
    const exit = sim ? mid * (1 + (opts.shiftPct as number) / 100) : mid;
    const pnlPct = ((s.side === "buy" ? exit - s.entry : s.entry - exit) / s.entry) * 100;

    if (Math.abs(pnlPct) < NEUTRAL_BAND_PCT) {
      pushEvent({ type: "skip", text: `${cap(s.side)} ${s.pool.replace(/_/g, " ")} moved ${Math.abs(pnlPct).toFixed(3)}% inside the noise band so nothing was learned` });
      continue;
    }
    const outcome = pnlPct > 0 ? "WIN" : "LOSS";
    const stamp = await chainStamp();
    const holdSec = stamp && s.checkpointTs ? Math.max(0, Math.round((stamp.timestampMs - s.checkpointTs) / 1000)) : undefined;
    const held = holdSec === undefined ? "" : holdSec >= 90 ? ` over ${Math.round(holdSec / 60)} minutes of chain time` : ` over ${holdSec} seconds of chain time`;
    const note = sim ? " in a simulated move" : sample ? " on sample market data" : "";
    const key = `${s.pool}|${s.side}|${s.regime}`;
    const verb = s.side === "buy" ? "buying" : "selling";
    const label = s.pool.replace(/_/g, " ");
    const keyLabel = `${label} ${s.side} ${s.regime}`;
    const abs = Math.abs(pnlPct).toFixed(2);
    const sentence = `Lesson learned. ${cap(verb)} ${label} in a ${s.regime} spread regime ${outcome === "WIN" ? "gained" : "lost"} ${abs}% from entry ${s.entry.toFixed(4)} to exit ${exit.toFixed(4)}${held}${note}. ${outcome === "WIN" ? "Repeat this setup" : "Avoid this setup"}.`;

    const prior = (await recallLessons(`${verb} ${label} ${s.regime}`).catch(() => ({ active: [], retired: [] }))).active.filter(
      (l) => l.data.kind === "LESSON" && l.data.key === key
    );

    const newBlob = await writeMemory(sentence, {
      kind: "LESSON", key, pool: s.pool, side: s.side, regime: s.regime, outcome, pnlPct: Number(pnlPct.toFixed(3)),
      entry: s.entry, exit, checkpoint: stamp?.checkpoint, checkpointTs: stamp?.timestampMs, holdSec, sim: sim || sample, ts: Date.now(),
    });

    const contradicted = prior.filter((l) => l.data.kind === "LESSON" && l.data.outcome !== outcome);
    if (contradicted.length) {
      for (const old of contradicted) {
        await writeMemory(
          `Overturned lesson ${old.blobId.slice(0, 8)} for ${keyLabel}. New evidence shows ${outcome === "WIN" ? "a gain" : "a loss"}.`,
          { kind: "SUPERSEDE", supersedes: old.blobId, key, reason: `${outcome} ${pnlPct.toFixed(2)}% contradicts earlier outcome`, ts: Date.now() }
        );
        pushEvent({ type: "overturn", text: `Overturned an old lesson for ${keyLabel} after ${outcome === "WIN" ? "a gain" : "a loss"} of ${abs}%`, blobId: newBlob, oldBlobId: old.blobId });
      }
    } else {
      pushEvent({
        type: prior.length ? "confirm" : "lesson",
        text: `${prior.length ? "Confirmed" : "Learned"} ${keyLabel} ${outcome === "WIN" ? "won" : "lost"} ${abs}%`,
        blobId: newBlob,
      });
    }
  }
  return store.events.slice(before);
}
