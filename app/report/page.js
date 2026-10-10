"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import { askLLM } from "@/lib/client/api";
import { getSession, getReport, saveReport, getApplication, getQuestions, saveQuestions } from "@/lib/client/storage";
import { sections, transcriptText, modelAnswersText, deliveryScores, contentScore, overallScore, CRITERIA_LABELS } from "@/lib/client/report";
import { sampleReport } from "@/lib/client/sample-report";
import u from "../ui.module.css";
import s from "./report.module.css";

const STAGES = ["Scoring your answers", "Writing your feedback"];
const fmtDate = (t) => new Date(t).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

async function generate(session, app, setStage) {
  const secs = sections(session);
  const transcript = transcriptText(secs);
  setStage(0);
  const scoring = await askLLM({
    prompt: "scoring", model: "strong", json: true, temperature: 0,
    vars: { position: app.position, company: app.company, transcript, model_answers: modelAnswersText(secs) },
  });
  const content = contentScore(scoring);
  const delivery = deliveryScores(session);
  setStage(1);
  const feedback = await askLLM({
    prompt: "report", model: "strong", json: true, temperature: 0.3,
    vars: {
      position: app.position, company: app.company, transcript,
      content_scores: scoring,
      delivery_measures: delivery.measures,
      interviewer_notes: session.turns.filter((t) => t.notes).map((t) => `- ${t.notes}`).join("\n") || "(none)",
    },
  });
  return {
    id: session.id, appId: session.appId, company: app.company, position: app.position,
    startedAt: session.startedAt, endedAt: session.endedAt, settings: session.settings,
    sections: secs.map(({ turns, ...rest }) => rest), turns: session.turns,
    scoring, feedback, content, delivery,
    overall: overallScore(content.score, delivery.score),
  };
}

// Questions answered well (average 4 or more out of 5) are marked practised automatically.
function markPractised(report) {
  const strong = new Set(report.content.per.filter((p) => p.avg >= 4).map((p) => p.id));
  if (!strong.size) return;
  const items = getQuestions(report.appId);
  if (!items.length) return;
  saveQuestions(report.appId, items.map((q) => (strong.has(q.id) ? { ...q, practised: true } : q)));
}

function EyeChart({ perAnswer }) {
  const vals = perAnswer.map((d) => d.eyeContactPct).filter((v) => typeof v === "number");
  if (!vals.length) return null;
  const W = 520, H = 140, pad = 24, bw = Math.min(48, (W - pad * 2) / vals.length - 10);
  const y = (v) => H - pad - (v / 100) * (H - pad * 2);
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Eye contact for each answer">
      <rect x={pad} y={y(80)} width={W - pad * 2} height={y(60) - y(80)} className={s.band} />
      <text x={W - pad} y={y(80) - 4} textAnchor="end" className={s.axis}>ideal 60–80%</text>
      {vals.map((v, i) => {
        const x = pad + 6 + i * ((W - pad * 2) / vals.length);
        return (
          <g key={i}>
            <rect x={x} y={y(v)} width={bw} height={H - pad - y(v)} className={s.bar} rx="1" />
            <text x={x + bw / 2} y={y(v) - 4} textAnchor="middle" className={s.val}>{v}%</text>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" className={s.axis}>Q{i + 1}</text>
          </g>
        );
      })}
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className={s.baseline} />
    </svg>
  );
}

