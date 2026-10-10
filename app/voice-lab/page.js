"use client";
import { useRef, useState } from "react";
import Header from "@/components/Header";
import { VOICE } from "@/lib/voice-config";
import { loadVoice, speak, audioContext } from "@/lib/client/voice";
import u from "../ui.module.css";
import s from "./voice-lab.module.css";

// Step 4a: pick Javis's voice by ear.
const LINES = [
  "Good evening, Shaun. I'm Javis, and I'll be conducting your interview today for the Software Engineer role at Grab.",
  "Very good. Shall we continue?",
  "Take your time. I have nowhere else to be.",
  "A bold answer. Let's see if the follow-up agrees.",
  "Thank you for your time, Shaun. We'll be in touch.",
];

export default function VoiceLab() {
  const [voice, setVoice] = useState(VOICE.defaultVoice);
  const [effect, setEffect] = useState(true);
  const [state, setState] = useState("idle"); // idle | loading | ready | speaking
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(null);
  const [error, setError] = useState("");
  const current = useRef(null);

  async function prepare() {
    audioContext(); // unlock audio on this tap
    setState("loading");
    setError("");
    try {
      await loadVoice(setProgress);
      setState("ready");
    } catch (e) {
      setError("The voice model couldn't load. Check your connection and try again.");
      setState("idle");
    }
  }

  async function play(i) {
    current.current?.stop();
    setPlaying(i);
    setState("speaking");
    try {
      const t0 = performance.now();
      const h = await speak(LINES[i], { voice, effect });
      console.info(`[voice] ready in ${Math.round(performance.now() - t0)} ms`);
      current.current = h;
      await h.done;
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setPlaying(null);
      setState("ready");
    }
  }

  return (
    <main className={u.shell}>
      <Header right={<a href="/">Home</a>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>Step 4a · voice test</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Javis's voice</h1>
        {state === "idle" || state === "loading" ? (
          <button className={`btn btn-primary ${u.topBtn}`} onClick={prepare} disabled={state === "loading"}>
            {state === "loading" ? `Loading voice… ${progress}%` : "Load voice"}
          </button>
        ) : null}
      </section>
      <p className={u.lede} style={{ marginTop: "var(--space-3)" }}>
        Pick the voice and effect by ear. The voice runs on your device; the first load downloads about 90 MB, then it's cached.
      </p>
      {error && <p className={u.error} role="alert">{error}</p>}

      <div className={s.row}>
        <span className={s.label}>Voice</span>
        <div className={s.options}>
          {VOICE.voices.map((v) => (
            <button key={v.id} type="button" className={`${s.opt} ${voice === v.id ? s.on : ""}`} onClick={() => setVoice(v.id)}>{v.label}</button>
          ))}
        </div>
      </div>
      <div className={s.row}>
        <span className={s.label}>AI system effect</span>
        <div className={s.options}>
          <button type="button" className={`${s.opt} ${effect ? s.on : ""}`} onClick={() => setEffect(true)}>On</button>
          <button type="button" className={`${s.opt} ${!effect ? s.on : ""}`} onClick={() => setEffect(false)}>Off</button>
        </div>
      </div>

      <ol className={s.lines}>
        {LINES.map((line, i) => (
          <li key={i}>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span>
            <p>{line}</p>
            <button type="button" className="btn btn-outline" disabled={state === "idle" || state === "loading"} onClick={() => play(i)}>
              {playing === i ? "Speaking…" : "Play"}
            </button>
          </li>
        ))}
      </ol>
    </main>
  );
}
