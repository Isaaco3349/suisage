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
      description: "Fetch the live orderbook bids and asks for a DeepBook trading pool.",
      parameters: {
        type: "object",
        properties: {
          pool_name: {
            type: "string",
            description: "Trading pair: SUI_USDC, DEEP_SUI, or DEEP_USDC",
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
      description: "Fetch the most recent trades executed in a DeepBook pool.",
      parameters: {
        type: "object",
        properties: {
          pool_name: {
            type: "string",
            description: "Trading pair: SUI_USDC, DEEP_SUI, or DEEP_USDC",
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
      description: "Get price and volume ticker data for all available DeepBook pools.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
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
You analyze markets on DeepBook v3, Sui's native central limit order book.

Always fetch live data using your tools before responding to market questions.
Available pools: SUI_USDC, DEEP_SUI, DEEP_USDC.
Be concise and mention specific prices, spreads, and volumes from the live data.

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
      let toolResult: string;
      try {
        const input = JSON.parse(toolCall.function.arguments);

        if (toolCall.function.name === "get_orderbook") {
          const book = await getOrderbook(input.pool_name);
          toolResult = JSON.stringify({
            pool: input.pool_name,
            bestBid: book.bestBid,
            bestAsk: book.bestAsk,
            midPrice: book.midPrice,
            spread: book.spread,
            topBids: book.bids.slice(0, 5),
            topAsks: book.asks.slice(0, 5),
          });
        } else if (toolCall.function.name === "get_recent_trades") {
          const trades = await getRecentTrades(input.pool_name);
          toolResult = JSON.stringify(trades.slice(0, 10));
        } else if (toolCall.function.name === "get_all_tickers") {
          const tickers = await getTicker();
          toolResult = JSON.stringify(tickers);
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
