"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { askLLM } from "@/lib/client/api";
import { audioContext, loadVoice, speak } from "@/lib/client/voice";
import { listenForAnswer, watchForInterruption } from "@/lib/client/listen";
import { buildPlan } from "@/lib/client/interview-plan";
import { getApplication, getQuestions, getInterviewSettings, getSession, saveSession, clearSession } from "@/lib/client/storage";
import s from "./call.module.css";

// Step 4c: the live voice loop. IDLE -> SPEAKING -> LISTENING -> THINKING -> SPEAKING -> ...
// A plain placeholder stands in for Javis's AI core (Step 5).

const greetingFor = (h) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

function opener(app, plan, settings) {
  const name = app.profile?.candidate_name || "there";
  const first = plan[0]?.surprise ? "Let's start. Tell me about yourself." : `Let's start. ${plan[0].question}`;
  const hello = `${greetingFor(new Date().getHours())}, ${name}. I'm Javis, and I'll be conducting your interview today for the ${app.position} role at ${app.company}.`;
  if (settings.mode === "targeted") {
    return `${hello} We'll go through the ${plan.length} question${plan.length > 1 ? "s" : ""} you selected. ${first}`;
  }
  return `${hello} This should take about ${settings.timeLimit} minutes. I'll ask around ${plan.length} questions, and I may follow up on your answers. If you'd like me to repeat a question, just ask. ${first}`;
}

