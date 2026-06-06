import Anthropic from "@anthropic-ai/sdk";
import { placeOrder, cancelOrder, getOrderbook } from "./deepbook";
import { getBalance, getAgentKeypair } from "./sui";
import { logTrade } from "./walrus";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// Global in-memory state (replace with DB in production)
export const agentState: AgentState = {
  isRunning: false,
  lastAction: "Idle",
  openPositions: [],
  totalPnl: 0,
  tradeCount: 0,
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "place_order",
    description: "Place a limit order on DeepBook",
    input_schema: {
      type: "object" as const,
      properties: {
        poolId: { type: "string", description: "DeepBook pool ID" },
        price: { type: "number", description: "Order price" },
        quantity: { type: "number", description: "Order quantity" },
        side: { type: "string", enum: ["buy", "sell"] },
      },
      required: ["poolId", "price", "quantity", "side"],
    },
  },
  {
    name: "cancel_order",
    description: "Cancel an open order",
    input_schema: {
      type: "object" as const,
      properties: {
        poolId: { type: "string" },
        orderId: { type: "string" },
      },
      required: ["poolId", "orderId"],
    },
  },
  {
    name: "get_orderbook",
    description: "Fetch current orderbook for a pool",
    input_schema: {
      type: "object" as const,
      properties: {
        poolId: { type: "string" },
      },
      required: ["poolId"],
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

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: command.input }
  ];

  let response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  let finalResponse = "";

  // Agentic loop — handle tool calls
  while (response.stop_reason === "tool_use") {
    const toolUseBlock = response.content.find(b => b.type === "tool_use") as Anthropic.ToolUseBlock;
    if (!toolUseBlock) break;

    let toolResult: string;

    try {
      if (toolUseBlock.name === "place_order") {
        const input = toolUseBlock.input as any;
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
      } else if (toolUseBlock.name === "cancel_order") {
        const input = toolUseBlock.input as any;
        const digest = await cancelOrder(input.poolId, input.orderId);
        toolResult = `Order cancelled. Transaction digest: ${digest}`;
      } else if (toolUseBlock.name === "get_orderbook") {
        const input = toolUseBlock.input as any;
        const book = await getOrderbook(input.poolId);
        toolResult = JSON.stringify(book);
      } else {
        toolResult = "Unknown tool";
      }
    } catch (err: any) {
      toolResult = `Error: ${err.message}`;
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseBlock.id, content: toolResult }],
    });

    response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
  }

  const textBlock = response.content.find(b => b.type === "text") as Anthropic.TextBlock | undefined;
  finalResponse = textBlock?.text ?? "Done.";
  agentState.lastAction = finalResponse.slice(0, 80);
  return finalResponse;
}
