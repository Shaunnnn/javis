"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import { audioContext, loadVoice, speak } from "@/lib/client/voice";
import u from "../ui.module.css";
import s from "./core-lab.module.css";

// Step 5 preview: check Javis's core in every state before it goes into the interview.
const JavisCore = dynamic(() => import("@/components/JavisCore"), { ssr: false });
const STATES = ["idle", "speaking", "listening", "thinking"];

export default function CoreLab() {
  const [state, setState] = useState("idle");
  const [power, setPower] = useState("on");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const volumeRef = useRef(0);
  const faceRef = useRef(null);
  const fakeVoice = useRef(false);

  // Simulated voice while "speaking" is chosen without real audio.
  useEffect(() => {
    let raf;
    const tick = (t) => {
      if (fakeVoice.current) {
        const x = t / 1000;
        volumeRef.current = Math.max(0, (Math.sin(x * 9) * 0.5 + Math.sin(x * 3.7) * 0.35) * 0.5 + 0.5) * (Math.sin(x * 0.9) > -0.6 ? 0.8 : 0.1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => { fakeVoice.current = state === "speaking" && !voiceBusy; if (state !== "speaking") volumeRef.current = 0; }, [state, voiceBusy]);

  // The mouse stands in for the candidate's face, so you can see his eyes follow.
  function onMove(e) {
    const r = e.currentTarget.getBoundingClientRect();
    faceRef.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
  }

  async function realVoice() {
    audioContext();
    setVoiceBusy(true);
    setState("thinking");
    try {
      await loadVoice();
      const h = await speak("Good evening, Shaun. I'm Javis. A bold answer, I must say. Let's see if the follow-up agrees.");
      setState("speaking");
      const buf = new Uint8Array(h.analyser.fftSize);
      let raf;
      const read = () => {
        h.analyser.getByteTimeDomainData(buf);
        let sum = 0; for (const b of buf) { const x = (b - 128) / 128; sum += x * x; }
        volumeRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 5);
        raf = requestAnimationFrame(read);
      };
      read();
      await h.done;
      cancelAnimationFrame(raf);
      volumeRef.current = 0;
    } finally {
      setVoiceBusy(false);
      setState("idle");
    }
  }

  return (
    <main className={u.shell}>
      <Header right={<a href="/">Home</a>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>Step 5 · preview</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Javis's core</h1>
      </section>

      <div className={s.tile} data-state={state} onMouseMove={onMove} onMouseLeave={() => (faceRef.current = null)}>
        <div className={s.label}><span className={s.name}>Javis</span> · Interviewer</div>
        <div className={s.status}>{power === "on" || power === "booting" ? state[0].toUpperCase() + state.slice(1) : power === "shutdown" ? "Call ending" : "Offline"}</div>
        <JavisCore state={state} power={power} volumeRef={volumeRef} faceRef={faceRef} />
      </div>
      <p className={s.hint}>Move your mouse over the tile: it stands in for your face, so his eyes follow it.</p>

      <div className={s.row}>
        <span className={s.rowLabel}>State</span>
        <div className={s.opts}>
          {STATES.map((k) => (
            <button key={k} className={`${s.opt} ${state === k ? s.on : ""}`} onClick={() => setState(k)} disabled={voiceBusy}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Power</span>
        <div className={s.opts}>
          <button className={s.opt} onClick={() => { setPower("off"); setTimeout(() => setPower("booting"), 50); setTimeout(() => setPower("on"), 3200); }}>Boot up</button>
          <button className={s.opt} onClick={() => setPower("shutdown")}>Shut down</button>
        </div>
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Voice sync</span>
        <div className={s.opts}>
          <button className={s.opt} onClick={realVoice} disabled={voiceBusy}>{voiceBusy ? "Speaking…" : "Play a real line"}</button>
        </div>
      </div>
    </main>
  );
}
