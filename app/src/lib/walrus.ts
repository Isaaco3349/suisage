const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL ?? "https://aggregator.walrus-testnet.walrus.space";
const PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";

export interface TradeLog {
  poolId: string;
  side: string;
  price: number;
  quantity: number;
  digest: string;
  timestamp: number;
}

export async function logTrade(trade: TradeLog): Promise<string | null> {
  try {
    const payload = JSON.stringify(trade);
    const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=5`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Return the blob ID for later retrieval
    return data?.newlyCreated?.blobObject?.blobId ?? data?.alreadyCertified?.blobId ?? null;
  } catch {
    return null;
  }
}

export async function fetchTradeLog(blobId: string): Promise<TradeLog | null> {
  try {
    const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// In-memory log for the demo (replace with Walrus blob index in production)
const tradeLogIds: string[] = [];

export async function appendToLog(trade: TradeLog) {
  const blobId = await logTrade(trade);
  if (blobId) tradeLogIds.push(blobId);
  return blobId;
}

export function getLogIds() {
  return [...tradeLogIds];
}
