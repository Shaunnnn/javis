"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { streamLLM, arrayItemParser } from "@/lib/client/api";
import { getApplication, getQuestions, saveQuestions } from "@/lib/client/storage";
import u from "../ui.module.css";
import s from "./questions.module.css";

const CAP = 50;
const BATCH = 10;
const TYPES = [
  { key: "all", label: "All" },
  { key: "behavioral", label: "Behavioral" },
  { key: "technical", label: "Technical" },
  { key: "role-fit", label: "Role fit" },
  { key: "gap", label: "Gaps" },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

const tidy = (t = "") => (t === t.toLowerCase() ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : t);
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// Keep only well-formed questions that aren't repeats of ones already in the list.
function cleanBatch(raw, existing) {
  const seen = new Set(existing.map((q) => norm(q.question)));
  const out = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    if (!q || typeof q.question !== "string" || typeof q.model_answer !== "string") continue;
    const key = norm(q.question);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const type = TYPE_LABEL[q.type] && q.type !== "all" ? q.type : "role-fit";
    out.push({
      question: q.question.trim(),
      type,
      model_answer: q.model_answer.trim(),
      tips: Array.isArray(q.tips) ? q.tips.filter((t) => typeof t === "string").slice(0, 4) : [],
    });
  }
  return out;
}

export default function Questions() {
  const [app, setApp] = useState(undefined);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } while streaming
  const [error, setError] = useState("");

  useEffect(() => {
    const a = getApplication();
    setApp(a);
    if (a) setItems(getQuestions(a.id));
  }, []);

  function update(next) {
    setItems(next);
    saveQuestions(app.id, next);
  }

  async function generate() {
    if (busy || items.length >= CAP) return;
    setBusy(true);
    setError("");
    const count = Math.min(BATCH, CAP - items.length);
    const batch = Math.floor(items.length / BATCH) + 1;
    let n = items.reduce((m, q) => Math.max(m, Number(q.id.slice(1)) || 0), 0);
    let acc = items;
    let added = 0;
    setProgress({ done: 0, total: count });
    try {
      const parse = arrayItemParser();
      await streamLLM(
        {
          prompt: "questions",
          vars: {
            company: app.company,
            position: app.position,
            profile: app.profile,
            resume: app.resumeText || "(Not available as text; use the profile.)",
            existing_questions: items.length ? items.map((q) => `- ${q.question}`).join("\n") : "(none yet)",
            count: String(count),
          },
          model: "strong",
          json: true,
          temperature: 0.7,
        },
        (text) => {
          // Each question is added and saved the moment it's complete.
          for (const raw of parse(text)) {
            if (added >= count) break;
            const [q] = cleanBatch([raw], acc);
            if (!q) continue;
            acc = [...acc, { ...q, id: `q${++n}`, batch, practised: false, selected: false }];
            added++;
            update(acc);
            setProgress({ done: added, total: count });
          }
        }
      );
      if (!added) throw new Error("Javis didn't come back with new questions. Try again.");
      if (added < count) setError(`Javis wrote ${added} of ${count} questions before stopping. Generate again for more.`);
    } catch (e) {
      setError(added ? `Stopped after ${added} questions: ${e.message}` : e.message || String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const toggle = (id, field) => update(items.map((q) => (q.id === id ? { ...q, [field]: !q[field] } : q)));

  const counts = useMemo(() => {
    const c = { all: items.length };
    for (const q of items) c[q.type] = (c[q.type] || 0) + 1;
    return c;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((q) => q.type === filter);
  const selected = items.filter((q) => q.selected).length;
  const practised = items.filter((q) => q.practised).length;
  const atCap = items.length >= CAP;

  if (app === undefined) return <main className={u.shell}><Header /></main>;
  if (!app) {
    return (
      <main className={u.shell}>
        <Header />
        <h1 className={u.title}>No application yet</h1>
        <div className={u.actions}><Link href="/new" className="btn btn-primary">Start a new application</Link></div>
      </main>
    );
  }

  return (
    <main className={u.shell}>
      <Header right={<Link href="/application">Back to analysis</Link>} />

      <section className={s.top}>
        <div>
          <p className={u.sectionLabel}>{tidy(app.company)} · {tidy(app.position)}</p>
          <h1 className={`${u.title} ${s.title}`}>Questions</h1>
        </div>
        <div className={s.topActions}>
          <span className={`mono ${s.counter}`}>{items.length} / {CAP}</span>
          {items.length > 0 && (
            <button className="btn btn-outline" type="button" onClick={() => window.print()}>Export PDF</button>
          )}
          <button className="btn btn-primary" type="button" onClick={generate} disabled={busy || atCap}>
            {busy ? (progress?.done ? `Writing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : "Thinking…") : items.length ? `Generate ${Math.min(BATCH, CAP - items.length)} more` : "Generate 10 questions"}
          </button>
        </div>
      </section>

      {busy && (
        <p className={s.status} role="status">
          {progress?.done
            ? `${progress.done} of ${progress.total} written. The rest appear as Javis finishes them.`
            : "Javis is reading your resume and the role. The first question appears in a few seconds."}
        </p>
      )}
      {atCap && <p className={s.status}>That's the full set of {CAP}. Past this, questions start repeating themselves, so practise these instead.</p>}
      {error && <p className={u.error} role="alert">{error}</p>}

      {items.length === 0 && !busy ? (
        <p className={`${u.lede} ${s.empty}`}>
          Each batch adds ten new questions, never repeating earlier ones, with a model answer written from your own
          experience. Tick questions to practise them in a targeted interview later.
        </p>
      ) : (
        <>
          <div className={s.bar}>
            <div className={s.filters} role="tablist" aria-label="Filter by type">
              {TYPES.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={filter === t.key}
                  className={`${s.filter} ${filter === t.key ? s.filterOn : ""}`} onClick={() => setFilter(t.key)}>
                  {t.label} <span className="mono">{counts[t.key] || 0}</span>
                </button>
              ))}
            </div>
            <span className={s.summary}>{selected} selected for practice · {practised} practised</span>
          </div>

          <ol className={s.list}>
            {shown.map((q) => (
              <li key={q.id} className={`${s.item} ${open[q.id] ? s.itemOpen : ""}`}>
                <label className={s.pick} title="Select for targeted practice">
                  <input type="checkbox" checked={q.selected} onChange={() => toggle(q.id, "selected")}
                    aria-label={`Select question ${q.id.slice(1)} for practice`} />
                </label>
                <span className={`mono ${s.num}`}>{q.id.slice(1).padStart(2, "0")}</span>
                <div className={s.body}>
                  <span className={s.type}>{TYPE_LABEL[q.type]}</span>
                  <p className={s.question}>{q.question}</p>
                  <button type="button" className={s.reveal} onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}
                    aria-expanded={!!open[q.id]}>
                    {open[q.id] ? "Hide model answer" : "Show model answer"}
                  </button>
                  <div className={s.answer}>
                    <p>{q.model_answer}</p>
                    {q.tips.length > 0 && (
                      <ul className={s.tips}>{q.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    )}
                  </div>
                </div>
                <button type="button" className={`${s.practised} ${q.practised ? s.practisedOn : ""}`}
                  onClick={() => toggle(q.id, "practised")} aria-pressed={q.practised}>
                  {q.practised ? "✓ Practised" : "Mark practised"}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
