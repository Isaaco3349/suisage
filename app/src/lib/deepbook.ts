import { suiClient, getAgentKeypair } from "./sui";
import { Transaction } from "@mysten/sui/transactions";

const DEEPBOOK_PACKAGE = process.env.NEXT_PUBLIC_DEEPBOOK_PACKAGE_ID ?? "";

export interface OrderParams {
  poolId: string;
  price: bigint;
  quantity: bigint;
  isBid: boolean; // true = buy, false = sell
  expireTimestamp?: bigint;
}

export interface PoolInfo {
  poolId: string;
  baseAsset: string;
  quoteAsset: string;
  midPrice?: number;
  bestBid?: number;
  bestAsk?: number;
}

export async function placeOrder(params: OrderParams): Promise<string> {
  const keypair = getAgentKeypair();
  const tx = new Transaction();

  // DeepBook v3 place_limit_order call
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

export async function getOrderbook(poolId: string): Promise<{ bids: any[]; asks: any[] }> {
  const result = await suiClient.devInspectTransactionBlock({
    transactionBlock: new Transaction(),
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
  });
  // In production: call pool::get_level2_book_status
  return { bids: [], asks: [] };
}
