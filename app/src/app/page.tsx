"use client";

import { useState, useEffect, useRef } from "react";

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
      content: "SuiPilot online. I'm ready to trade on DeepBook. Tell me what to do — or ask me to analyze the market.",
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ command: userMsg }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "agent", content: data.result ?? data.error, timestamp: Date.now() }]);
      if (data.state) setAgentState(data.state);
    } catch {
      setMessages((m) => [...m, { role: "agent", content: "Connection error. Check your API keys.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Check the current SUI/USDC orderbook",
    "Place a small buy order at market price",
    "What's my current position?",
    "Cancel all open orders",
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #1a1a1a", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: agentState.isRunning ? "#22c55e" : "#6b7280" }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>SuiPilot</span>
          <span style={{ fontSize: 12, color: "#6b7280", background: "#1a1a1a", padding: "2px 8px", borderRadius: 20 }}>testnet</span>
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>TRADES</div>
            <div style={{ fontWeight: 600 }}>{agentState.tradeCount}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>PNL</div>
            <div style={{ fontWeight: 600, color: agentState.totalPnl >= 0 ? "#22c55e" : "#ef4444" }}>
              {agentState.totalPnl >= 0 ? "+" : ""}{agentState.totalPnl.toFixed(2)} SUI
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>POSITIONS</div>
            <div style={{ fontWeight: 600 }}>{agentState.openPositions.length}</div>
          </div>
        </div>
      </header>

      {/* Status bar */}
      <div style={{ padding: "8px 24px", background: "#111", borderBottom: "1px solid #1a1a1a", fontSize: 12, color: "#6b7280" }}>
        Last action: <span style={{ color: "#a3a3a3" }}>{agentState.lastAction}</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%", margin: "0 auto" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%",
              padding: "12px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? "#1d4ed8" : "#1a1a1a",
              border: msg.role === "agent" ? "1px solid #2a2a2a" : "none",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {msg.content}
            </div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
              {msg.role === "agent" ? "SuiPilot" : "You"} · {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div style={{ padding: "12px 16px", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "16px 16px 16px 4px", fontSize: 14, color: "#6b7280" }}>
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 2 && (
        <div style={{ padding: "0 24px 16px", maxWidth: 800, width: "100%", margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setCommand(s)}
                style={{ fontSize: 12, padding: "6px 12px", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 20, color: "#9ca3af", cursor: "pointer" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: "1px solid #1a1a1a", padding: "16px 24px", background: "#0a0a0a" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", gap: 12 }}>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendCommand()}
            placeholder="Tell SuiPilot what to do..."
            disabled={loading}
            style={{
              flex: 1,
              background: "#111",
              border: "1px solid #2a2a2a",
              borderRadius: 12,
              padding: "12px 16px",
              color: "#e5e5e5",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            onClick={sendCommand}
            disabled={loading || !command.trim()}
            style={{
              padding: "12px 20px",
              background: loading || !command.trim() ? "#1a1a1a" : "#1d4ed8",
              border: "none",
              borderRadius: 12,
              color: loading || !command.trim() ? "#4b5563" : "#fff",
              cursor: loading || !command.trim() ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
