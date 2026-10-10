"use client";
import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { loadLandmarker, readFrame, createAnswerTracker } from "@/lib/client/delivery";
import u from "../ui.module.css";
import s from "./delivery-lab.module.css";

// Step 6 preview: see what the camera measures, live. Nothing is recorded or sent anywhere.
export default function DeliveryLab() {
  const videoRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | starting | live | error
  const [live, setLive] = useState(null);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null);
  const tracker = useRef(null);
  const stopRef = useRef(null);

  useEffect(() => () => stopRef.current?.(), []);

  async function start() {
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      const lm = await loadLandmarker();
      setState("live");
      let stop = false, last = 0, shown = 0;
      const loop = (t) => {
        if (stop) return;
        if (t - last > 120 && v.readyState >= 2) {
          last = t;
          const sig = readFrame(lm.detectForVideo(v, t), v);
          tracker.current?.add(sig, t);
          if (t - shown > 200) { shown = t; setLive(sig); }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      stopRef.current = () => { stop = true; stream.getTracks().forEach((x) => x.stop()); };
    } catch {
      setState("error");
    }
  }

  function toggleRecord() {
    if (!recording) { tracker.current = createAnswerTracker(); setResult(null); setRecording(true); }
    else { setResult(tracker.current.finish() || "none"); tracker.current = null; setRecording(false); }
  }

  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  return (
    <main className={u.shell}>
      <Header right={<a href="/">Home</a>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>Step 6 · preview</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Delivery lab</h1>
      </section>
      <p className={u.lede} style={{ marginTop: "var(--space-3)" }}>See what the camera measures while you answer. It all runs on your device; nothing is recorded or sent anywhere.</p>

      <div className={s.grid}>
        <div className={s.cam}>
          <video ref={videoRef} muted playsInline className={s.video} />
          {state !== "live" && (
            <div className={s.overlay}>
              {state === "error" ? <p>Camera couldn't start. Allow it in your browser's site settings.</p>
                : <button className="btn btn-primary" onClick={start} disabled={state === "starting"}>{state === "starting" ? "Starting…" : "Start camera"}</button>}
            </div>
          )}
          {live && <span className={`${s.badge} ${live.face && !live.away ? s.ok : s.warn}`}>{!live.face ? "No face" : live.away ? (live.down ? "Looking down" : "Looking away") : "Eye contact"}</span>}
        </div>

        <div>
          <h2 className={s.h2}>Right now</h2>
          <dl className={s.readout}>
            <div><dt>Face</dt><dd>{live ? (live.face ? "Visible" : "Not found") : "–"}</dd></div>
            <div><dt>Looking at camera</dt><dd>{live?.face ? (live.away ? "No" : "Yes") : "–"}</dd></div>
            <div><dt>Head turn (yaw)</dt><dd className="mono">{live?.face ? `${Math.round(live.pose.yaw)}°` : "–"}</dd></div>
            <div><dt>Head nod (pitch)</dt><dd className="mono">{live?.face ? `${Math.round(live.pose.pitch)}°` : "–"}</dd></div>
            <div><dt>Head tilt (roll)</dt><dd className="mono">{live?.face ? `${Math.round(live.pose.roll)}°` : "–"}</dd></div>
            <div><dt>Smile</dt><dd className="mono">{live?.face ? pct(live.smile) : "–"}</dd></div>
            <div><dt>Expressiveness</dt><dd className="mono">{live?.face ? pct(live.expressive) : "–"}</dd></div>
          </dl>

          <h2 className={s.h2} style={{ marginTop: "var(--space-5)" }}>Practice answer</h2>
          <p className={s.hint}>Press start, talk for 20–30 seconds as if answering a question (try looking away, or reading notes), then stop to see the scores.</p>
          <button className="btn btn-outline" onClick={toggleRecord} disabled={state !== "live"}>{recording ? "Stop and score" : "Start a practice answer"}</button>
          {recording && <span className={s.rec}>Measuring…</span>}
          {result && result !== "none" && (
            <dl className={s.readout} style={{ marginTop: "var(--space-3)" }}>
              <div><dt>Eye contact</dt><dd className="mono">{result.eyeContactPct}% <span>(ideal 60–80%)</span></dd></div>
              <div><dt>Looked away</dt><dd className="mono">{result.lookAways} times</dd></div>
              <div><dt>Long looks down</dt><dd className="mono">{result.longDownLooks}</dd></div>
              <div><dt>Head steadiness</dt><dd className="mono">{result.steadiness}/100</dd></div>
              <div><dt>Engagement</dt><dd>{result.engagement}</dd></div>
            </dl>
          )}
          {result === "none" && <p className={s.hint}>Not enough face data. Make sure your face is visible, and talk for at least a few seconds.</p>}
        </div>
      </div>
    </main>
  );
}
