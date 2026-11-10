// Run with: npm run tatum:check
// Finds which Tatum Sui gateway answers for your API key, so you know what to put in .env.local
import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

const key = process.env.TATUM_API_KEY;
if (!key) {
  console.error("TATUM_API_KEY is not set in .env.local");
  process.exit(1);
}
const ROOT = path.join(process.cwd(), "proto");
const def = protoLoader.loadSync([path.join(ROOT, "sui/rpc/v2/ledger_service.proto")], {
  keepCase: true, longs: String, enums: String, defaults: false, oneofs: true, includeDirs: [ROOT],
});
const Ledger = (grpc.loadPackageDefinition(def) as any).sui.rpc.v2.LedgerService;

function tryGrpc(host: string): Promise<string> {
  return new Promise((resolve) => {
    const c = new Ledger(host, grpc.credentials.createSsl());
    const meta = new grpc.Metadata();
    meta.add("x-api-key", key!);
    c.GetCheckpoint({ read_mask: { paths: ["sequence_number"] } }, meta, { deadline: Date.now() + 8000 }, (err: any, res: any) =>
      resolve(err ? `FAIL code ${err.code} ${err.details || err.message}` : `OK checkpoint ${res.checkpoint?.sequence_number}`)
    );
  });
}
async function tryJson(url: string): Promise<string> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-api-key": key! },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sui_getLatestCheckpointSequenceNumber", params: [] }), signal: AbortSignal.timeout(8000) });
    const j: any = await r.json().catch(() => ({}));
    return j.result ? `OK checkpoint ${j.result}` : `FAIL HTTP ${r.status} ${j.error?.message ?? ""}`;
  } catch (e: any) {
    return `FAIL ${e.message}`;
  }
}

(async () => {
  const hosts = [...new Set([process.env.TATUM_GRPC_URL, "sui-testnet-grpc.gateway.tatum.io:443", "sui-mainnet-grpc.gateway.tatum.io:443"].filter(Boolean) as string[])];
  console.log("gRPC gateways");
  for (const h of hosts) console.log("  ", h.padEnd(46), await tryGrpc(h));
  console.log("JSON-RPC gateways, only a fallback");
  for (const u of ["https://sui-testnet.gateway.tatum.io", "https://sui-mainnet.gateway.tatum.io"]) console.log("  ", u.padEnd(46), await tryJson(u));
  console.log("\nSet TATUM_NETWORK and TATUM_GRPC_URL in .env.local to match the first OK line for your key.");
})();
