// Listening for one answer. Hides which speech-to-text path ran (the plan's getTranscript):
// - Chrome: built-in speech recognition, with live captions.
// - Safari (or if recognition fails): the answer is recorded and sent to Gemini as audio.
// End of answer = about 1.8 s of silence after the candidate has spoken.
import { speechRecognition } from "./media";

const END_SILENCE_MS = 1800;
const MAX_ANSWER_MS = 110_000; // keeps the audio upload under Vercel's size limit
const AUDIO_RATE = 12000;      // plenty for speech, small enough to upload

export function listenForAnswer({ ac, stream, onLevel, onSpeechStart, onInterim, noSpeechMs = 30_000 }) {
  let stopped = false;
  let resolveFn;
  const result = new Promise((r) => (resolveFn = r));

  // Record raw audio (used only if speech recognition isn't available or comes back empty).
  const src = ac.createMediaStreamSource(stream);
  const proc = ac.createScriptProcessor(4096, 1, 1);
  const mute = ac.createGain(); mute.gain.value = 0;
  const chunks = [];
  let spoke = false, floor = 0.01, samples = 0, quietSince = 0, startedAt = performance.now();
  proc.onaudioprocess = (e) => {
    if (stopped) return;
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (const v of data) sum += v * v;
    const rms = Math.sqrt(sum / data.length);
    onLevel?.(Math.min(1, rms * 6));
    const now = performance.now();
    samples++;
    if (samples < 4) { floor = Math.max(floor, rms); return; } // learn the room's noise first
    const threshold = Math.max(0.02, floor * 3);
    if (rms > threshold) {
      if (!spoke) { spoke = true; onSpeechStart?.(); }
      quietSince = 0;
    } else if (spoke) {
      quietSince ||= now;
      if (now - quietSince > END_SILENCE_MS) finish("answered");
    } else if (now - startedAt > noSpeechMs) finish("silence");
    if (now - startedAt > MAX_ANSWER_MS) finish("answered");
  };
  src.connect(proc); proc.connect(mute); mute.connect(ac.destination);

  // Chrome: live transcript.
  let finalText = "", interimText = "", rec = null;
  const SR = speechRecognition();
  if (SR) {
    rec = new SR();
    rec.lang = "en-GB"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " "; else interimText += t;
      }
      onInterim?.((finalText + interimText).trim());
    };
    rec.onerror = () => {};
    rec.onend = () => { if (!stopped) { try { rec.start(); } catch {} } }; // Chrome stops after pauses; keep going
    try { rec.start(); } catch { rec = null; }
  }

  async function finish(reason) {
    if (stopped) return;
    stopped = true;
    proc.disconnect(); src.disconnect(); mute.disconnect();
    if (rec) {
      try { rec.stop(); } catch {}
      await new Promise((r) => setTimeout(r, 350)); // let the last words arrive
    }
    const text = (finalText + interimText).trim();
    if (reason === "silence") return resolveFn({ reason });
    if (text) return resolveFn({ reason, text });
    resolveFn({ reason, audio: toWavBase64(chunks, ac.sampleRate) });
  }

  return { result, stop: () => finish("stopped") };
}

// Float32 chunks at the mic's rate -> 12 kHz mono 16-bit WAV, base64.
function toWavBase64(chunks, inRate) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const ratio = inRate / AUDIO_RATE;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  let ci = 0, offset = 0;
  const flat = new Float32Array(total);
  for (const c of chunks) { flat.set(c, offset); offset += c.length; }
  for (let i = 0; i < outLen; i++) {
    const s = Math.max(-1, Math.min(1, flat[Math.floor(i * ratio)]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, AUDIO_RATE, true); v.setUint32(28, AUDIO_RATE * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// While Javis speaks: detect the candidate talking over him (to stop his audio).
export function watchForInterruption({ ac, stream, onInterrupt }) {
  const src = ac.createMediaStreamSource(stream);
  const an = ac.createAnalyser(); an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let loudFrames = 0, raf, stopped = false;
  const tick = () => {
    if (stopped) return;
    an.getFloatTimeDomainData(buf);
    let sum = 0; for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    loudFrames = rms > 0.08 ? loudFrames + 1 : Math.max(0, loudFrames - 1);
    if (loudFrames > 18) { stop(); onInterrupt(); return; } // ~0.3 s of clear speech
    raf = requestAnimationFrame(tick);
  };
  const stop = () => { stopped = true; cancelAnimationFrame(raf); src.disconnect(); };
  tick();
  return stop;
}
