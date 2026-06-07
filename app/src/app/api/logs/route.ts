import { getLogIds, fetchTradeLog } from "@/lib/walrus";

export async function GET() {
  const ids = getLogIds();
  const logs = await Promise.all(ids.map(id => fetchTradeLog(id)));
  return Response.json(logs.filter(Boolean));
}