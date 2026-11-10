"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";
import MemoryPanel, { type MemoryData } from "@/components/MemoryPanel";

interface AgentState { isRunning: boolean; lastAction: string; signals: number }
interface UsedMemory { blobId: string; sentence: string; retired: boolean }
interface RunView { reply: string; action: string; memoryOn: boolean; memoriesUsed: UsedMemory[]; retiredSeen: number }
interface Message {
  role: "user" | "agent";
  content: string;
  timestamp: number;
  used?: UsedMemory[];
  badge?: string;
  diff?: { off: RunView; on: RunView };
}

const I = {
  spark: <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8.5 11V8a3.5 3.5 0 017 0v3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  up: <path d="M5 16l5-5 3 3 6-7M14 7h5v5" />,
  down: <path d="M5 8l5 5 3-3 6 7M14 17h5v-5" />,
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
};
const Icon = ({ d, size = 24 }: { d: keyof typeof I; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{I[d]}</svg>
);

function Slab({ position }: { position: "top" | "bottom" }) {
  // Maroon field with coral slabs and wedges, after the Shelby banner.
  const top = (
    <>
      <path d="M0 0H372L694 80H0Z" />
      <path d="M2048 0H1676L1354 80H2048Z" />
      <path d="M604 0H1444L1392 36Q1372 70 1326 70H722Q676 70 656 36Z" />
    </>
  );
  return (
    <svg className={`bd ${position}`} viewBox="0 0 2048 80" preserveAspectRatio="none" aria-hidden>
      {top}
    </svg>
  );
}

export default function Home() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "agent", content: "I remember what I learn from my graded signals and I unlearn what the market disproves. Ask for a signal, grade it, then ask again", timestamp: Date.now() },
  ]);
  const [loading, setLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>({ isRunning: false, lastAction: "Idle", signals: 0 });
  const [memoryOn, setMemoryOn] = useState(true);
  const [mem, setMem] = useState<MemoryData | null>(null);
  const [grading, setGrading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const account = useCurrentAccount();
  const { isConnected } = useCurrentWallet();

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages]);
  useEffect(() => { setMounted(true); }, []);

  async function refreshMemory() {
    try {
      const res = await fetch("/api/memory");
      if (res.ok) setMem(await res.json());
    } catch {}
  }
  useEffect(() => {
    refreshMemory();
    const id = setInterval(refreshMemory, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isConnected && account) {
      const short = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
      setMessages((m) => [...m, { role: "agent", content: `Wallet connected ${short}`, timestamp: Date.now() }]);
    }
  }, [isConnected]);

  function add(m: Omit<Message, "timestamp">) {
    setMessages((prev) => [...prev, { ...m, timestamp: Date.now() }]);
  }

  async function sendCommand(diff = false) {
    if (loading || (!diff && !command.trim())) return;
    const userMsg = command.trim() || "Give me a BUY signal on SUI USDC";
    setCommand("");
    add({ role: "user", content: diff ? `${userMsg} with and without memory` : userMsg });
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: userMsg, memory: memoryOn, diff }),
      });
      const data = await res.json();
      if (data.error) add({ role: "agent", content: `Error ${data.error}` });
      else if (data.diff) add({ role: "agent", content: "Memory Diff", diff: data.diff });
      else {
        const r = data.result;
        add({ role: "agent", content: r.reply, used: r.memoriesUsed, badge: `Memory ${r.memoryOn ? "on" : "off"}  ${r.action.toUpperCase()} ${String(r.pool).replace(/_/g, " ")}` });
      }
      if (data.state) setAgentState(data.state);
      refreshMemory();
    } catch {
      add({ role: "agent", content: "Connection error" });
    } finally {
      setLoading(false);
    }
  }

  async function grade(shiftPct?: number) {
    setGrading(true);
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true, shiftPct }),
      });
      const data = await res.json();
      if (data.error) add({ role: "agent", content: `Grading error ${data.error}` });
      else add({ role: "agent", content: data.events?.length ? data.events.map((e: any) => e.text).join("\n") : "No open signals yet. Memory Diff never records a signal, so send a normal message and wait for a buy or sell answer, then grade it" });
      refreshMemory();
    } finally {
      setGrading(false);
    }
  }

  const suggestions = ["Give me a BUY signal on SUI USDC", "Give me a SELL signal on SUI USDC", "Is the DEEP SUI spread worth trading"];
  const c = mem?.counts;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap');
        :root {
          --maroon: #4b1b2a; --ink: #0c0709; --card: #140a0e; --card2: #1d1015;
          --coral: #ff8265; --mint: #00e5a0; --cream: #fbeee8; --mute: #b39a9c;
          --display: 'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif;
          --body: 'DM Sans', system-ui, sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: var(--maroon); }
        body { color: var(--cream); font-family: var(--body); min-height: 100vh; }

        .page { position: relative; min-height: 100vh; display: flex; flex-direction: column; }
        .bd { display: block; width: 100%; height: 9vh; min-height: 52px; fill: var(--coral); flex-shrink: 0; }
        .bd.top { position: absolute; top: 0; left: 0; z-index: 0; pointer-events: none; }
        .bd.bottom { margin-top: 28px; transform: scaleY(-1); pointer-events: none; }

        .shell { position: relative; z-index: 1; display: flex; flex-direction: column; width: 100%; max-width: 1240px; margin: 0 auto; padding: calc(9vh + 6px) 28px 0; gap: 18px; flex: 1; }

        .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-shrink: 0; }
        .logo-group { display: flex; align-items: center; gap: 12px; }
        .logo-mark { width: 42px; height: 42px; border-radius: 50%; background: var(--mint); color: var(--ink); display: flex; align-items: center; justify-content: center; font-family: var(--display); font-size: 20px; font-weight: 800; box-shadow: 0 0 28px rgba(0,229,160,0.35); }
        .logo-sub { font-size: 12px; color: rgba(251,238,232,0.65); }
        .logo-text { font-family: var(--display); font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .live-pill { display: flex; align-items: center; gap: 9px; background: var(--ink); border: 3px solid rgba(255,130,101,0.55); border-radius: 999px; padding: 9px 20px; font-size: 14px; font-weight: 600; }
        .live-pill i { width: 9px; height: 9px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 10px var(--mint); }
        .live-pill.off i { background: var(--coral); box-shadow: 0 0 10px var(--coral); }
        .head-right { display: flex; align-items: center; gap: 10px; }
        .net-tag { font-size: 11px; font-weight: 600; padding: 7px 12px; background: rgba(12,7,9,0.45); border-radius: 999px; color: rgba(251,238,232,0.8); }
        .wallet-area button { font-family: var(--body) !important; font-size: 13px !important; font-weight: 700 !important; background: var(--mint) !important; color: var(--ink) !important; border: none !important; border-radius: 999px !important; padding: 11px 20px !important; cursor: pointer !important; }

        .hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-shrink: 0; }
        .hero-label { font-size: 14px; color: rgba(251,238,232,0.7); margin-bottom: 2px; }
        .hero-num { font-family: var(--display); font-weight: 700; font-size: clamp(56px, 9vh, 88px); line-height: 1; letter-spacing: -3px; display: flex; align-items: baseline; gap: 12px; }
        .hero-num small { font-size: clamp(18px, 3vh, 26px); font-weight: 500; letter-spacing: -0.5px; color: rgba(251,238,232,0.6); }
        .hero-sub { font-size: 13px; color: rgba(251,238,232,0.65); margin-top: 8px; }
        .status-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .spill { display: inline-flex; align-items: center; gap: 7px; background: rgba(12,7,9,0.55); border-radius: 999px; padding: 6px 13px; font-size: 12px; font-weight: 600; }
        .spill i { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); }
        .spill.bad i { background: var(--coral); }
        .spill.bad { color: var(--coral); }
        .actions { display: flex; gap: 14px; }
        .act { white-space: nowrap; display: flex; flex-direction: column; align-items: center; gap: 8px; background: none; border: 0; color: var(--cream); font-family: var(--body); font-size: 13px; font-weight: 600; cursor: pointer; }
        .act .circle { width: 62px; height: 62px; border-radius: 50%; background: var(--ink); display: flex; align-items: center; justify-content: center; transition: transform 0.12s; }
        .act:hover:not(:disabled) .circle { transform: translateY(-2px); }
        .act.primary .circle { background: var(--mint); color: var(--ink); box-shadow: 0 0 30px rgba(0,229,160,0.4); }
        .act.on .circle { box-shadow: inset 0 0 0 2px var(--mint); color: var(--mint); }
        .act.warn .circle { color: var(--coral); }
        .act:disabled { opacity: 0.45; cursor: default; }

        .main { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 14px; align-items: start; }

        .chat { background: var(--ink); border-radius: 32px; padding: 18px 18px 16px; display: flex; flex-direction: column; min-height: 600px; }
        .messages { flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 4px 4px 16px; }
        .msg-row { display: flex; flex-direction: column; }
        .msg-row.user { align-items: flex-end; }
        .msg-meta { white-space: pre; font-size: 11px; color: var(--mute); margin-bottom: 5px; padding: 0 6px; }
        .msg-bubble { max-width: 86%; padding: 13px 17px; font-size: 14.5px; line-height: 1.6; white-space: pre-wrap; }
        .msg-row.agent .msg-bubble { background: var(--card2); border-radius: 6px 22px 22px 22px; }
        .msg-row.user .msg-bubble { background: var(--coral); color: var(--ink); font-weight: 600; border-radius: 22px 22px 6px 22px; }
        .typing { display: flex; gap: 5px; padding: 15px 18px; background: var(--card2); border-radius: 6px 22px 22px 22px; width: fit-content; }
        .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--mute); animation: bounce 1.2s ease-in-out infinite; }
        .typing span:nth-child(2) { animation-delay: 0.15s; } .typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); background: var(--mint); } }

        .cid { font-weight: 700; letter-spacing: 0.02em; margin-right: 4px; }
        .badge-line { white-space: pre; font-size: 11px; font-weight: 700; color: var(--mint); margin-top: 10px; letter-spacing: 0.04em; text-transform: uppercase; }
        .chip { font-size: 12px; line-height: 1.45; color: var(--coral); background: rgba(255,130,101,0.1); border: 1px solid rgba(255,130,101,0.28); border-radius: 12px; padding: 7px 11px; margin-top: 8px; }
        .chip.ret { color: var(--mute); text-decoration: line-through; border-color: rgba(251,238,232,0.15); background: transparent; }

        .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
        .diff-card { background: var(--card2); border-radius: 22px; padding: 16px 18px; font-size: 14px; line-height: 1.6; }
        .diff-card.on { background: var(--coral); color: var(--ink); }
        .diff-h { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mute); margin-bottom: 8px; }
        .diff-card.on .diff-h { color: rgba(12,7,9,0.65); }
        .diff-act { border-radius: 999px; padding: 3px 11px; background: rgba(251,238,232,0.1); color: var(--cream); }
        .diff-card.on .diff-act { background: var(--ink); color: var(--coral); }
        .diff-card.on .chip { background: rgba(12,7,9,0.1); border-color: rgba(12,7,9,0.2); color: var(--ink); }
        .diff-card.on .chip.ret { color: rgba(12,7,9,0.55); }

        .suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 6px 2px 12px; flex-shrink: 0; }
        .suggestion-btn { font-family: var(--body); font-size: 12.5px; font-weight: 500; padding: 8px 14px; background: var(--card2); border: 0; border-radius: 999px; color: var(--cream); cursor: pointer; }
        .suggestion-btn:hover { background: #2b1a21; }

        .input-row { display: flex; gap: 10px; align-items: center; background: var(--card2); border-radius: 999px; padding: 6px 6px 6px 22px; flex-shrink: 0; position: sticky; bottom: 12px; z-index: 2; box-shadow: 0 0 0 6px var(--ink); }
        .input-field { flex: 1; background: transparent; border: none; outline: none; color: var(--cream); font-family: var(--body); font-size: 15px; padding: 10px 0; }
        .input-field::placeholder { color: var(--mute); }
        .send-btn { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; border: 0; background: var(--mint); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .send-btn:disabled { opacity: 0.35; cursor: default; }

        @media (max-width: 960px) {
          .shell { padding-left: 16px; padding-right: 16px; }
          .main { grid-template-columns: 1fr; }
          .chat { min-height: 70vh; }
          .vault { min-height: 420px; }
          .hero { flex-direction: column; align-items: flex-start; }
          .actions { flex-wrap: wrap; gap: 14px; }
          .live-pill { display: none; }
          .diff-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="page">
      <Slab position="top" />
      <div className="shell">
        <header className="header">
          <div className="logo-group">
            <div className="logo-mark">S</div>
            <div>
              <div className="logo-sub">DeepBook copilot</div>
              <div className="logo-text">SuiSage Recall</div>
            </div>
          </div>
          <div className={`live-pill ${memoryOn ? "" : "off"}`}>
            <i />
            {memoryOn ? "Recalling before every answer" : "Memory is off"}
          </div>
          <div className="head-right">
            <span className="net-tag">Testnet signals and mainnet memory</span>
            <div className="wallet-area"><ConnectButton /></div>
          </div>
        </header>

        <section className="hero">
          <div>
            <div className="hero-label">Walrus Memory</div>
            <div className="hero-num">
              {c?.lessons ?? 0}
              <small>lessons and {c?.overturned ?? 0} overturned</small>
            </div>
            <div className="hero-sub">
              {mem ? `${c?.memories ?? 0} memories on ${mem.meta.memoryLive ? "mainnet" : "a local mock"} and ${agentState.signals} signals this session` : "Loading"}
            </div>
            {mem && (
              <div className="status-row">
                <span className={`spill ${mem.meta.tatumHealth?.ok ? "ok" : "bad"}`}>
                  <i />
                  {mem.meta.tatumHealth?.ok
                    ? `Tatum ${mem.meta.tatumHealth.network ?? ""} ${mem.meta.tatumHealth.protocol === "grpc" ? "gRPC" : "JSON RPC"} checkpoint ${mem.meta.tatumHealth.checkpoint}`
                    : mem.meta.tatum ? "Tatum offline" : "No Tatum key"}
                </span>
                {mem.meta.tatumHealth?.ok && (
                  <span className="spill ok"><i />{mem.meta.tatumHealth.latencyMs} ms gas {mem.meta.tatumHealth.gasPrice} MIST</span>
                )}
                <span className={`spill ${mem.meta.market?.source === "indexer" ? "ok" : "bad"}`}>
                  <i />
                  {mem.meta.market?.source === "indexer" ? "Live DeepBook data" : "Sample market data"}
                </span>
                <span className={`spill ${mem.meta.memoryLive ? "ok" : "bad"}`}>
                  <i />
                  {mem.meta.memoryLive ? "Walrus Memory mainnet" : "Memory mock"}
                </span>
              </div>
            )}
          </div>
          <div className="actions">
            <button className="act primary" title="Ask the same question with memory off and on" onClick={() => sendCommand(true)} disabled={loading}>
              <span className="circle"><Icon d="spark" /></span>Memory Diff
            </button>
            <button className={`act ${memoryOn ? "on" : ""}`} onClick={() => setMemoryOn((m) => !m)}>
              <span className="circle"><Icon d="lock" /></span>Memory {memoryOn ? "on" : "off"}
            </button>
            <button className="act" onClick={() => grade()} disabled={grading}>
              <span className="circle"><Icon d="check" /></span>{grading ? "Grading" : "Grade"}
            </button>
            {mem?.meta.demoMode && (
              <>
                <button className="act warn" title="Demo mode, simulates a 1.2% price rise" onClick={() => grade(1.2)} disabled={grading}>
                  <span className="circle"><Icon d="up" /></span>Simulate up
                </button>
                <button className="act warn" title="Demo mode, simulates a 1.2% price fall" onClick={() => grade(-1.2)} disabled={grading}>
                  <span className="circle"><Icon d="down" /></span>Simulate down
                </button>
              </>
            )}
          </div>
        </section>

        <div className="main">
          <section className="chat">
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i} className={`msg-row ${msg.role}`}>
                  <div className="msg-meta">
                    {msg.role === "agent" ? "SuiSage" : "You"}  {mounted ? new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                  </div>
                  {msg.diff ? (
                    <div className="diff-grid">
                      {(["off", "on"] as const).map((k) => (
                        <div key={k} className={`diff-card ${k}`}>
                          <div className="diff-h">
                            <span>Memory {k}</span>
                            <span className="diff-act">{msg.diff![k].action.toUpperCase()}</span>
                          </div>
                          <div>{msg.diff![k].reply}</div>
                          {msg.diff![k].memoriesUsed.map((m) => (
                            <div key={m.blobId} className={`chip ${m.retired ? "ret" : ""}`}><b className="cid">{m.blobId.slice(0, 8)}</b> {m.sentence.replace(/^Lesson( learned)?[.:] /, "")}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="msg-bubble">
                      {msg.content}
                      {msg.badge && <div className="badge-line">{msg.badge}</div>}
                      {msg.used?.map((m) => (
                        <div key={m.blobId} className={`chip ${m.retired ? "ret" : ""}`}>memory <b className="cid">{m.blobId.slice(0, 8)}</b> {m.sentence.replace(/^Lesson( learned)?[.:] /, "")}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="msg-row agent">
                  <div className="msg-meta">SuiSage recalling</div>
                  <div className="typing"><span /><span /><span /></div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {messages.length <= 2 && (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} className="suggestion-btn" onClick={() => setCommand(s)}>{s}</button>
                ))}
              </div>
            )}

            <div className="input-row">
              <input
                className="input-field"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendCommand(false)}
                placeholder="Ask for a signal"
                disabled={loading}
              />
              <button className="send-btn" onClick={() => sendCommand(false)} disabled={loading || !command.trim()} aria-label="Send">
                <Icon d="send" size={22} />
              </button>
            </div>
          </section>

          <MemoryPanel data={mem} />
        </div>
      </div>
      <Slab position="bottom" />
      </div>
    </>
  );
}