function Report() {
  const id = useSearchParams().get("id");
  const [report, setReport] = useState(undefined);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState("");
  const [openTurns, setOpenTurns] = useState(false);

  async function run() {
    setError("");
    // Local preview only: /report?id=demo shows a made-up report.
    if (id === "demo" && process.env.NODE_ENV !== "production") return setReport(sampleReport({ deliveryScores, contentScore, overallScore }));
    const saved = getReport(id);
    if (saved) return setReport(saved);
    const session = getSession();
    const app = getApplication();
    if (!session || session.id !== id || session.status !== "ended" || !app) return setReport(null);
    try {
      const r = await generate(session, app, setStage);
      saveReport(r);
      markPractised(r);
      setReport(r);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setStage(null);
    }
  }
  useEffect(() => { run(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <main className={u.shell}>
        <Header right={<Link href="/history">History</Link>} />
        <h1 className={u.title}>The report couldn't be generated</h1>
        <p className={u.error}>{error}</p>
        <div className={u.actions}><button className="btn btn-primary" onClick={run}>Try again</button></div>
      </main>
    );
  }
  if (report === undefined) {
    return (
      <main className={u.shell}>
        <Header />
        <section className={s.generating}>
          <h1 className={u.title}>Generating your report</h1>
          <ol className={s.stages}>
            {STAGES.map((label, i) => (
              <li key={label} className={stage === null ? s.next : i < stage ? s.done : i === stage ? s.now : s.next}>
                {stage !== null && i < stage ? "✓ " : ""}{label}{stage === i && <span className={s.dots}><i>.</i><i>.</i><i>.</i></span>}
              </li>
            ))}
          </ol>
          <p className={s.muted}>Javis is reading the whole interview against a fixed rubric. Usually 15 to 45 seconds.</p>
        </section>
      </main>
    );
  }
  if (!report) {
    return (
      <main className={u.shell}>
        <Header />
        <h1 className={u.title}>Report not found</h1>
        <div className={u.actions}><Link href="/history" className="btn btn-primary">See your history</Link></div>
      </main>
    );
  }

  const fb = report.feedback || {};
  const scoreOf = (qid) => report.scoring?.answers?.find((a) => a.question_id === qid);
  const pctOf = (qid) => report.content.per.find((p) => p.id === qid);
  const missedOf = (qid) => fb.comparisons?.find((c) => c.question_id === qid)?.missed || [];
  const weakest = report.sections.find((x) => x.id === fb.weakest_answer?.question_id);
  const m = report.delivery.measures;
  const cq = report.scoring?.candidate_questions;

  return (
    <main className={u.shell}>
      <Header right={<Link href="/history">History</Link>} />

      <section className={s.top}>
        <div>
          <p className={u.sectionLabel}>{report.company} · {report.position} · {fmtDate(report.startedAt)}</p>
          <h1 className={`${u.title} ${s.title}`}>Interview report</h1>
          {fb.summary && <p className={u.lede} style={{ margin: "var(--space-3) 0 0" }}>{fb.summary}</p>}
        </div>
        <div className={s.scoreBlock}>
          <div className={`${s.big} display`}>{report.overall ?? "–"}<small className="mono">/ 100</small></div>
          <div className={`mono ${s.split}`}>Content {report.content.score ?? "–"} · Delivery {report.delivery.score ?? "–"}</div>
        </div>
      </section>
      <p className={s.note}>Content counts for 70% and delivery for 30%. AI scores can shift slightly between attempts, so use them to track your trend over several interviews, not as an exact grade.</p>

      <div className={u.columns}>
        <section className={u.section}>
          <h2 className={s.h2}>Strengths</h2>
          <ul className={s.list}>{(fb.strengths || []).map((t, i) => <li key={i} className={s.good}>{t}</li>)}</ul>
        </section>
        <section className={u.section}>
          <h2 className={s.h2}>To improve</h2>
          <ul className={s.list}>{(fb.improvements || []).map((t, i) => <li key={i} className={s.work}>{t}</li>)}</ul>
        </section>
      </div>

      <section className={u.section}>
        <h2 className={s.h2}>Question by question</h2>
        <ol className={s.questions}>
          {report.sections.map((sec, i) => {
            const sc = scoreOf(sec.id), p = pctOf(sec.id), missed = missedOf(sec.id);
            return (
              <li key={sec.id} className={s.q}>
                <div className={s.qHead}>
                  <span className="mono">{String(i + 1).padStart(2, "0")}</span>
                  <p className={s.qText}>{sec.question}</p>
                  <span className={`mono ${s.qScore}`}>{p ? `${p.total}/25` : "–"}</span>
                </div>
                {sc && (
                  <dl className={s.crit}>
                    {Object.entries(CRITERIA_LABELS).map(([k, label]) => (
                      <div key={k}><dt>{label} <span className="mono">{sc[k]?.score ?? "–"}/5</span></dt><dd>{sc[k]?.reason}</dd></div>
                    ))}
                  </dl>
                )}
                {missed.length > 0 && (
                  <div className={s.missed}><span>Compared with the model answer, you missed</span><ul>{missed.map((t, j) => <li key={j}>{t}</li>)}</ul></div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {weakest && fb.weakest_answer?.better_version && (
        <section className={u.section}>
          <h2 className={s.h2}>A better version of your weakest answer</h2>
          <p className={s.muted}>{weakest.question}</p>
          <p className={s.better}>{fb.weakest_answer.better_version}</p>
        </section>
      )}

      <section className={u.section}>
        <h2 className={s.h2}>Delivery</h2>
        <div className={s.measures}>
          {[["Eye contact", m.eyeContact], ["Pace", m.pace], ["Filler words", m.fillers], ["Head steadiness", m.steadiness], ["Answer length", m.length]]
            .filter(([, x]) => x)
            .map(([label, x]) => (
              <div key={label} className={s.measure}>
                <span className={s.muted}>{label}</span>
                <strong className="mono">{x.value ?? "–"}{x.value != null ? x.unit : ""}</strong>
                <span className={s.target}>{x.target}</span>
                <span className={`mono ${s.mScore}`}>{x.score ?? "–"}/100</span>
              </div>
            ))}
        </div>
        {report.delivery.camera ? <EyeChart perAnswer={report.delivery.perAnswer} /> : <p className={s.muted}>Camera was off, so delivery uses your speech only (pace, fillers, length).</p>}
        {report.delivery.camera && <p className={s.note}>Measured on your device. Your video was never recorded or sent anywhere.</p>}
      </section>

      {cq && (
        <section className={u.section}>
          <h2 className={s.h2}>Your questions for Javis <span className="mono">{cq.score}/5</span></h2>
          <p style={{ margin: 0 }}>{cq.reason}</p>
        </section>
      )}

      <section className={u.section}>
        <div className={s.replayHead}>
          <h2 className={s.h2} style={{ margin: 0 }}>Transcript</h2>
          <button className="btn btn-outline" onClick={() => setOpenTurns(!openTurns)}>{openTurns ? "Hide transcript" : "Replay the interview"}</button>
        </div>
        {openTurns && (
          <ol className={s.chat}>
            {report.turns.map((t, i) => {
              const sec = report.sections.find((x) => x.index === t.qIndex);
              const sc = t.role === "candidate" && sec ? pctOf(sec.id) : null;
              return (
                <li key={i} className={t.role === "javis" ? s.javis : s.you}>
                  <span className={s.who}>{t.role === "javis" ? "Javis" : "You"}{t.icebreaker ? " · warm-up" : ""}</span>
                  <p>{t.text}</p>
                  {sc && <span className={`mono ${s.chip}`}>{sc.total}/25 for this question</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className={u.actions}>
        <Link href="/interview/setup" className="btn btn-primary">Practise again</Link>
        <Link href="/questions" className="btn btn-outline">Back to questions</Link>
      </div>
    </main>
  );
}

export default function ReportPage() {
  return <Suspense fallback={null}><Report /></Suspense>;
}
