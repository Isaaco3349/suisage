import Groq from "groq-sdk";
import { placeOrder, cancelOrder, getOrderbook } from "./deepbook";
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

// Global in-memory state
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
  {
    type: "function",
    function: {
      name: "get_orderbook",
      description: "Fetch current orderbook for a pool",
      parameters: {
        type: "object",
        properties: {
          poolId: { type: "string" },
        },
        required: ["poolId"],
      },
    },
  },
];

export async function runAgentCommand(command: AgentCommand): Promise<string> {
  const keypair = getAgentKeypair();
  const agentAddress = keypair.getPublicKey().toSuiAddress();
  const balance = await getBalance(agentAddress);

  const systemPrompt = `You are SuiPilot, an autonomous DeFi trading agent on the Sui blockchain.
You manage a wallet at address ${agentAddress} with a balance of ${Number(balance) / 1e9} SUI.
You execute trades on DeepBook, Sui's native central limit order book.
Be concise, decisive, and always explain your reasoning before taking action.
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

  // Agentic loop — handle tool calls
  while (response.choices[0].finish_reason === "tool_calls") {
    const toolCalls = response.choices[0].message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    // Add assistant message with tool calls
    messages.push(response.choices[0].message);

    // Process each tool call
    for (const toolCall of toolCalls) {
      const input = JSON.parse(toolCall.function.arguments);
      let toolResult: string;

      try {
        if (toolCall.function.name === "place_order") {
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
        } else if (toolCall.function.name === "get_orderbook") {
          const book = await getOrderbook(input.poolId);
          toolResult = JSON.stringify(book);
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

    // Continue the loop
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
