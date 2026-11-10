import { NextRequest, NextResponse, after } from "next/server";
import { runAgent, persistSignal, agentState } from "@/lib/agent";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { command, memory = true, diff = false } = await req.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "command required" }, { status: 400 });
    }
    // Memory Diff: same question, memory off vs on, nothing recorded.
    if (diff) {
      const [off, on] = await Promise.all([
        runAgent({ input: command, useMemory: false, record: false }),
        runAgent({ input: command, useMemory: true, record: false }),
      ]);
      return NextResponse.json({ diff: { off, on }, state: agentState });
    }
    const result = await runAgent({ input: command, useMemory: Boolean(memory), record: true });
    if (result.signal) after(() => persistSignal(result.signal!));
    return NextResponse.json({ result, state: agentState });
  } catch (err: any) {
    console.error("Agent error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ state: agentState });
}
