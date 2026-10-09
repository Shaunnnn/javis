"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { getApplication } from "@/lib/client/storage";
import u from "./ui.module.css";
import h from "./home.module.css";

// "software engineer" -> "Software Engineer"; leaves mixed case like "iOS" alone.
const tidy = (t = "") => (t === t.toLowerCase() ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : t);

const NO_EDITOR = "Technical questions are answered out loud, as in a verbal round. There is no code editor.";

export default function Home() {
  const [app, setApp] = useState(undefined); // undefined = not loaded yet
  useEffect(() => setApp(getApplication()), []);

  return (
    <main className={u.shell}>
      <Header />
      {app === undefined ? null : app ? (
        <section className={`${h.current} fade-in`}>
          <p className={`${u.sectionLabel} ${h.currentLabel}`}>Current application</p>
          <h1 className={`${u.title} ${h.currentTitle}`}>{tidy(app.position)}</h1>
          <p className={`${u.lede} ${h.currentCompany}`}>{tidy(app.company)}</p>
          <div className={h.currentActions}>
            <Link href="/new" className="btn btn-outline">Start a new application</Link>
            <Link href="/application" className="btn btn-primary">Continue</Link>
          </div>
        </section>
      ) : (
        <section className={`${h.hero} fade-in`}>
          <div>
            <h1 className={u.title}>Rehearse the interview before it counts.</h1>
            <p className={u.lede}>
              Give Javis your resume and the job you're applying for. He'll prepare questions with model
              answers built from your experience, then interview you out loud.
            </p>
            <div className={u.actions}>
              <Link href="/new" className="btn btn-primary">Start a new application</Link>
            </div>
            <p className={h.caveat}>{NO_EDITOR}</p>
          </div>
          <ol className={h.steps} aria-label="How it works">
            <li>
              <span className="mono">01</span>
              <div><strong>Prepare</strong><p>Upload your resume and the job. Get tailored questions with model answers, ten at a time.</p></div>
            </li>
            <li>
              <span className="mono">02</span>
              <div><strong>Interview</strong><p>Javis asks out loud, listens, and follows up on what you say, like a real interviewer.</p></div>
            </li>
            <li>
              <span className="mono">03</span>
              <div><strong>Review</strong><p>A scored report on what you said and how you said it, with a better version of your weakest answer.</p></div>
            </li>
          </ol>
        </section>
      )}
      {app && <p className={u.note}>{NO_EDITOR}</p>}
    </main>
  );
}
