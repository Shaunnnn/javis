// Browser helpers for the app's own API routes.
export async function askLLM(body) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data.result;
}

export async function fetchJobPage(link) {
  const res = await fetch("/api/fetch-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link }),
  });
  return res.json();
}

// Streams a reply from /api/llm, calling onText with each new piece of text.
export async function streamLLM(body, onText) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Something went wrong. Try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}

// Pulls each complete object out of the reply's list of items while the JSON is
// still arriving, so items can be shown one by one. Accepts {"questions": [...]},
// any other {"key": [...]}, or a bare [...].
export function arrayItemParser() {
  let buf = "", i = 0, depth = 0, start = -1, inStr = false, esc = false;
  let listDepth = -1, done = false;
  return (chunk) => {
    const out = [];
    buf += chunk;
    for (; i < buf.length && !done; i++) {
      const c = buf[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "[" || c === "{") {
        depth++;
        if (listDepth < 0 && c === "[" && depth <= 2) listDepth = depth; // the first list at the top level
        else if (c === "{" && depth === listDepth + 1) start = i;       // an item inside that list
      } else if (c === "]" || c === "}") {
        if (c === "}" && depth === listDepth + 1 && start >= 0) {
          try { out.push(JSON.parse(buf.slice(start, i + 1))); } catch {}
          start = -1;
        }
        if (c === "]" && depth === listDepth) done = true;
        depth--;
      }
    }
    return out;
  };
}
