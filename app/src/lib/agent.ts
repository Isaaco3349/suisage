import Groq from "groq-sdk";
import { getOrderbook, getTicker, getRecentTrades } from "./deepbook";
import { getBalance, getAgentKeypair } from "./sui";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export interface AgentState {
  isRunning: boolean;
  lastAction: string;
  openPositions: Position[];
  totalPnl: number;
  tradeCount: number;
}

export interface Position {
  orderId: string;
  poolId: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  timestamp: number;
  status: "open" | "filled" | "cancelled";
}

export interface AgentCommand {
  type: "natural_language" | "direct";
  input: string;
}

export const agentState: AgentState = {
  isRunning: false,
  lastAction: "Idle",
  openPositions: [],
  totalPnl: 0,
  tradeCount: 0,
};

export async function runAgentCommand(command: AgentCommand): Promise<string> {
  const keypair = getAgentKeypair();
  const agentAddress = keypair.getPublicKey().toSuiAddress();
  const balance = await getBalance(agentAddress);

  // Fetch all market data upfront — no tool calls needed
  const [suiUsdc, deepSui, tickers] = await Promise.allSettled([
    getOrderbook("SUI_USDC"),
    getOrderbook("DEEP_SUI"),
    getTicker(),
  ]);

  const marketData = {
    SUI_USDC: suiUsdc.status === "fulfilled" ? suiUsdc.value : null,
    DEEP_SUI: deepSui.status === "fulfilled" ? deepSui.value : null,
    tickers: tickers.status === "fulfilled" ? tickers.value : {},
  };

  const systemPrompt = `You are SuiSage, an autonomous DeFi trading agent on the Sui blockchain.
You manage a wallet at address ${agentAddress} with a balance of ${Number(balance) / 1e9} SUI.
You analyze and execute trades on DeepBook v3, Sui's native central limit order book.

Here is the current live market data:

SUI/USDC Orderbook:
- Best Bid: ${marketData.SUI_USDC?.bestBid ?? "N/A"}
- Best Ask: ${marketData.SUI_USDC?.bestAsk ?? "N/A"}
- Mid Price: ${marketData.SUI_USDC?.midPrice ?? "N/A"}
- Spread: ${marketData.SUI_USDC?.spread ?? "N/A"}
- Top Bids: ${JSON.stringify(marketData.SUI_USDC?.bids?.slice(0, 3) ?? [])}
- Top Asks: ${JSON.stringify(marketData.SUI_USDC?.asks?.slice(0, 3) ?? [])}

DEEP/SUI Orderbook:
- Best Bid: ${marketData.DEEP_SUI?.bestBid ?? "N/A"}
- Best Ask: ${marketData.DEEP_SUI?.bestAsk ?? "N/A"}
- Mid Price: ${marketData.DEEP_SUI?.midPrice ?? "N/A"}

Current open positions: ${JSON.stringify(agentState.openPositions)}
Total trades executed: ${agentState.tradeCount}

Use this live data to answer the user's question. Be concise, mention specific prices and spreads.`;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: command.input },
  ];

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    messages,
  });

  const finalResponse = response.choices[0].message.content ?? "Done.";
  agentState.lastAction = finalResponse.slice(0, 80);
  return finalResponse;
}
