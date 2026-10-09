// Server-only. Loads prompt templates from /prompts and fills {placeholders}.
// No prompt text lives in app code; edit the files in /prompts instead.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const PROMPTS = ["ping", "analysis", "questions", "javis-interviewer", "scoring", "report"];

const cache = new Map();

async function loadTemplate(name) {
  if (!PROMPTS.includes(name)) throw new Error(`Unknown prompt: ${name}`);
  if (!cache.has(name) || process.env.NODE_ENV !== "production") {
    const raw = await readFile(path.join(process.cwd(), "prompts", `${name}.md`), "utf8");
    cache.set(name, raw.replace(/^\s*<!--[\s\S]*?-->\s*/, "")); // drop the header comment
  }
  return cache.get(name);
}

export async function renderPrompt(name, vars = {}) {
  const template = await loadTemplate(name);
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (!(key in vars)) throw new Error(`Prompt "${name}" needs {${key}}`);
    const v = vars[key];
    return typeof v === "string" ? v : JSON.stringify(v, null, 2);
  });
}
