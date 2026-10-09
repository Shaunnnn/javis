// Tries to read a job posting from a link, server-side.
// Many sites (LinkedIn especially) block this; the app then asks for a screenshot.
import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BYTES = 2_000_000;
const MIN_USEFUL_CHARS = 600;
const MAX_CHARS = 15_000;

// Block requests to private/internal addresses (so the route can't be used to probe Vercel's network).
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const l = ip.toLowerCase();
  if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
  return l === "::" || l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
}

async function assertPublic(url) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
  if (url.username || url.password) throw new Error("credentials in url");
  const addrs = await dns.lookup(url.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private address");
}

async function readCapped(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) { reader.cancel(); break; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

function htmlToText(html) {
  // Job sites often embed the full posting as JSON-LD; grab that first.
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).filter((t) => /JobPosting/i.test(t)).join("\n");
  const body = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  const ldText = ld ? decodeEntities(ld.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
  return [ldText, text].filter(Boolean).join("\n\n");
}

export async function POST(req) {
  let url;
  try {
    const { link } = await req.json();
    url = new URL(String(link).trim());
  } catch {
    return NextResponse.json({ ok: false, reason: "That doesn't look like a valid link." });
  }

  try {
    let res;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-SG,en;q=0.9",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location"), url);
        continue;
      }
      break;
    }
    if (!res?.ok) throw new Error(`status ${res?.status}`);
    const type = res.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|xhtml/.test(type)) throw new Error("not a web page");

    const text = htmlToText(await readCapped(res));
    const blocked = /authwall|sign in to view|join now to see|verify you are human|captcha|enable javascript/i.test(text.slice(0, 3000));
    if (text.length < MIN_USEFUL_CHARS || (blocked && text.length < 3000)) throw new Error("blocked or empty");

    return NextResponse.json({ ok: true, text: text.slice(0, MAX_CHARS) });
  } catch (err) {
    console.warn("[/api/fetch-job]", url?.hostname, err.message);
    return NextResponse.json({ ok: false, reason: "That page couldn't be read (sites like LinkedIn block this). Upload a screenshot of the job posting instead." });
  }
}
