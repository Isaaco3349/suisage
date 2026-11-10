"use client";
import { useState } from "react";

export interface MemoryData {
  meta: {
    memoryLive: boolean; namespace: string; tatum: boolean; tatumUrl: string; demoMode: boolean;
    tatumCalls: number; tatumFailures?: number; memoryWrites: number;
    tatumHealth?: { ok: boolean; checkpoint?: number; gasPrice?: string; latencyMs?: number; reason?: string; protocol?: string; network?: string } | null;
    market?: { source: "indexer" | "fallback" };
  };
  counts: { memories: number; lessons: number; overturned: number; pending: number };
  lessons: { blobId: string; sentence: string; retired: boolean; retiredBy: string | null; ts: number }[];
  events: { ts: number; type: string; text: string; blobId?: string; oldBlobId?: string }[];
}

const scan = (id: string) => `https://walruscan.com/mainnet/blob/${id}`;
type Tab = "active" | "overturned" | "feed";

function pnlOf(sentence: string): { text: string; good: boolean } | null {
  const m = sentence.match(/(gained|lost) ([\d.]+)%/);
  if (!m) return null;
  const good = m[1] === "gained";
  return { text: `${good ? "Won" : "Lost"} ${m[2]}%`, good };
}

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const Dot = () => <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>;
const Arrow = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function MemoryPanel({ data }: { data: MemoryData | null }) {
  const [tab, setTab] = useState<Tab>("active");
  const lessons = data?.lessons ?? [];
  const active = lessons.filter((l) => !l.retired);
  const retired = lessons.filter((l) => l.retired);
  const latestOverturn = data?.events.find((e) => e.type === "overturn");
  const shown = tab === "active" ? active : retired;

  return (
    <div className="vault">
      <style>{`
        .vault { display: flex; flex-direction: column; gap: 14px; background: var(--ink); border-radius: 32px; padding: 16px; position: sticky; top: 16px; }
        .v-hero { background: var(--coral); color: var(--ink); border-radius: 24px; padding: 18px 18px 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-shrink: 0; }
        .v-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; margin-bottom: 8px; }
        .v-eyebrow i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink); display: inline-block; }
        .v-more { background: rgba(12,7,9,0.12); border-radius: 999px; padding: 2px 9px; font-weight: 700; }
        .v-title { font-family: var(--display); font-size: 21px; line-height: 1.15; font-weight: 700; letter-spacing: -0.4px; }
        .v-sub { font-size: 12px; margin-top: 6px; opacity: 0.7; }
        .v-go { flex-shrink: 0; width: 52px; height: 52px; border-radius: 50%; background: var(--ink); color: var(--coral); display: flex; align-items: center; justify-content: center; }
        .v-tabs { display: flex; gap: 4px; background: var(--card2); border-radius: 999px; padding: 5px; flex-shrink: 0; }
        .v-tab { flex: 1; border: 0; background: transparent; color: var(--mute); font-family: var(--body); font-size: 13px; font-weight: 600; padding: 9px 8px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .v-tab.on { background: #2b1a21; color: var(--cream); }
        .v-badge { background: var(--coral); color: var(--ink); border-radius: 999px; min-width: 18px; height: 18px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; }
        .v-list { max-height: 440px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; min-height: 120px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.12) transparent; }
        .v-row { display: flex; align-items: center; gap: 12px; padding: 10px 6px; }
        .v-ico { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(0,229,160,0.14); color: var(--mint); }
        .v-ico.bad { background: rgba(255,130,101,0.16); color: var(--coral); }
        .v-ico.sig { background: rgba(251,238,232,0.08); color: var(--mute); }
        .v-mid { flex: 1; min-width: 0; }
        .v-txt { font-size: 13px; line-height: 1.4; color: var(--cream); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .v-txt.struck { text-decoration: line-through; opacity: 0.5; }
        .v-meta { font-size: 11px; color: var(--mute); margin-top: 3px; }
        .v-meta a { color: var(--coral); text-decoration: none; margin-left: 6px; font-weight: 600; }
        .v-pnl { flex-shrink: 0; font-family: var(--display); font-size: 17px; font-weight: 700; color: var(--mint); }
        .v-pnl.bad { color: var(--coral); }
        .v-empty { color: var(--mute); font-size: 13px; padding: 18px 6px; line-height: 1.5; }
      `}</style>

      <div className="v-hero">
        <div>
          <div className="v-eyebrow">
            <i />
            {latestOverturn ? "The agent changed its mind" : "Waiting for its first lesson"}
            {(data?.counts.overturned ?? 0) > 1 && <span className="v-more">{(data?.counts.overturned ?? 1) - 1} more</span>}
          </div>
          <div className="v-title">
            {latestOverturn ? latestOverturn.text : "Ask for a signal, grade it, then watch memory form"}
          </div>
          <div className="v-sub">{data ? `${data.counts.memories} memories in ${data.meta.namespace.replace(/-/g, " ")}` : "Loading memory"}</div>
        </div>
        <div className="v-go"><Arrow /></div>
      </div>

      <div className="v-tabs">
        <button className={`v-tab ${tab === "active" ? "on" : ""}`} onClick={() => setTab("active")}>Knows <span className="v-badge">{active.length}</span></button>
        <button className={`v-tab ${tab === "overturned" ? "on" : ""}`} onClick={() => setTab("overturned")}>Overturned {retired.length > 0 && <span className="v-badge">{retired.length}</span>}</button>
        <button className={`v-tab ${tab === "feed" ? "on" : ""}`} onClick={() => setTab("feed")}>Feed</button>
      </div>

      <div className="v-list">
        {tab !== "feed" &&
          (shown.length ? (
            shown.map((l) => {
              const p = pnlOf(l.sentence);
              return (
                <div key={l.blobId} className="v-row">
                  <div className={`v-ico ${l.retired ? "bad" : ""}`}>{l.retired ? <Cross /> : <Check />}</div>
                  <div className="v-mid">
                    <div className={`v-txt ${l.retired ? "struck" : ""}`}>{l.sentence.replace(/^Lesson( learned)?[.:] /, "")}</div>
                    <div className="v-meta">
                      {l.blobId.slice(0, 8)}
                      <a href={scan(l.blobId)} target="_blank" rel="noopener noreferrer">View on Walruscan</a>
                    </div>
                  </div>
                  {p && <div className={`v-pnl ${p.good ? "" : "bad"}`}>{p.text}</div>}
                </div>
              );
            })
          ) : (
            <div className="v-empty">{tab === "active" ? "No lessons yet" : "Nothing overturned yet"}</div>
          ))}
        {tab === "feed" &&
          (data?.events.length ? (
            data.events.map((e, i) => (
              <div key={i} className="v-row">
                <div className={`v-ico ${e.type === "overturn" ? "bad" : e.type === "signal" || e.type === "skip" ? "sig" : ""}`}>
                  {e.type === "overturn" ? <Cross /> : e.type === "signal" || e.type === "skip" ? <Dot /> : <Check />}
                </div>
                <div className="v-mid">
                  <div className="v-txt">{e.text}</div>
                  {e.blobId && (
                    <div className="v-meta"><a style={{ marginLeft: 0 }} href={scan(e.blobId)} target="_blank" rel="noopener noreferrer">View blob</a></div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="v-empty">Nothing yet.</div>
          ))}
      </div>
    </div>
  );
}
