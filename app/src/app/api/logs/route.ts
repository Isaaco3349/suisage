import { store } from "@/lib/store";

export async function GET() {
  return Response.json(store.signals);
}
