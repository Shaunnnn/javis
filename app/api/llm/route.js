// Every AI call in the app goes through here. The browser names a prompt
// from /prompts and sends its values; it never sends raw prompt text or sees the key.
import { NextResponse } from "next/server";
import { generate } from "@/lib/llm";
import { renderPrompt, PROMPTS } from "@/lib/prompts";

export const runtime = "nodejs";

const MAX_BODY = 200_000; // characters; resumes and transcripts fit well under this

export async function POST(req) {
  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, vars = {}, model = "fast", json = false, temperature } = body ?? {};
  if (!PROMPTS.includes(prompt)) return NextResponse.json({ error: "Unknown prompt" }, { status: 400 });

  let contents;
  try {
    contents = await renderPrompt(prompt, vars);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const result = await generate({ contents, model, json: Boolean(json), temperature });
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[/api/llm]", err);
    const status = err?.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "Gemini's free-tier limit was hit. Try again in a minute." : "Javis couldn't reach Gemini." },
      { status }
    );
  }
}