export default function Interview() {
  const [ui, setUi] = useState({ phase: "loading" }); // loading | join | live | paused | ended | missing
  const [status, setStatus] = useState("Idle");       // Speaking | Listening | Thinking | Paused
  const [caption, setCaption] = useState("");
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [pauseMsg, setPauseMsg] = useState("");
  const [lastGap, setLastGap] = useState(null);

  const ctx = useRef({}); // mutable interview state that the loop reads
  const sess = useRef(null);

  useEffect(() => {
    const app = getApplication();
    if (!app) return setUi({ phase: "missing" });
    const saved = getSession();
    ctx.current = { app, settings: getInterviewSettings(), questions: getQuestions(app.id) };
    if (saved && saved.appId === app.id && saved.status === "live") { sess.current = saved; setUi({ phase: "join", resume: true }); }
    else setUi({ phase: "join", resume: false });
    loadVoice().catch(() => {});
    return () => cleanup();
  }, []);

  // Timer
  useEffect(() => {
    if (ui.phase !== "live") return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - sess.current.startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [ui.phase]);

  function cleanup() {
    const c = ctx.current;
    c.stopped = true;
    c.voice?.stop(); c.listener?.stop(); c.stopWatch?.();
    c.stream?.getTracks().forEach((t) => t.stop());
  }

  const save = () => saveSession(sess.current);
  const transcriptText = () =>
    sess.current.turns.slice(-18).map((t) => `${t.role === "javis" ? "Javis" : "Candidate"}: ${t.text}`).join("\n");

  // ---------- the loop ----------
  async function join() {
    const c = ctx.current;
    const ac = audioContext(); // this tap unlocks audio on iPhone
    c.stopped = false;
    try {
      c.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return pause("Javis can't hear you: the microphone is blocked. Allow it in your browser's site settings, then tap Resume.");
    }
    c.ac = ac;
    setUi({ phase: "live" });
    if (!sess.current) {
      const plan = buildPlan(c.questions, c.settings);
      sess.current = {
        id: crypto.randomUUID(), appId: c.app.id, status: "live", startedAt: Date.now(),
        settings: c.settings, plan, index: 0, followUps: 0, turns: [],
      };
      const line = opener(c.app, plan, c.settings);
      sess.current.turns.push({ role: "javis", text: line, qIndex: 0 });
      save();
      await say(line);
    } else {
      const last = [...sess.current.turns].reverse().find((t) => t.role === "javis");
      await say(`Apologies for the interruption. ${last?.text || "Shall we continue?"}`);
    }
    listen();
  }

  async function say(text) {
    const c = ctx.current;
    if (c.stopped) return;
    setStatus("Thinking"); // voice is being prepared
    setCaption(text);
    try {
      c.voice = await speak(text);
    } catch {
      return; // voice failed: captions still show the line
    }
    if (c.thinkingSince) { setLastGap(((performance.now() - c.thinkingSince) / 1000).toFixed(1)); c.thinkingSince = null; }
    setStatus("Speaking");
    let interrupted = false;
    c.stopWatch = watchForInterruption({ ac: c.ac, stream: c.stream, onInterrupt: () => { interrupted = true; c.voice?.stop(); } });
    await c.voice.done;
    c.stopWatch?.();
    if (interrupted) console.info("[interview] candidate interrupted Javis");
  }

  async function listen(noSpeechMs) {
    const c = ctx.current;
    if (c.stopped) return;
    setStatus("Listening");
    setHeard("");
    c.listener = listenForAnswer({
      ac: c.ac, stream: c.stream, noSpeechMs,
      onLevel: setLevel,
      onInterim: setHeard,
    });
    const answer = await c.listener.result;
    setLevel(0);
    if (c.stopped) return;
    if (answer.reason === "silence") return pause("Are you still there? Tap Resume when you're ready to continue.");
    c.thinkingSince = performance.now();
    await think(answer);
  }

  async function think(answer, retried = false) {
    const c = ctx.current;
    const S = sess.current;
    setStatus("Thinking");
    const candidateTurn = { role: "candidate", text: answer.text || "(spoken answer)", qIndex: S.index };
    if (!retried) { S.turns.push(candidateTurn); save(); }
    const plan = S.plan;
    const cur = plan[S.index] || {};
    const minutesLeft = Math.max(0, Math.round(S.settings.timeLimit - (Date.now() - S.startedAt) / 60000));
    const nextItem = minutesLeft < 2 ? null : plan[S.index + 1];
    const nextQuestion = !nextItem
      ? "(None left. Ask whether they have any questions for you, or answer the ones they've asked.)"
      : nextItem.surprise ? "(A new question you write yourself that fits this role and isn't in the conversation yet.)"
      : nextItem.question;

    let r;
    try {
      r = await askLLM({
        prompt: "javis-interviewer",
        vars: {
          name: c.app.profile?.candidate_name || "the candidate",
          company: c.app.company, position: c.app.position,
          style: S.settings.style, mode: S.settings.mode === "targeted" ? "targeted practice" : "full mock interview",
          time_left: String(minutesLeft),
          profile: c.app.profile,
          current_question: cur.surprise ? "(a question you wrote yourself; see the conversation)" : cur.question || "(see the conversation)",
          model_answer: cur.model_answer || "(none)",
          follow_ups_used: String(S.followUps),
          next_question: nextQuestion,
          conversation: transcriptText(),
        },
        files: answer.audio ? [{ label: "the candidate's latest spoken reply", mimeType: "audio/wav", data: answer.audio }] : [],
        model: "fast", json: true, temperature: 0.6,
      });
    } catch (e) {
      if (!retried) return think(answer, true); // retry once automatically
      return pause(/limit/i.test(e.message)
        ? "Javis has reached today's free usage limit. Your interview is saved; try again later."
        : "Javis lost connection. Your interview is saved. Tap Resume to carry on.", answer);
    }
    if (c.stopped) return;

    if (r.transcript && answer.audio) { candidateTurn.text = r.transcript; S.turns[S.turns.length - 1] = candidateTurn; }
    S.turns[S.turns.length - 1].score = r.private_score;
    S.turns[S.turns.length - 1].notes = r.notes;

    if (r.action === "follow_up") S.followUps++;
    else if (r.action === "comment_and_next") { if (nextItem) S.index++; S.followUps = 0; }

    S.turns.push({ role: "javis", text: r.say, qIndex: S.index, action: r.action });
    save();
    await say(r.say);
    if (r.action === "wrap_up") return end();
    listen(r.action === "pause" ? 90_000 : undefined);
  }

  function pause(message, pendingAnswer) {
    const c = ctx.current;
    c.voice?.stop(); c.listener?.stop(); c.stopWatch?.();
    c.pending = pendingAnswer || null;
    setPauseMsg(message);
    setStatus("Paused");
    setUi({ phase: "paused" });
  }

  async function resume() {
    const c = ctx.current;
    setUi({ phase: "live" });
    if (!c.stream) return join();
    if (c.pending) { const a = c.pending; c.pending = null; c.thinkingSince = performance.now(); return think(a, true); }
    listen();
  }

  async function end(early = false) {
    const c = ctx.current;
    if (early) {
      c.voice?.stop(); c.listener?.stop();
      const line = `Of course. Thank you for your time, ${c.app.profile?.candidate_name || ""}. We'll stop there.`.replace(" .", ".");
      sess.current.turns.push({ role: "javis", text: line, action: "wrap_up" });
      await say(line);
    }
    sess.current.status = "ended";
    sess.current.endedAt = Date.now();
    save();
    cleanup();
    setStatus("Call ended");
    setUi({ phase: "ended" });
  }

  // ---------- screen ----------
  const S = sess.current;
  const app = ctx.current.app;
  const total = S?.plan.length || 0;
  const qNum = Math.min(total, (S?.index || 0) + 1);

  if (ui.phase === "loading") return <main className={s.call} />;
  if (ui.phase === "missing") {
    return <main className={s.call}><div className={s.center}><p>No application yet.</p><Link className="btn btn-primary" href="/new">Start a new application</Link></div></main>;
  }

  return (
    <main className={s.call}>
      <header className={s.top}>
        <div>
          <strong>{app.company} · {app.position}</strong>
          <span>{ui.phase === "join" ? "Mock interview" : `Mock interview · Question ${qNum} of ${total}`}</span>
        </div>
        <span className="mono">{fmt(elapsed)}</span>
      </header>

      <section className={s.tile} data-status={status}>
        <div className={s.tileLabel}><span className={s.name}>Javis</span> · Interviewer</div>
        <div className={s.statusLabel}><i />{status}</div>

        {/* Placeholder for Javis's AI core (Step 5) */}
        <div className={s.placeholder} style={{ "--lvl": level }} aria-hidden><span /></div>

        {ui.phase === "join" && (
          <div className={s.center}>
            <p>{ui.resume ? "Your interview was interrupted. Javis will pick up where you left off." : "Javis is ready when you are."}</p>
            <button className="btn btn-primary" onClick={join}>{ui.resume ? "Resume interview" : "Start interview"}</button>
            {ui.resume && <button className={s.link} onClick={() => { clearSession(); sess.current = null; setUi({ phase: "join", resume: false }); }}>Start a fresh interview instead</button>}
          </div>
        )}
        {ui.phase === "paused" && (
          <div className={s.center}>
            <p>{pauseMsg}</p>
            <button className="btn btn-primary" onClick={resume}>Resume</button>
          </div>
        )}
        {ui.phase === "ended" && (
          <div className={s.center}>
            <p>Call ended. Your full report arrives in Step 7.</p>
            <Link className="btn btn-outline" href="/questions">Back to questions</Link>
          </div>
        )}

        {captions && ui.phase === "live" && (
          <div className={s.captions}>
            {status === "Listening" && heard ? <p className={s.you}>{heard}</p> : caption ? <p>{caption}</p> : null}
          </div>
        )}
      </section>

      <footer className={s.controls}>
        <button className={`${s.round} ${captions ? s.on : ""}`} onClick={() => setCaptions(!captions)} aria-pressed={captions} title="Captions">CC</button>
        {ui.phase === "live" && status === "Listening" && (
          <button className={s.round} onClick={() => ctx.current.listener?.stop()} title="I've finished my answer">Done</button>
        )}
        {(ui.phase === "live" || ui.phase === "paused") && (
          <button className={`${s.round} ${s.end}`} onClick={() => end(true)} title="End interview">End</button>
        )}
        {lastGap && <span className={`mono ${s.gap}`} title="Time from your answer ending to Javis replying">reply {lastGap}s</span>}
      </footer>
    </main>
  );
}
