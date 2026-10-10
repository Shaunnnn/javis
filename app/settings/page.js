"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { getPrefs, savePrefs, clearAll } from "@/lib/client/storage";
import u from "../ui.module.css";
import s from "../interview/interview.module.css";

function Choice({ name, value, current, onChange, title, desc }) {
  return (
    <label className={s.choice}>
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
      <span><strong>{title}</strong>{desc && <span>{desc}</span>}</span>
    </label>
  );
}

export default function Settings() {
  const router = useRouter();
  const [prefs, setPrefs] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setPrefs(getPrefs()), []);
  const set = (k) => (v) => { const next = { ...prefs, [k]: v }; setPrefs(next); savePrefs(next); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  async function deleteAll() {
    setDeleting(true);
    await clearAll();
    router.push("/");
  }

  if (!prefs) return <main className={u.shell}><Header /></main>;
  return (
    <main className={u.shell}>
      <Header right={<Link href="/">Home</Link>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>{saved ? "Saved" : "Preferences"}</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>Settings</h1>
      </section>
      <p className={u.lede} style={{ marginTop: "var(--space-3)" }}>Changes save straight away and apply to your next interview.</p>

      <div className={s.row}>
        <div><span className={s.label}>Captions</span><p className={s.hint}>Show Javis's words on screen as he speaks. You can still switch them during an interview.</p></div>
        <div className={s.inline}>
          <Choice name="captions" value={true} current={prefs.captions} onChange={set("captions")} title="On" />
          <Choice name="captions" value={false} current={prefs.captions} onChange={set("captions")} title="Off" />
        </div>
      </div>

      <div className={s.row}>
        <div><span className={s.label}>How Javis addresses you</span><p className={s.hint}>Used in his greeting and closing.</p></div>
        <div className={s.inline}>
          <Choice name="address" value="name" current={prefs.address} onChange={set("address")} title="My name" />
          <Choice name="address" value="sir" current={prefs.address} onChange={set("address")} title="Sir" />
          <Choice name="address" value="maam" current={prefs.address} onChange={set("address")} title="Ma'am" />
        </div>
      </div>

      <div className={`${s.row} ${s.rowTop}`}>
        <div>
          <span className={s.label}>Delete all my data</span>
          <p className={s.hint}>Removes everything this app stored in this browser: your resume analysis, questions, interviews, reports and settings, plus the downloaded voice and face models. This can't be undone.</p>
        </div>
        <div>
          {!confirm ? (
            <button className="btn btn-outline" onClick={() => setConfirm(true)} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>Delete all my data</button>
          ) : (
            <div className={s.help} style={{ marginTop: 0 }}>
              <p style={{ margin: "0 0 var(--space-3)" }}>Delete everything? Your applications, questions and reports will be gone for good.</p>
              <div className={s.actions}>
                <button className="btn btn-outline" onClick={deleteAll} disabled={deleting} style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{deleting ? "Deleting…" : "Yes, delete everything"}</button>
                <button className="btn btn-outline" onClick={() => setConfirm(false)} disabled={deleting}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
