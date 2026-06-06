"use client";

import { useState, useEffect, useRef } from "react";
import { ConnectButton, useCurrentAccount, useCurrentWallet } from "@mysten/dapp-kit";

interface AgentState {
  isRunning: boolean;
  lastAction: string;
  tradeCount: number;
  totalPnl: number;
  openPositions: any[];
}

interface Message {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

export default function Home() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "agent",
      content: "SuiSage online. Connect your wallet to get started, or ask me about current DeepBook market conditions.",
      timestamp: Date.now(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    lastAction: "Idle",
    tradeCount: 0,
    totalPnl: 0,
    openPositions: [],
  });
  const [time, setTime] = useState("");
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const account = useCurrentAccount();
  const { isConnected } = useCurrentWallet();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMounted(true);
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Greet user when wallet connects
  useEffect(() => {
    if (isConnected && account) {
      const short = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`;
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          content: `Wallet connected: ${short}\n\nI can now see your positions and execute trades on your behalf. What would you like to do?`,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [isConnected]);

  async function sendCommand() {
    if (!command.trim() || loading) return;
    const userMsg = command.trim();
    setCommand("");
    setMessages((m) => [...m, { role: "user", content: userMsg, timestamp: Date.now() }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: userMsg, walletAddress: account?.address }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "agent", content: data.result ?? data.error, timestamp: Date.now() }]);
      if (data.state) setAgentState(data.state);
    } catch {
      setMessages((m) => [...m, { role: "agent", content: "Connection error.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Analyze SUI/USDC market",
    "Compare pool spreads",
    "Best entry point for SUI?",
    "Current liquidity status",
  ];

  const shortAddr = account
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #040608; color: #e2e8f0; font-family: 'Syne', sans-serif; overflow: hidden; height: 100vh; }

        .bg { position: fixed; inset: 0; z-index: 0; background: radial-gradient(ellipse 80% 60% at 10% 0%, rgba(14,165,233,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 90% 100%, rgba(99,102,241,0.06) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 50% 50%, rgba(20,184,166,0.03) 0%, transparent 70%); }
        .grid-lines { position: fixed; inset: 0; z-index: 0; background-image: linear-gradient(rgba(148,163,184,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.03) 1px, transparent 1px); background-size: 48px 48px; }
        .noise { position: fixed; inset: 0; z-index: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size: 256px 256px; }

        .shell { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100vh; max-width: 1100px; margin: 0 auto; padding: 0 24px; }

        .header { display: flex; align-items: center; justify-content: space-between; padding: 20px 0 16px; border-bottom: 1px solid rgba(148,163,184,0.08); flex-shrink: 0; }
        .logo-group { display: flex; align-items: center; gap: 14px; }
        .logo-mark { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); display: flex; align-items: center; justify-content: center; font-family: 'Space Mono', monospace; font-size: 13px; font-weight: 700; color: #fff; letter-spacing: -1px; flex-shrink: 0; }
        .logo-text { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; color: #f1f5f9; }
        .logo-sub { font-family: 'Space Mono', monospace; font-size: 10px; color: #0ea5e9; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 1px; }
        .net-tag { font-family: 'Space Mono', monospace; font-size: 9px; padding: 3px 8px; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 4px; color: #818cf8; letter-spacing: 0.1em; text-transform: uppercase; }

        .header-right { display: flex; align-items: center; gap: 24px; }
        .stat { text-align: right; }
        .stat-label { font-family: 'Space Mono', monospace; font-size: 9px; color: #475569; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
        .stat-value { font-family: 'Space Mono', monospace; font-size: 14px; font-weight: 700; color: #e2e8f0; }
        .stat-value.green { color: #34d399; }

        .live-badge { display: flex; align-items: center; gap: 6px; background: rgba(14,165,233,0.08); border: 1px solid rgba(14,165,233,0.2); border-radius: 20px; padding: 5px 12px; font-family: 'Space Mono', monospace; font-size: 10px; color: #0ea5e9; letter-spacing: 0.1em; }
        .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #0ea5e9; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }

        .wallet-area { display: flex; align-items: center; gap: 10px; }
        .wallet-addr { font-family: 'Space Mono', monospace; font-size: 10px; color: #34d399; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.2); border-radius: 20px; padding: 5px 12px; }

        /* Override dapp-kit connect button */
        .wallet-area button { font-family: 'Syne', sans-serif !important; font-size: 12px !important; font-weight: 600 !important; background: linear-gradient(135deg, #0ea5e9, #6366f1) !important; border: none !important; border-radius: 8px !important; color: #fff !important; padding: 7px 14px !important; cursor: pointer !important; }

        .statusbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(148,163,184,0.05); flex-shrink: 0; }
        .status-left { font-family: 'Space Mono', monospace; font-size: 10px; color: #334155; display: flex; align-items: center; gap: 8px; }
        .status-action { color: #64748b; max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .status-right { font-family: 'Space Mono', monospace; font-size: 10px; color: #334155; }

        .messages { flex: 1; overflow-y: auto; padding: 28px 0; display: flex; flex-direction: column; gap: 20px; scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.1) transparent; }
        .messages::-webkit-scrollbar { width: 4px; }
        .messages::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.1); border-radius: 2px; }

        .msg-row { display: flex; flex-direction: column; }
        .msg-row.user { align-items: flex-end; }
        .msg-row.agent { align-items: flex-start; }
        .msg-meta { font-family: 'Space Mono', monospace; font-size: 9px; color: #334155; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; padding: 0 4px; }
        .msg-bubble { max-width: 72%; padding: 14px 18px; font-size: 14px; line-height: 1.65; white-space: pre-wrap; }
        .msg-row.user .msg-bubble { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: #fff; border-radius: 18px 18px 4px 18px; box-shadow: 0 4px 24px rgba(14,165,233,0.2); }
        .msg-row.agent .msg-bubble { background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.1); color: #cbd5e1; border-radius: 4px 18px 18px 18px; backdrop-filter: blur(12px); }

        .typing { display: flex; align-items: center; gap: 5px; padding: 14px 18px; background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.1); border-radius: 4px 18px 18px 18px; width: fit-content; backdrop-filter: blur(12px); }
        .typing span { width: 5px; height: 5px; border-radius: 50%; background: #475569; animation: bounce 1.2s ease-in-out infinite; }
        .typing span:nth-child(2) { animation-delay: 0.15s; }
        .typing span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); background: #0ea5e9; } }

        .suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 0 16px; flex-shrink: 0; }
        .suggestion-btn { font-family: 'Space Mono', monospace; font-size: 11px; padding: 7px 14px; background: rgba(15,23,42,0.6); border: 1px solid rgba(148,163,184,0.1); border-radius: 20px; color: #64748b; cursor: pointer; transition: all 0.15s; }
        .suggestion-btn:hover { border-color: rgba(14,165,233,0.3); color: #0ea5e9; background: rgba(14,165,233,0.05); }

        .input-area { border-top: 1px solid rgba(148,163,184,0.08); padding: 16px 0 20px; flex-shrink: 0; }
        .input-row { display: flex; gap: 10px; align-items: center; background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.1); border-radius: 14px; padding: 6px 6px 6px 18px; backdrop-filter: blur(12px); transition: border-color 0.15s; }
        .input-row:focus-within { border-color: rgba(14,165,233,0.3); }
        .input-field { flex: 1; background: transparent; border: none; outline: none; color: #e2e8f0; font-family: 'Syne', sans-serif; font-size: 14px; padding: 8px 0; }
        .input-field::placeholder { color: #334155; }
        .send-btn { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); border: none; border-radius: 10px; padding: 10px 20px; color: #fff; font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; flex-shrink: 0; }
        .send-btn:disabled { opacity: 0.3; cursor: default; }
        .send-btn:not(:disabled):hover { opacity: 0.85; }
      `}</style>

      <div className="bg" />
      <div className="grid-lines" />
      <div className="noise" />

      <div className="shell">
        <header className="header">
          <div className="logo-group">
            <div className="logo-mark">SS</div>
            <div>
              <div className="logo-text">SuiSage</div>
              <div className="logo-sub">DeepBook Intelligence</div>
            </div>
            <span className="net-tag">Testnet</span>
          </div>
          <div className="header-right">
            <div className="stat">
              <div className="stat-label">Trades</div>
              <div className="stat-value">{agentState.tradeCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">PNL</div>
              <div className={`stat-value ${agentState.totalPnl >= 0 ? "green" : ""}`}>
                {agentState.totalPnl >= 0 ? "+" : ""}{agentState.totalPnl.toFixed(2)} SUI
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Positions</div>
              <div className="stat-value">{agentState.openPositions.length}</div>
            </div>
            <div className="live-badge">
              <div className="live-dot" />
              {time}
            </div>
            <div className="wallet-area">
              {isConnected && shortAddr && (
                <div className="wallet-addr">● {shortAddr}</div>
              )}
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className="statusbar">
          <div className="status-left">
            <span>›</span>
            <span className="status-action">{agentState.lastAction}</span>
          </div>
          <div className="status-right">DeepBook V3 · Sui Overflow 2026</div>
        </div>

        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`msg-row ${msg.role}`}>
              <div className="msg-meta">
                {msg.role === "agent" ? "SuiSage" : "You"} · {mounted ? new Date(msg.timestamp).toLocaleTimeString() : ""}
              </div>
              <div className="msg-bubble">{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="msg-row agent">
              <div className="msg-meta">SuiSage · thinking</div>
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

        <div className="input-area">
          <div className="input-row">
            <input
              className="input-field"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendCommand()}
              placeholder="Ask SuiSage anything about the market..."
              disabled={loading}
            />
            <button className="send-btn" onClick={sendCommand} disabled={loading || !command.trim()}>
              {loading ? "Thinking..." : "Send →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
