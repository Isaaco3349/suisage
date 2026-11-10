import { suiClient, getAgentKeypair } from "./sui";
import { Transaction } from "@mysten/sui/transactions";

// DeepBook V3 Testnet Indexer
const INDEXER = "https://deepbook-indexer.testnet.mystenlabs.com";

const DEEPBOOK_PACKAGE = process.env.NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID ?? "";

export interface OrderParams {
  poolId: string;
  price: bigint;
  quantity: bigint;
  isBid: boolean;
  expireTimestamp?: bigint;
}

export interface OrderbookData {
  timestamp: string;
  bids: [string, string][];
  asks: [string, string][];
  midPrice?: number;
  spread?: number;
  bestBid?: number;
  bestAsk?: number;
  /** indexer means live DeepBook data, fallback means the built in sample numbers */
  source: "indexer" | "fallback";
}

// On DeepBook testnet the USDC pools are named DBUSDC, so try the testnet name first.
const POOL_ALIASES: Record<string, string[]> = {
  SUI_USDC: ["SUI_DBUSDC", "SUI_USDC"],
  DEEP_SUI: ["DEEP_SUI"],
};

// Fetch live orderbook from DeepBook indexer
export async function getOrderbook(poolName: string = "SUI_USDC", depth: number = 10): Promise<OrderbookData> {
  try {
    let data: any = null;
    let lastErr = "no pool candidates";
    for (const name of POOL_ALIASES[poolName] ?? [poolName]) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${INDEXER}/orderbook/${name}?level=2&depth=${depth}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
        const json = await res.json();
        if (!(json.bids?.length || json.asks?.length)) throw new Error(`empty book for ${name}`);
        data = json;
        break;
      } catch (e: any) {
        lastErr = e.message;
      }
    }
    if (!data) throw new Error(lastErr);

    const bids: [string, string][] = data.bids ?? [];
    const asks: [string, string][] = data.asks ?? [];
    const bestBid = bids.length > 0 ? parseFloat(bids[0][0]) : undefined;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0][0]) : undefined;
    const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined;
    const spread = bestBid && bestAsk ? bestAsk - bestBid : undefined;

    return { timestamp: Date.now().toString(), bids, asks, midPrice, spread, bestBid, bestAsk, source: "indexer" };
  } catch (err: any) {
    console.error("getOrderbook failed:", err.message);
    // Fallback: return mock testnet data so the agent can still reason
    return {
      timestamp: Date.now().toString(),
      bids: [["3.245", "1500"], ["3.240", "3200"], ["3.235", "800"]],
      asks: [["3.250", "2100"], ["3.255", "4500"], ["3.260", "1200"]],
      midPrice: 3.2475,
      spread: 0.005,
      bestBid: 3.245,
      bestAsk: 3.250,
      source: "fallback",
    };
  }
}

// Get pool list and basic info
export async function getAllPools() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${INDEXER}/get_pools`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return [];
  }
}

// Get recent trades
export async function getRecentTrades(poolName: string = "SUI_USDC", limit: number = 10) {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${INDEXER}/trades/${poolName}?limit=${limit}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return [];
  }
}

// Get ticker data
export async function getTicker() {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${INDEXER}/ticker`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return {};
  }
}

// Get pool summary
export async function getPoolSummary(poolName: string = "SUI_USDC") {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${INDEXER}/summary`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data.find((p: any) => p.trading_pairs === poolName) ?? null : null;
  } catch {
    return null;
  }
}

// Place a limit order on DeepBook
export async function placeOrder(params: OrderParams): Promise<string> {
  const keypair = getAgentKeypair();
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
    arguments: [
      tx.object(params.poolId),
      tx.pure.u64(params.price),
      tx.pure.u64(params.quantity),
      tx.pure.bool(params.isBid),
      tx.pure.u64(params.expireTimestamp ?? BigInt(Date.now() + 3600_000)),
    ],
  });
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });
  return result.digest;
}

// Cancel an order
export async function cancelOrder(poolId: string, orderId: string): Promise<string> {
  const keypair = getAgentKeypair();
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::cancel_order`,
    arguments: [tx.object(poolId), tx.pure.u128(BigInt(orderId))],
  });
  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });
  return result.digest;
}

// Cached market status for the interface, so polling does not hammer the indexer
let marketCache: { at: number; source: "indexer" | "fallback" } | null = null;
export async function marketStatus(): Promise<{ source: "indexer" | "fallback" }> {
  if (marketCache && Date.now() - marketCache.at < 20_000) return { source: marketCache.source };
  const book = await getOrderbook("SUI_USDC", 3);
  marketCache = { at: Date.now(), source: book.source };
  return { source: book.source };
}
