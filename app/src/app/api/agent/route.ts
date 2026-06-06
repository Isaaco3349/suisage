import { NextRequest, NextResponse } from "next/server";
import { runAgentCommand, agentState } from "@/lib/agent";

export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ error: "command required" }, { status: 400 });
    }

    const result = await runAgentCommand({ type: "natural_language", input: command });
    return NextResponse.json({ result, state: agentState });
  } catch (err: any) {
    console.error("Agent error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ state: agentState });
}
