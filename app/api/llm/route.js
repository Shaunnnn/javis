// Every AI call in the app goes through here. The browser names a prompt
// from /prompts and sends its values; it never sends raw prompt text or sees the key.
import { NextResponse } from "next/server";
import { generate } from "@/lib/llm";
import { renderPrompt, PROMPTS } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 4_000_000; // Vercel's limit is 4.5 MB; images are shrunk in the browser first
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validFiles(files) {
  return (
    Array.isArray(files) &&
    files.length <= 3 &&
    files.every(
      (f) => f && IMAGE_TYPES.includes(f.mimeType) && typeof f.data === "string" &&
        typeof f.label === "string" && f.label.length < 80
    )
  );
}

export async function POST(req) {
  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return NextResponse.json({ error: "That upload is too large. Try a smaller image." }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, vars = {}, files = [], model = "fast", json = false, temperature } = body ?? {};
  if (!PROMPTS.includes(prompt)) return NextResponse.json({ error: "Unknown prompt" }, { status: 400 });
  if (!validFiles(files)) return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });

  let text;
  try {
    text = await renderPrompt(prompt, vars);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const result = await generate({ text, files, model, json: Boolean(json), temperature });
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[/api/llm]", err);
    const status = err?.status === 429 ? 429 : 502;
    return NextResponse.json(
      { error: status === 429 ? "Gemini's free-tier limit was hit. Try again in a minute." : "Javis couldn't reach Gemini. Try again." },
      { status }
    );
  }
}
