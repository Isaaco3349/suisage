// Calls Groq with automatic model fallback, because Groq retires models without warning.
// Set GROQ_MODEL in .env.local to force one model. Run npm run groq:models to see what your key can use.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
interface ChatClient {
  chat: { completions: { create: (body: any) => Promise<any> } };
}

const CANDIDATES = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const g = globalThis as unknown as { __llmModel?: string };

const isMissingModel = (e: any) =>
  e?.status === 404 || e?.error?.error?.code === "model_not_found" || /model_not_found|does not exist|decommissioned|not supported/i.test(String(e?.message ?? ""));
const isBadRequest = (e: any) => e?.status === 400;

export async function complete(client: ChatClient, messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number } = {}) {
  const order = [g.__llmModel, process.env.GROQ_MODEL, ...CANDIDATES].filter((m, i, a): m is string => Boolean(m) && a.indexOf(m) === i);
  let lastErr: unknown;
  for (const model of order) {
    const isOss = model.startsWith("openai/gpt-oss");
    const base: any = {
      model,
      messages,
      temperature: 0.2,
      // reasoning models spend completion tokens thinking, so leave room for the answer
      max_tokens: opts.maxTokens ?? (isOss ? 1500 : 600),
      ...(isOss ? { reasoning_effort: "low" } : {}),
    };
    for (const withJson of opts.json ? [true, false] : [false]) {
      try {
        const res = await client.chat.completions.create(withJson ? { ...base, response_format: { type: "json_object" } } : base);
        const text = res.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) throw Object.assign(new Error("empty completion"), { status: 400 });
        g.__llmModel = model;
        return { text, model };
      } catch (e) {
        lastErr = e;
        if (isMissingModel(e)) break; // try the next model
        if (withJson && isBadRequest(e)) continue; // retry this model without JSON mode
        throw e; // auth, rate limit, network: surface it, another model will not help
      }
    }
  }
  throw new Error(`No Groq model worked. Last error ${(lastErr as Error)?.message ?? lastErr}. Run npm run groq:models and set GROQ_MODEL.`);
}
