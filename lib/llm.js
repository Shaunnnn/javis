// Server-only. The single place that talks to the AI provider.
// Swap providers here without touching the rest of the app.
import "server-only";
import { GoogleGenAI } from "@google/genai";

export const MODELS = {
  fast: "gemini-flash-latest", // live interview
  strong: "gemini-pro-latest", // question generation, final report
};

let client;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export async function generate({ contents, model = "fast", json = false, temperature }) {
  const res = await getClient().models.generateContent({
    model: MODELS[model] ?? MODELS.fast,
    contents,
    config: {
      ...(json && { responseMimeType: "application/json" }),
      ...(temperature !== undefined && { temperature }),
    },
  });
  const text = res.text ?? "";
  return json ? JSON.parse(text) : text;
}
