// Tatum Sui gateway client. Sui retired public JSON-RPC, so every chain read goes through
// Tatum's gRPC gateway first and only falls back to Tatum's JSON-RPC gateway if gRPC fails.
// Docs: https://docs.tatum.io/reference/sui-grpc
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const APP_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as "mainnet" | "testnet" | "devnet";
export const TATUM_NETWORK = (process.env.TATUM_NETWORK ?? APP_NETWORK) as "mainnet" | "testnet" | "devnet";
/** Wallet and DeepBook data live on the app network, so wallet reads only make sense when both match. */
export const tatumMatchesApp = TATUM_NETWORK === APP_NETWORK;

export const TATUM_GRPC_URL = process.env.TATUM_GRPC_URL ?? `sui-${TATUM_NETWORK}-grpc.gateway.tatum.io:443`;
export const TATUM_URL = process.env.TATUM_RPC_URL ?? `https://sui-${TATUM_NETWORK}.gateway.tatum.io`;
export const tatumConfigured = Boolean(process.env.TATUM_API_KEY);

let calls = 0;
let failures = 0;
export const tatumCallCount = () => calls;
export const tatumFailureCount = () => failures;

// ---------- gRPC ----------
const PROTO_ROOT = path.join(process.cwd(), "proto");
let services: { Ledger: any; State: any } | null = null;
const clients: { ledger?: any; state?: any } = {};

function loadServices() {
  if (services) return services;
  const def = protoLoader.loadSync(
    ["sui/rpc/v2/ledger_service.proto", "sui/rpc/v2/state_service.proto"].map((p) => path.join(PROTO_ROOT, p)),
    { keepCase: true, longs: String, enums: String, defaults: false, oneofs: true, includeDirs: [PROTO_ROOT] }
  );
  const pkg = (grpc.loadPackageDefinition(def) as any).sui.rpc.v2;
  services = { Ledger: pkg.LedgerService, State: pkg.StateService };
  return services;
}

function client(kind: "ledger" | "state") {
  if (!clients[kind]) {
    const { Ledger, State } = loadServices();
    const creds = process.env.TATUM_GRPC_INSECURE === "true" ? grpc.credentials.createInsecure() : grpc.credentials.createSsl();
    clients[kind] = new (kind === "ledger" ? Ledger : State)(TATUM_GRPC_URL, creds);
  }
  return clients[kind];
}

function grpcCall<T = any>(kind: "ledger" | "state", method: string, request: object, timeoutMs = 8000): Promise<T> {
  if (!process.env.TATUM_API_KEY) return Promise.reject(new Error("TATUM_API_KEY not set"));
  calls += 1;
  const meta = new grpc.Metadata();
  meta.add("x-api-key", process.env.TATUM_API_KEY);
  return new Promise<T>((resolve, reject) => {
    client(kind)[method](request, meta, { deadline: Date.now() + timeoutMs }, (err: grpc.ServiceError | null, res: T) => {
      if (err) {
        failures += 1;
        reject(new Error(`Tatum gRPC ${method} code ${err.code} ${err.details || err.message}`));
      } else resolve(res);
    });
  });
}

// ---------- JSON-RPC fallback (Tatum gateway only, never public fullnodes) ----------
let rpcId = 0;
export async function suiRpc<T = any>(method: string, params: unknown[] = []): Promise<T> {
  if (!process.env.TATUM_API_KEY) throw new Error("TATUM_API_KEY not set");
  calls += 1;
  rpcId += 1;
  const res = await fetch(TATUM_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.TATUM_API_KEY },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
    cache: "no-store",
  });
  if (!res.ok) {
    failures += 1;
    throw new Error(`Tatum JSON-RPC ${method} HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    failures += 1;
    throw new Error(`Tatum JSON-RPC ${method} ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result as T;
}

async function viaGrpcThenJson<T>(grpcFn: () => Promise<T>, jsonFn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await grpcFn();
  } catch (e1) {
    try {
      return await jsonFn();
    } catch (e2) {
      throw new Error(`${label} failed. ${(e1 as Error).message}. ${(e2 as Error).message}`);
    }
  }
}

