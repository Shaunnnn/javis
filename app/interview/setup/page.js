"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Header from "@/components/Header";
import { getApplication, getQuestions, getInterviewSettings, saveInterviewSettings } from "@/lib/client/storage";
import u from "../../ui.module.css";
import s from "../interview.module.css";

const MIN_FULL = 5;

function Choice({ name, value, current, onChange, title, desc, disabled }) {
  return (
    <label className={`${s.choice} ${disabled ? s.choiceOff : ""}`}>
      <input type="radio" name={name} value={value} checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
      <span><strong>{title}</strong>{desc && <span>{desc}</span>}</span>
    </label>
  );
}

function Setup() {
  const router = useRouter();
  const params = useSearchParams();
  const [app, setApp] = useState(undefined);
  const [questions, setQuestions] = useState([]);
  const [st, setSt] = useState(null);

  useEffect(() => {
    const a = getApplication();
    setApp(a);
    if (!a) return;
    const q = getQuestions(a.id);
    setQuestions(q);
    const saved = getInterviewSettings();
    const selected = q.filter((x) => x.selected).length;
    const wantTargeted = params.get("mode") === "targeted" && selected > 0;
    setSt({ ...saved, mode: wantTargeted ? "targeted" : saved.mode === "targeted" && !selected ? "full" : saved.mode });
  }, [params]);

  if (app === undefined || (app && !st)) return <main className={u.shell}><Header /></main>;
  if (!app) {
    return (
      <main className={u.shell}>
        <Header />
        <h1 className={u.title}>No application yet</h1>
        <div className={u.actions}><Link href="/new" className="btn btn-primary">Start a new application</Link></div>
      </main>
    );
  }

  const selected = questions.filter((q) => q.selected).length;
  const set = (k) => (v) => setSt((p) => ({ ...p, [k]: v }));
  const canStart = st.mode === "targeted" ? selected > 0 : questions.length >= MIN_FULL;

  function next() {
    saveInterviewSettings(st);
    router.push("/interview/check");
  }

  return (
    <main className={u.shell}>
      <Header right={<Link href="/questions">Back to questions</Link>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>{app.company} · {app.position}</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Interview setup</h1>
      </section>
      <p className={u.lede} style={{ marginTop: "var(--space-3)" }}>Choose how Javis runs this interview. You'll check your mic, speakers and camera next.</p>

      <div className={s.row}>
        <div><span className={s.label}>Mode</span><p className={s.hint}>What Javis asks.</p></div>
        <div className={s.choices}>
          <Choice name="mode" value="full" current={st.mode} onChange={set("mode")} title="Full mock interview"
            desc={`5 to 8 questions from your list, favouring ones not yet practised, plus 1 or 2 surprises.${questions.length < MIN_FULL ? ` Needs at least ${MIN_FULL} questions; you have ${questions.length}.` : ""}`} />
          <Choice name="mode" value="targeted" current={st.mode} onChange={set("mode")} disabled={!selected} title="Targeted practice"
            desc={selected ? `Only the ${selected} question${selected > 1 ? "s" : ""} you ticked, with follow-ups and no surprises.` : "Tick questions on the questions page first."} />
        </div>
      </div>

      <div className={s.row}>
        <div><span className={s.label}>Interviewer style</span><p className={s.hint}>Changes Javis's tone and how hard he pushes on follow-ups.</p></div>
        <div className={s.choices}>
          <Choice name="style" value="friendly" current={st.style} onChange={set("style")} title="Friendly" desc="Warm and encouraging. Gentle follow-ups." />
          <Choice name="style" value="neutral" current={st.style} onChange={set("style")} title="Neutral" desc="Polite and professional, like most real interviews." />
          <Choice name="style" value="tough" current={st.style} onChange={set("style")} title="Tough" desc="Demanding. Presses for specifics and challenges vague answers. Never rude." />
        </div>
      </div>

      {st.mode === "full" && (
        <div className={s.row}>
          <div><span className={s.label}>Interview type</span><p className={s.hint}>Which kinds of questions Javis draws from your list.</p></div>
          <div className={s.choices}>
            <Choice name="type" value="hr" current={st.type} onChange={set("type")} title="HR screening" desc="Motivation, background and fit." />
            <Choice name="type" value="behavioral" current={st.type} onChange={set("type")} title="Behavioral" desc="Past situations and how you handled them, plus fit." />
            <Choice name="type" value="technical" current={st.type} onChange={set("type")} title="Technical" desc="Your technical work, design choices and scenarios, answered out loud." />
          </div>
        </div>
      )}

      <div className={s.row}>
        <div><span className={s.label}>Time limit</span><p className={s.hint}>Javis wraps up when time is nearly up.</p></div>
        <div className={s.inline}>
          {[20, 30].map((m) => (
            <Choice key={m} name="time" value={m} current={st.timeLimit} onChange={set("timeLimit")} title={`${m} minutes`} />
          ))}
        </div>
      </div>

      <div className={s.row}>
        <div><span className={s.label}>Camera</span><p className={s.hint}>Optional. Used later to score eye contact. Video never leaves your device.</p></div>
        <div className={s.inline}>
          <Choice name="camera" value={true} current={st.camera} onChange={set("camera")} title="On" />
          <Choice name="camera" value={false} current={st.camera} onChange={set("camera")} title="Off" />
        </div>
      </div>

      <div className={s.footer}>
        {!canStart && (
          <span className={s.footNote}>
            {st.mode === "full" ? <>Generate at least {MIN_FULL} questions first. <Link href="/questions">Go to questions</Link></> : "Tick at least one question first."}
          </span>
        )}
        <button className="btn btn-primary" onClick={next} disabled={!canStart}>Continue to device check</button>
      </div>
    </main>
  );
}

export default function SetupPage() {
  return <Suspense fallback={null}><Setup /></Suspense>;
}
