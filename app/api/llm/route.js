// Every AI call in the app goes through here. The browser names a prompt
// from /prompts and sends its values; it never sends raw prompt text or sees the key.
import { NextResponse } from "next/server";
import { generate, generateStream } from "@/lib/llm";
import { renderPrompt, PROMPTS } from "@/lib/prompts";
import { SCHEMAS } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 4_000_000; // Vercel's limit is 4.5 MB; images are shrunk in the browser first
const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "audio/wav"];

function validFiles(files) {
  return (
    Array.isArray(files) &&
    files.length <= 3 &&
    files.every(
      (f) => f && FILE_TYPES.includes(f.mimeType) && typeof f.data === "string" &&
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

  const { prompt, vars = {}, files = [], model = "fast", json = false, temperature, stream = false } = body ?? {};
  if (!PROMPTS.includes(prompt)) return NextResponse.json({ error: "Unknown prompt" }, { status: 400 });
  if (!validFiles(files)) return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });

  let text;
  try {
    text = await renderPrompt(prompt, vars);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const schema = SCHEMAS[prompt];
  if (stream) return streamResponse({ text, files, model, json: Boolean(json), temperature, schema }, prompt);

  try {
    const result = await generate({ text, files, model, json: Boolean(json), temperature, schema });
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[/api/llm]", err);
    return errorResponse(err);
  }
}

// Streams Gemini's reply as plain text. Errors before the first chunk return JSON
// like the normal path; an error mid-stream just ends the stream early.
async function streamResponse(opts, name) {
  const t0 = Date.now();
  const chunks = generateStream(opts);
  let first;
  try {
    first = await chunks.next();
    console.info(`[llm] ${name} (${opts.model}): first text after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error("[/api/llm stream]", err);
    return errorResponse(err);
  }
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for (let r = first; !r.done; r = await chunks.next()) controller.enqueue(encoder.encode(r.value));
      } catch (err) {
        console.error("[/api/llm stream] mid-stream", err);
      } finally {
        console.info(`[llm] ${name} (${opts.model}): finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function errorResponse(err) {
  const s = err?.status;
  const [status, error] =
    s === 429 ? [429, "Gemini's free-tier limit was hit. Try again in a minute."]
    : s === 500 || s === 503 ? [503, "Gemini is very busy right now. Give it a moment and try again."]
    : [502, "Javis couldn't reach Gemini. Try again."];
  return NextResponse.json({ error }, { status });
}
