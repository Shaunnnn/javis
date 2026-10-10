// Javis's voice in the browser: Kokoro text-to-speech plus the Web Audio "AI system" effect.
// Runs fully on the device; the model (~90 MB) downloads once and is then cached by the browser.
import "./polyfills"; // Safari: lets the model download stream be looped over
import { VOICE } from "@/lib/voice-config";

const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let ttsPromise = null;
let ctx = null;

// Load from the CDN at runtime so the bundler never touches the ML libraries.
const importUrl = new Function("u", "return import(u)");

export function loadVoice(onProgress) {
  ttsPromise ??= (async () => {
    const { KokoroTTS } = await importUrl(KOKORO_URL);
    return KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p?.status === "progress" && p.total) onProgress?.(Math.round((p.loaded / p.total) * 100));
      },
    });
  })().catch((e) => { ttsPromise = null; throw e; });
  return ttsPromise;
}

// Must be called from a tap/click the first time (iPhone won't play audio otherwise).
export function audioContext() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function splitSentences(text) {
  return text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

// Turns text into one AudioBuffer, with a short pause between sentences.
async function synthesise(text, voice) {
  const tts = await loadVoice();
  const parts = [];
  for (const sentence of splitSentences(text)) {
    const shape = sentence.endsWith("?") ? VOICE.questionSpeed : sentence.split(" ").length <= 5 ? VOICE.shortLineSpeed : 1;
    const out = await tts.generate(sentence, { voice, speed: VOICE.modelSpeed * shape });
    parts.push({ data: out.audio, rate: out.sampling_rate });
  }
  const rate = parts[0].rate;
  const gap = Math.round((VOICE.sentencePauseMs / 1000) * rate);
  const length = parts.reduce((n, p) => n + p.data.length, 0) + gap * (parts.length - 1);
  const ac = audioContext();
  const buffer = ac.createBuffer(1, length, rate);
  const ch = buffer.getChannelData(0);
  let at = 0;
  parts.forEach((p, i) => { ch.set(p.data, at); at += p.data.length + (i < parts.length - 1 ? gap : 0); });
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

// Speaks text. Returns { done, stop, analyser } — analyser drives the core's glow later (Step 5).
export async function speak(text, { voice = VOICE.defaultVoice, effect = true } = {}) {
  const buffer = await synthesise(text, voice);
  const ac = audioContext();
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = Math.pow(2, VOICE.pitchSemitones / 12);
  const { analyser, nodes } = chain(ac, source, effect);
  const done = new Promise((resolve) => {
    source.onended = () => { nodes.forEach((n) => n.stop()); resolve(); };
  });
  source.start();
  return { done, analyser, stop: () => { try { source.stop(); } catch {} } };
}
