"use client";
import { useState } from "react";
import s from "./page.module.css";

// Step 1 sample page: shows the visual direction and tests /api/llm.
export default function Home() {
  const [reply, setReply] = useState(null);
  const [status, setStatus] = useState("idle");

  async function ping() {
    setStatus("waiting");
    setReply(null);
    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "ping" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setReply(data.result);
      setStatus("ok");
    } catch (e) {
      setReply(String(e.message || e));
      setStatus("error");
    }
  }

  return (
    <main className={s.shell}>
      <header className={s.header}>
        <h1 className={s.brand}>Javis <span>·</span> AI interview coach</h1>
        <span className={s.sample}>Design sample</span>
      </header>

      <div className={`${s.meta} label`}>
        <span>Mock interview · Question 3 of 6</span>
        <span className="mono">04:12</span>
      </div>

      <h2 className={`${s.question} fade-in`}>Tell me about a time you had to change course halfway through a project.</h2>
      <p className={s.lede}>Behavioral · Use the STAR structure: the situation, your task, what you did, and the result.</p>

      <div className={s.actions}>
        <button className="btn btn-primary" onClick={ping} disabled={status === "waiting"}>
          {status === "waiting" ? "Connecting to Javis…" : "Ask Javis to introduce himself"}
        </button>
        <button className="btn btn-outline" type="button">See model answer</button>
      </div>

      {reply && (
        <div className={`${s.reply} ${status === "error" ? s.error : ""} fade-in`} role="status">
          <div className={s.speaker}>{status === "error" ? "Connection problem" : "Javis"}</div>
          <p>{reply}</p>
        </div>
      )}

      <section className={s.score} aria-label="Sample score">
        <div className={`${s.big} display`}>78<small>/ 100</small></div>
        <ul className={s.notes}>
          <li className={s.good}>Clear structure, with a measurable result</li>
          <li className={s.good}>Linked the example to the role's needs</li>
          <li className={s.work}>Explain why you changed course earlier</li>
        </ul>
      </section>

      <p className={s.footnote}>Technical questions are answered out loud, as in a verbal round. There is no code editor.</p>
    </main>
  );
}
