import Groq from "groq-sdk";
import { placeOrder, cancelOrder, getOrderbook, getPoolSummary, getTicker, getRecentTrades } from "./deepbook";
import { getBalance, getAgentKeypair } from "./sui";
import { logTrade } from "./walrus";

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
  poolId?: string;
}

export const agentState: AgentState = {
  isRunning: false,
  lastAction: "Idle",
  openPositions: [],
  totalPnl: 0,
  tradeCount: 0,
};

const TOOLS: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_orderbook",
      description: "Fetch the live orderbook (bids and asks) for a DeepBook trading pool. Use SUI_USDC, DEEP_SUI, or DEEP_USDC as pool names.",
      parameters: {
        type: "object",
        properties: {
          pool_name: {
            type: "string",
            enum: ["SUI_USDC", "DEEP_SUI", "DEEP_USDC"],
            description: "The trading pair to fetch the orderbook for",
          },
          depth: {
            type: "number",
            description: "Number of price levels to fetch (default 10)",
          },
        },
        required: ["pool_name"],
      },
    },
  },
  
  {
    type: "function",
    function: {
      name: "get_recent_trades",
      description: "Fetch the most recent trades executed in a pool.",
      parameters: {
        type: "object",
        properties: {
          pool_name: {
            type: "string",
            enum: ["SUI_USDC", "DEEP_SUI", "DEEP_USDC"],
          },
          limit: {
            type: "number",
            description: "Number of trades to fetch (default 10)",
          },
        },
        required: ["pool_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_tickers",
      description: "Get ticker data (price, volume, frozen status) for all available DeepBook pools.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description: "Place a limit order on DeepBook",
      parameters: {
        type: "object",
        properties: {
          poolId: { type: "string", description: "DeepBook pool ID" },
          price: { type: "number", description: "Order price" },
          quantity: { type: "number", description: "Order quantity" },
          side: { type: "string", enum: ["buy", "sell"] },
        },
        required: ["poolId", "price", "quantity", "side"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_order",
      description: "Cancel an open order",
      parameters: {
        type: "object",
        properties: {
          poolId: { type: "string" },
          orderId: { type: "string" },
        },
        required: ["poolId", "orderId"],
      },
    },
  },
];

export async function runAgentCommand(command: AgentCommand): Promise<string> {
  const keypair = getAgentKeypair();
  const agentAddress = keypair.getPublicKey().toSuiAddress();
  const balance = await getBalance(agentAddress);

  const systemPrompt = `You are SuiSage, an autonomous DeFi trading agent on the Sui blockchain.
You manage a wallet at address ${agentAddress} with a balance of ${Number(balance) / 1e9} SUI.
You execute trades on DeepBook v3, Sui's native central limit order book.

You have access to LIVE market data from the DeepBook indexer. When asked about prices, orderbooks, or market conditions, always fetch fresh data using your tools before responding.

Available pools: SUI_USDC, DEEP_SUI, DEEP_USDC.

Be concise, decisive, and always explain your reasoning. When analyzing markets, mention specific prices, spreads, and volumes from the live data.

Current open positions: ${JSON.stringify(agentState.openPositions)}
Total trades executed: ${agentState.tradeCount}`;

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: command.input },
  ];

  let response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    tools: TOOLS,
    tool_choice: "auto",
    messages,
  });

  let finalResponse = "";

  while (response.choices[0].finish_reason === "tool_calls") {
    const toolCalls = response.choices[0].message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    messages.push(response.choices[0].message);

    for (const toolCall of toolCalls) {
      const input = JSON.parse(toolCall.function.arguments);
      let toolResult: string;

      try {
        if (toolCall.function.name === "get_orderbook") {
          const book = await getOrderbook(input.pool_name, input.depth ?? 10);
          toolResult = JSON.stringify({
            pool: input.pool_name,
            bestBid: book.bestBid,
            bestAsk: book.bestAsk,
            midPrice: book.midPrice,
            spread: book.spread,
            topBids: book.bids.slice(0, 5),
            topAsks: book.asks.slice(0, 5),
            timestamp: book.timestamp,
          });
        } else if (toolCall.function.name === "get_market_summary") {
          const summary = await getPoolSummary(input.pool_name);
          toolResult = summary ? JSON.stringify(summary) : "No summary data available for this pool.";
        } else if (toolCall.function.name === "get_recent_trades") {
          const trades = await getRecentTrades(input.pool_name, input.limit ?? 10);
          toolResult = JSON.stringify(trades.slice(0, 10));
        } else if (toolCall.function.name === "get_all_tickers") {
          const tickers = await getTicker();
          toolResult = JSON.stringify(tickers);
        } else if (toolCall.function.name === "place_order") {
          const digest = await placeOrder({
            poolId: input.poolId,
            price: BigInt(Math.floor(input.price * 1e9)),
            quantity: BigInt(Math.floor(input.quantity * 1e9)),
            isBid: input.side === "buy",
          });
          agentState.tradeCount++;
          agentState.lastAction = `Placed ${input.side} order — ${digest.slice(0, 8)}...`;
          await logTrade({ ...input, digest, timestamp: Date.now() });
          toolResult = `Order placed. Transaction digest: ${digest}`;
        } else if (toolCall.function.name === "cancel_order") {
          const digest = await cancelOrder(input.poolId, input.orderId);
          toolResult = `Order cancelled. Transaction digest: ${digest}`;
        } else {
          toolResult = "Unknown tool";
        }
      } catch (err: any) {
        toolResult = `Error: ${err.message}`;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }

    response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      tools: TOOLS,
      tool_choice: "auto",
      messages,
    });
  }

  finalResponse = response.choices[0].message.content ?? "Done.";
  agentState.lastAction = finalResponse.slice(0, 80);
  return finalResponse;
}