const tsToMs = (t?: { seconds?: string; nanos?: number }) => (t?.seconds ? Number(t.seconds) * 1000 + Math.floor((t.nanos ?? 0) / 1e6) : 0);

// ---------- Reads ----------
export interface ChainStamp {
  checkpoint: number;
  timestampMs: number;
  network: string;
  source: "tatum";
}

/** Latest Sui checkpoint and its on-chain timestamp. Anchors every signal and grade to chain time. */
export async function chainStamp(): Promise<ChainStamp | null> {
  try {
    const r = await viaGrpcThenJson(
      async () => {
        const res = await grpcCall("ledger", "GetCheckpoint", { read_mask: { paths: ["sequence_number", "summary.timestamp"] } });
        return { seq: Number(res.checkpoint?.sequence_number), ms: tsToMs(res.checkpoint?.summary?.timestamp) };
      },
      async () => {
        const seq = await suiRpc<string>("sui_getLatestCheckpointSequenceNumber");
        const cp = await suiRpc<{ timestampMs: string }>("sui_getCheckpoint", [seq]);
        return { seq: Number(seq), ms: Number(cp.timestampMs) };
      },
      "chainStamp"
    );
    if (!r.seq) return null;
    return { checkpoint: r.seq, timestampMs: r.ms, network: TATUM_NETWORK, source: "tatum" };
  } catch (e) {
    console.error("chainStamp failed:", (e as Error).message);
    return null;
  }
}

export async function getSuiBalance(address: string): Promise<bigint> {
  return viaGrpcThenJson(
    async () => {
      const res = await grpcCall("state", "GetBalance", { owner: address, coin_type: "0x2::sui::SUI" });
      return BigInt(res.balance?.balance ?? "0");
    },
    async () => BigInt((await suiRpc<{ totalBalance: string }>("suix_getBalance", [address, "0x2::sui::SUI"])).totalBalance),
    "getSuiBalance"
  );
}

/** How many different coin types the wallet holds. */
export async function getCoinTypeCount(address: string): Promise<number> {
  return viaGrpcThenJson(
    async () => (await grpcCall("state", "ListBalances", { owner: address, page_size: 50 })).balances?.length ?? 0,
    async () => (await suiRpc<unknown[]>("suix_getAllBalances", [address])).length,
    "getCoinTypeCount"
  );
}

export async function getReferenceGasPrice(): Promise<string> {
  return viaGrpcThenJson(
    async () => String((await grpcCall("ledger", "GetEpoch", { read_mask: { paths: ["reference_gas_price"] } })).epoch?.reference_gas_price ?? ""),
    async () => suiRpc<string>("suix_getReferenceGasPrice"),
    "getReferenceGasPrice"
  );
}

export interface TatumHealth {
  ok: boolean;
  checkpoint?: number;
  gasPrice?: string;
  latencyMs?: number;
  protocol?: "grpc" | "json-rpc";
  network?: string;
  reason?: string;
}
let healthCache: { at: number; v: TatumHealth } | null = null;

/** Live proof the gateway works: latest checkpoint, reference gas price and round trip time. Cached 15 seconds. */
export async function tatumHealth(): Promise<TatumHealth> {
  if (!tatumConfigured) return { ok: false, reason: "no key" };
  if (healthCache && Date.now() - healthCache.at < 15_000) return healthCache.v;
  const t0 = Date.now();
  let v: TatumHealth;
  try {
    let protocol: "grpc" | "json-rpc" = "grpc";
    let seq = 0;
    try {
      const res = await grpcCall("ledger", "GetCheckpoint", { read_mask: { paths: ["sequence_number"] } });
      seq = Number(res.checkpoint?.sequence_number);
    } catch {
      protocol = "json-rpc";
      seq = Number(await suiRpc<string>("sui_getLatestCheckpointSequenceNumber"));
    }
    const gas = await getReferenceGasPrice().catch(() => undefined);
    v = { ok: true, checkpoint: seq, gasPrice: gas, latencyMs: Date.now() - t0, protocol, network: TATUM_NETWORK };
  } catch (e) {
    v = { ok: false, reason: (e as Error).message, network: TATUM_NETWORK };
  }
  healthCache = { at: Date.now(), v };
  return v;
}
