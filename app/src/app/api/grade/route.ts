import { NextRequest, NextResponse } from "next/server";
import { gradeSignals, DEMO_MODE } from "@/lib/grader";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shiftPct = DEMO_MODE && typeof body.shiftPct === "number" ? body.shiftPct : undefined;
    const events = await gradeSignals({ force: Boolean(body.force), shiftPct });
    return NextResponse.json({ events });
  } catch (err: any) {
    console.error("Grade error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
