import { tradeLogs } from "@/lib/agent";

export async function GET() {
  return Response.json(tradeLogs);
}