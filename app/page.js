"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import { getApplication, getQuestions, getHistory } from "@/lib/client/storage";
import u from "./ui.module.css";
import h from "./home.module.css";

const JavisCore = dynamic(() => import("@/components/JavisCore"), { ssr: false });

// "software engineer" -> "Software Engineer"; leaves mixed case like "iOS" alone.
const tidy = (t = "") => (t === t.toLowerCase() ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : t);
// "AI Data Project Intern (AI Data Service and Operations - Eco & Social Creation)"
//   -> title "AI Data Project Intern", detail "AI Data Service and Operations - Eco & Social Creation"
function splitRole(position = "") {
  const inBrackets = position.match(/[\(\[](.*?)[\)\]]/)?.[1] || "";
  const title = position.replace(/\s*[\(\[].*?[\)\]]\s*/g, " ").split(/\s+[-–—|]\s+/)[0].trim() || position;
  const rest = position.replace(/\s*[\(\[].*?[\)\]]\s*/g, " ").trim().slice(title.length).replace(/^\s*[-–—|,]\s*/, "");
  return { title, detail: [inBrackets, rest].filter(Boolean).join(" · ") };
}

const NO_EDITOR = "Technical questions are answered out loud, as in a verbal round. There is no code editor.";

const STEPS = [
  ["01", "Prepare", "Upload your resume and the job. Get tailored questions with model answers, ten at a time."],
  ["02", "Interview", "Javis asks out loud, listens, and follows up on what you say, like a real interviewer."],
  ["03", "Review", "A scored report on what you said and how you said it, with a better version of your weakest answer."],
];

export default function Home() {
  const [app, setApp] = useState(undefined); // undefined = not loaded yet
  const [power, setPower] = useState("off");
  const [hasHistory, setHasHistory] = useState(false);
  const faceRef = useRef(null);
  const volumeRef = useRef(0);

  useEffect(() => {
    setApp(getApplication());
    setHasHistory(getHistory().length > 0);
    // Javis boots up as the page opens, then idles.
    const a = setTimeout(() => setPower("booting"), 300);
    const b = setTimeout(() => setPower("on"), 3400);
    // His eyes follow your pointer, as if you were in front of him.
    const move = (e) => { faceRef.current = { x: (e.clientX / innerWidth) * 2 - 1, y: -((e.clientY / innerHeight) * 2 - 1) }; };
    addEventListener("pointermove", move);
    return () => { clearTimeout(a); clearTimeout(b); removeEventListener("pointermove", move); };
  }, []);

  return (
    <main className={`${u.shell} ${h.page}`}>
      <Header right={hasHistory ? <Link href="/history">History</Link> : null} />

      <div className={h.middle}>
        <section className={`${h.hero} fade-in`}>
          <div className={h.copy}>
            {app === undefined ? null : app ? (
              <>
                <p className={u.sectionLabel}>Current application</p>
                <h1 className={`${u.title} ${h.heading}`} style={{ margin: 0 }}>{tidy(splitRole(app.position).title)}</h1>
                <p className={u.lede} style={{ margin: "var(--space-2) 0 0" }}>
                  {[splitRole(app.position).detail, tidy(app.company)].filter(Boolean).join(" · ")}
                </p>
                <div className={u.actions}>
                  <Link href={getQuestions(app.id).length ? "/questions" : "/application"} className="btn btn-primary">Continue</Link>
                  <Link href="/new" className="btn btn-outline">Start a new application</Link>
                </div>
              </>
            ) : (
              <>
                <h1 className={`${u.title} ${h.heading}`} style={{ marginTop: 0 }}>Rehearse the interview before it counts.</h1>
                <p className={u.lede}>
                  Give Javis your resume and the job you're applying for. He'll prepare questions with model
                  answers built from your experience, then interview you out loud.
                </p>
                <div className={u.actions}>
                  <Link href="/new" className="btn btn-primary">Start a new application</Link>
                </div>
              </>
            )}
            <p className={h.caveat}>{NO_EDITOR}</p>
          </div>
          <div className={h.javis} aria-hidden>
            <JavisCore state="idle" power={power} volumeRef={volumeRef} faceRef={faceRef} background="#0d1524" />
          </div>
        </section>

        <ol className={h.steps} aria-label="How it works">
          {STEPS.map(([n, title, text]) => (
            <li key={n}>
              <span className="mono">{n}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>

      <footer className={h.footer}>
        <span>Stored only in this browser · Analysed with Google Gemini</span>
        <Link href="/settings">Settings</Link>
      </footer>
    </main>
  );
}
