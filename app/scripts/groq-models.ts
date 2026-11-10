// Run with: npm run groq:models
const key = process.env.GROQ_API_KEY;
if (!key) { console.error("GROQ_API_KEY is not set in .env.local"); process.exit(1); }
fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } })
  .then(async (r) => {
    const j: any = await r.json();
    if (!r.ok) { console.error("Groq said", r.status, j?.error?.message ?? ""); process.exit(1); }
    const ids: string[] = (j.data ?? []).map((m: any) => m.id).filter((id: string) => !/whisper|tts|guard|embed|orpheus/i.test(id)).sort();
    console.log("Chat models your key can use");
    ids.forEach((id) => console.log("  ", id));
    console.log("\nTo force one, add GROQ_MODEL=<id> to .env.local. The app tries sensible models automatically if you leave it unset.");
  })
  .catch((e) => { console.error("Could not reach Groq", e.message); process.exit(1); });
