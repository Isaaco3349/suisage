import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK as "testnet" | "mainnet" | "devnet") ?? "testnet";

export const suiClient = new SuiClient({ url: getFullnodeUrl(network) });

export function getAgentKeypair(): Ed25519Keypair {
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error("SUI_PRIVATE_KEY not set");
  return Ed25519Keypair.fromSecretKey(privateKey);
}

export async function getBalance(address: string, coinType = "0x2::sui::SUI") {
  const balance = await suiClient.getBalance({ owner: address, coinType });
  return BigInt(balance.totalBalance);
}

export async function getOwnedObjects(address: string) {
  const result = await suiClient.getOwnedObjects({
    owner: address,
    options: { showContent: true, showType: true },
  });
  return result.data;
}
