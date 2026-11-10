import { NextResponse } from "next/server";
import { recallEverything, memoryLive, memoryWriteCount, NAMESPACE } from "@/lib/memory";
import { tatumCallCount, tatumFailureCount, tatumConfigured, tatumHealth, TATUM_URL } from "@/lib/tatum";
import { marketStatus } from "@/lib/deepbook";
import { store } from "@/lib/store";
import { DEMO_MODE } from "@/lib/grader";

export const maxDuration = 30;

export async function GET() {
  let all: Awaited<ReturnType<typeof recallEverything>> = [];
  try {
    all = await recallEverything();
  } catch (e) {
    console.error("memory list failed:", (e as Error).message);
  }
  const [health, market] = await Promise.all([tatumHealth(), marketStatus()]);
  const retired = new Map<string, string>();
  for (const m of all) if (m.data.kind === "SUPERSEDE") retired.set(m.data.supersedes, m.blobId);
  const lessons = all
    .filter((m) => m.data.kind === "LESSON")
    .map((m) => ({ blobId: m.blobId, sentence: m.sentence, retired: retired.has(m.blobId), retiredBy: retired.get(m.blobId) ?? null, ts: (m.data as any).ts as number }))
    .sort((a, b) => b.ts - a.ts);
  return NextResponse.json({
    meta: { memoryLive, namespace: NAMESPACE, tatum: tatumConfigured, tatumUrl: TATUM_URL, demoMode: DEMO_MODE, tatumCalls: tatumCallCount(), tatumFailures: tatumFailureCount(), memoryWrites: memoryWriteCount(), tatumHealth: health, market },
    counts: { memories: all.length, lessons: lessons.length, overturned: retired.size, pending: store.signals.filter((s) => !s.graded).length },
    lessons,
    events: [...store.events].reverse().slice(0, 30),
  });
}
