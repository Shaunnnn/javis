// Javis's voice in the browser: Kokoro text-to-speech plus the Web Audio "AI system" effect.
// Runs fully on the device; the model (~90 MB) downloads once and is then cached by the browser.
import { VOICE } from "@/lib/voice-config";

// Kokoro runs in a background worker (public/tts-worker.mjs) so the page never freezes.
let worker = null;
let readyPromise = null;
let nextId = 0;
const pending = new Map();
const progressListeners = new Set();

function getWorker() {
  if (worker) return worker;
  worker = new Worker("/tts-worker.mjs", { type: "module" });
  worker.onmessage = ({ data: m }) => {
    if (m.type === "progress") progressListeners.forEach((fn) => fn(m.pct));
    else if (m.type === "audio" || m.type === "error") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (!p) return;
      m.type === "audio" ? p.resolve(m) : p.reject(new Error(m.message));
    }
  };
  return worker;
}

export function loadVoice(onProgress) {
  if (onProgress) progressListeners.add(onProgress);
  readyPromise ??= new Promise((resolve, reject) => {
    const w = getWorker();
    const onMsg = ({ data: m }) => {
      if (m.type === "ready") { w.removeEventListener("message", onMsg); resolve(); }
      if (m.type === "loadError") { w.removeEventListener("message", onMsg); readyPromise = null; reject(new Error(m.message)); }
    };
    w.addEventListener("message", onMsg);
    w.onerror = (e) => { readyPromise = null; reject(new Error(e.message || "Voice worker failed to start")); };
    w.postMessage({ type: "load", voice: VOICE.defaultVoice });
  });
  return readyPromise;
}

function generate(text, voice, speed) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "generate", id, text, voice, speed });
  });
}

let ctx = null;

// Must be called from a tap/click the first time (iPhone won't play audio otherwise).
export function audioContext() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Groups sentences into chunks big enough that each one plays for longer than the next takes to
// generate, so there are no gaps. Kokoro reads a multi-sentence chunk with its own natural pauses.
function chunkText(text, firstMin = 8, restMin = 14) {
  const chunks = [];
  let cur = "";
  for (const sentence of splitSentences(text)) {
    cur = cur ? `${cur} ${sentence}` : sentence;
    const words = cur.split(/\s+/).length;
    if (words >= (chunks.length ? restMin : firstMin)) { chunks.push(cur); cur = ""; }
  }
  if (cur) {
    // A short leftover joins the previous chunk instead of standing alone.
    if (chunks.length && cur.split(/\s+/).length < 8) chunks[chunks.length - 1] += ` ${cur}`;
    else chunks.push(cur);
  }
  return chunks;
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}


// One chunk -> AudioBuffer (generated in the worker, silence already trimmed there).
async function sentenceBuffer(sentence, voice) {
  await loadVoice();
  const shape = sentence.endsWith("?") && sentence.split(" ").length <= 12 ? VOICE.questionSpeed : sentence.split(" ").length <= 5 ? VOICE.shortLineSpeed : 1;
  const { audio, rate } = await generate(sentence, voice, VOICE.modelSpeed * shape);
  const buffer = audioContext().createBuffer(1, audio.length, rate);
  buffer.getChannelData(0).set(audio);
  return buffer;
}

// Builds the effect chain: source -> presence EQ -> dry + echo + chorus -> analyser -> speakers.
function chain(ac, source, withEffect) {
  const out = ac.createGain();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  out.connect(analyser);
  analyser.connect(ac.destination);
  if (!withEffect) { source.connect(out); return { analyser, nodes: [] }; }

  const e = VOICE.effect;
  const eq = ac.createBiquadFilter();
  eq.type = "peaking"; eq.frequency.value = e.presence.freqHz; eq.gain.value = e.presence.gainDb; eq.Q.value = e.presence.q;
  const warm = ac.createBiquadFilter();
  warm.type = "lowshelf"; warm.frequency.value = e.warmth.freqHz; warm.gain.value = e.warmth.gainDb;
  source.connect(warm);
  warm.connect(eq);
  eq.connect(out); // dry

  const echo = ac.createDelay(1); echo.delayTime.value = e.echo.delaySec;
  const fb = ac.createGain(); fb.gain.value = e.echo.feedback;
  const echoWet = ac.createGain(); echoWet.gain.value = e.echo.wet;
  eq.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(echoWet); echoWet.connect(out);

  const chorus = ac.createDelay(0.1); chorus.delayTime.value = e.chorus.delaySec;
  const lfo = ac.createOscillator(); lfo.frequency.value = e.chorus.rateHz;
  const depth = ac.createGain(); depth.gain.value = e.chorus.depthSec;
  lfo.connect(depth); depth.connect(chorus.delayTime); lfo.start();
  const chorusWet = ac.createGain(); chorusWet.gain.value = e.chorus.wet;
  eq.connect(chorus); chorus.connect(chorusWet); chorusWet.connect(out);

  return { analyser, nodes: [lfo] };
}

// Speaks text sentence by sentence: the first sentence plays as soon as it's ready while
// the next ones are generated, so Javis starts talking quickly.
// Resolves once he starts speaking, with { done, stop, analyser } — analyser drives the core's glow (Step 5).
export async function speak(text, { voice = VOICE.defaultVoice, effect = true } = {}) {
  const ac = audioContext();
  const input = ac.createGain();
  const { analyser, nodes } = chain(ac, input, effect);
  const rate = Math.pow(2, VOICE.pitchSemitones / 12);
  const gap = VOICE.sentencePauseMs / 1000;
  const sources = [];
  let cancelled = false;
  let at = 0;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  const play = (buffer) => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(input);
    at = Math.max(at, ac.currentTime + 0.02);
    src.start(at);
    at += buffer.duration / rate + gap;
    sources.push(src);
    return src;
  };
  const finish = () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); resolveDone(); };

  const sentences = chunkText(text);
  const first = play(await sentenceBuffer(sentences[0], voice));

  // Generate the rest in the background, queueing each right after the previous one.
  (async () => {
    let last = first;
    try {
      for (const sentence of sentences.slice(1)) {
        if (cancelled) break;
        const buffer = await sentenceBuffer(sentence, voice);
        if (cancelled) break;
        last = play(buffer);
      }
    } catch (e) {
      console.warn("[voice] stopped early:", e);
    }
    if (cancelled) return finish();
    last.onended = finish;
  })();

  return {
    done,
    analyser,
    stop: () => {
      cancelled = true;
      sources.forEach((src) => { try { src.stop(); } catch {} });
      finish();
    },
  };
}
