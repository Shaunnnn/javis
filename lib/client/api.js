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
