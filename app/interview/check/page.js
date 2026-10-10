"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getInterviewSettings } from "@/lib/client/storage";
import { audioContext, loadVoice, speak } from "@/lib/client/voice";
import { watchLevel, speechRecognition, loadFaceDetector, browserName } from "@/lib/client/media";
import u from "../../ui.module.css";
import s from "../interview.module.css";

const HELP = {
  chrome: ["Click the icon to the left of the address bar.", "Set Microphone (and Camera) to Allow.", "Reload this page."],
  safari: ["In the menu bar, open Safari → Settings → Websites.", "Choose Microphone (and Camera), and set this site to Allow.", "Reload this page."],
  ios: ["Tap the aA button in the address bar → Website Settings.", "Set Microphone (and Camera) to Allow.", "Reload this page. If it's still blocked: iPhone Settings → Safari → Microphone / Camera → Allow."],
  other: ["Open your browser's site settings for this page.", "Allow the microphone (and camera).", "Reload this page."],
};

const Tick = ({ on, children }) => <span className={`${s.status} ${on ? s.ok : ""}`}>{on ? "✓ " : ""}{children}</span>;

export default function DeviceCheck() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [perm, setPerm] = useState("idle"); // idle | asking | ok | blocked | error
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceState, setVoiceState] = useState("idle"); // idle | loading | playing | played
  const [progress, setProgress] = useState(0);
  const [speakerOk, setSpeakerOk] = useState(false);
  const [face, setFace] = useState("off"); // off | loading | searching | found | error
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const cleanups = useRef([]);
  const browser = useRef("other");

  useEffect(() => {
    setSettings(getInterviewSettings());
    browser.current = browserName();
    loadVoice(setProgress).then(() => setProgress(100)).catch(() => {}); // start downloading the voice now so there's no wait later
    return () => {
      cleanups.current.forEach((fn) => fn());
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function allow() {
    const ac = audioContext(); // this tap also unlocks audio on iPhone
    setPerm("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: settings.camera ? { width: 640, height: 480, facingMode: "user" } : false,
      });
      streamRef.current = stream;
      setPerm("ok");
      let loud = 0;
      cleanups.current.push(watchLevel(ac, stream, (v) => {
        setLevel(v);
        // Without speech recognition (Safari), a few moments of clear voice counts as heard.
        if (!speechRecognition()) { loud = v > 0.25 ? loud + 1 : Math.max(0, loud - 1); if (loud > 30) setHeard(true); }
      }));
      if (speechRecognition()) listenForHello();
      if (settings.camera) startFace(stream);
    } catch (e) {
      setPerm(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "blocked" : "error");
    }
  }

  function listenForHello() {
    const SR = speechRecognition();
    const rec = new SR();
    rec.lang = "en-GB";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ").toLowerCase();
      if (/hello|hi |javis|jarvis/.test(said)) { setHeard(true); rec.stop(); }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
    cleanups.current.push(() => { try { rec.stop(); } catch {} });
  }

  async function startFace(stream) {
    setFace("loading");
    const v = videoRef.current;
    v.srcObject = stream;
    await v.play().catch(() => {});
    try {
      const detector = await loadFaceDetector();
      setFace("searching");
      let stop = false, last = 0;
      const loop = (t) => {
        if (stop) return;
        if (t - last > 300 && v.readyState >= 2) {
          last = t;
          const r = detector.detectForVideo(v, t);
          setFace(r.detections?.length ? "found" : "searching");
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      cleanups.current.push(() => { stop = true; });
    } catch {
      setFace("error");
    }
  }

  async function playTest() {
    audioContext();
    setVoiceState(progress >= 100 ? "preparing" : "loading"); // replays go straight to "getting ready"
    try {
      await loadVoice(setProgress);
      setProgress(100); // a cached model may never report download progress
      setVoiceState("preparing"); // voice ready; generating the first sentence
      const h = await speak("Hello. I'm Javis. Can you hear me clearly?");
      setVoiceState("playing");
      await h.done;
      setVoiceState("played");
    } catch {
      setVoiceState("idle");
    }
  }

  if (!settings) return <main className={u.shell}><Header /></main>;
  const ready = perm === "ok" && heard && speakerOk;
  const steps = HELP[browser.current] || HELP.other;

  return (
    <main className={u.shell}>
      <Header right={<Link href="/interview/setup">Back to setup</Link>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>Before Javis joins</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Device check</h1>
      </section>
      <p className={u.lede} style={{ marginTop: "var(--space-3)" }}>A quick check that Javis can hear you and you can hear him.</p>

      <div className={s.row}>
        <div><span className={s.label}>1. Permission</span><p className={s.hint}>Microphone{settings.camera ? " and camera" : ""}. Nothing is recorded or sent anywhere yet.</p></div>
        <div>
          {perm === "ok" ? <Tick on>Allowed</Tick> : (
            <button className="btn btn-outline" onClick={allow} disabled={perm === "asking"}>
              {perm === "asking" ? "Waiting for permission…" : `Allow microphone${settings.camera ? " and camera" : ""}`}
            </button>
          )}
          {(perm === "blocked" || perm === "error") && (
            <div className={s.help} role="alert">
              {perm === "blocked" ? "Access is blocked. To fix it:" : "Your microphone couldn't be started. Check it's connected and not used by another app, then:"}
              <ol>{steps.map((t) => <li key={t}>{t}</li>)}</ol>
            </div>
          )}
        </div>
      </div>

      <div className={s.row}>
        <div><span className={s.label}>2. Microphone</span><p className={s.hint}>Say "Hello Javis" at your normal speaking volume.</p></div>
        <div>
          <div className={s.meter} aria-hidden><i style={{ width: `${Math.round(level * 100)}%` }} /></div>
          {perm !== "ok" ? <span className={s.status}>Allow the microphone first.</span>
            : heard ? <Tick on>Heard you</Tick>
            : <span className={s.status}>{listening || !speechRecognition() ? "Listening… say \"Hello Javis\"." : "Didn't catch that. "}</span>}
          {perm === "ok" && !heard && !listening && speechRecognition() && (
            <button className={s.status} style={{ background: "none", border: 0, textDecoration: "underline", cursor: "pointer" }} onClick={listenForHello}>Try again</button>
          )}
        </div>
      </div>

      <div className={s.row}>
        <div><span className={s.label}>3. Speakers</span><p className={s.hint}>Play Javis's voice and check you can hear it clearly.</p></div>
        <div>
          <div className={s.actions}>
            <button className="btn btn-outline" onClick={playTest} disabled={speakerOk || ["loading", "preparing", "playing"].includes(voiceState)}>
              {voiceState === "loading" && progress > 0 && progress < 100 ? `Loading voice… ${progress}%`
                : voiceState === "preparing" || voiceState === "loading" ? <>Javis is getting ready<span className={s.dots} aria-hidden><i>.</i><i>.</i><i>.</i></span></>
                : voiceState === "playing" ? "Speaking…"
                : voiceState === "played" ? "Play again" : "Play test"}
            </button>
            {voiceState === "idle" && progress < 100 && (
              <span className={s.status}>Preparing Javis's voice<span className={s.dots} aria-hidden><i>.</i><i>.</i><i>.</i></span></span>
            )}
            {voiceState === "played" && !speakerOk && (
              <button className="btn btn-outline" onClick={() => setSpeakerOk(true)}>Yes, I heard him</button>
            )}
            {speakerOk && <Tick on>Speakers working</Tick>}
          </div>
          {voiceState === "played" && !speakerOk && (
            <p className={s.hint} style={{ maxWidth: "60ch" }}>Can't hear anything? Check your volume, that sound isn't muted, and on iPhone that the silent switch is off.</p>
          )}
        </div>
      </div>

      {settings.camera && (
        <div className={`${s.row} ${s.rowTop}`}>
          <div><span className={s.label}>4. Camera</span><p className={s.hint}>Optional. Sit facing the screen in good light.</p></div>
          <div>
            <video ref={videoRef} className={s.video} muted playsInline />
            {perm !== "ok" ? <span className={s.status}>Allow the camera first.</span>
              : face === "found" ? <Tick on>Face detected</Tick>
              : face === "searching" ? <span className={s.status}>Looking for your face…</span>
              : face === "loading" ? <span className={s.status}>Starting face detection…</span>
              : face === "error" ? <span className={`${s.status} ${s.bad}`}>Face detection couldn't start. You can still continue.</span> : null}
          </div>
        </div>
      )}

      <div className={s.footer}>
        {!ready && <span className={s.footNote}>Complete the checks above to start.</span>}
        <button className="btn btn-primary" disabled={!ready} onClick={() => router.push("/interview")}>Start interview</button>
      </div>
    </main>
  );
}
