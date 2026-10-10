// Background worker for Javis's voice. Kokoro runs here, off the page's main thread,
// so animations (like Javis's core) stay smooth while a line is being generated.
// Plain file in /public so the bundler never touches the ML libraries.

// Safari: allow looping over download streams (same patch as lib/client/polyfills.js).
if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const iterate = async function* () {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  ReadableStream.prototype[Symbol.asyncIterator] = iterate;
  ReadableStream.prototype.values ??= iterate;
}

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let ttsPromise = null;
let queue = Promise.resolve(); // one generation at a time

function load(warmVoice) {
  ttsPromise ??= (async () => {
    const { KokoroTTS } = await import(KOKORO_URL);
    const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p?.status === "progress" && p.total) postMessage({ type: "progress", pct: Math.round((p.loaded / p.total) * 100) });
      },
    });
    // Warm-up so the first real line is quicker (queued, so it never runs alongside a real line).
    queue = queue.then(() => tts.generate("Hello.", { voice: warmVoice }).catch(() => {}));
    return tts;
  })();
  return ttsPromise;
}

// Kokoro leaves silence before and after each chunk; trim it so pauses stay natural.
function trimSilence(data, rate, threshold = 0.012, keepMs = 30) {
  const keep = Math.round((keepMs / 1000) * rate);
  let start = 0, end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  return data.slice(Math.max(0, start - keep), Math.min(data.length, end + keep));
}

onmessage = async ({ data: msg }) => {
  if (msg.type === "load") {
    try {
      await load(msg.voice);
      postMessage({ type: "ready" });
    } catch (e) {
      ttsPromise = null;
      postMessage({ type: "loadError", message: String(e?.message || e) });
    }
    return;
  }
  if (msg.type === "generate") {
    const job = queue.then(async () => {
      try {
        const tts = await load(msg.voice);
        const out = await tts.generate(msg.text, { voice: msg.voice, speed: msg.speed });
        const audio = trimSilence(out.audio, out.sampling_rate);
        postMessage({ type: "audio", id: msg.id, audio, rate: out.sampling_rate }, [audio.buffer]);
      } catch (e) {
        postMessage({ type: "error", id: msg.id, message: String(e?.message || e) });
      }
    });
    queue = job;
  }
};
