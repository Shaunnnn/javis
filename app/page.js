"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { getApplication } from "@/lib/client/storage";
import u from "./ui.module.css";

export default function Home() {
  const [app, setApp] = useState(undefined); // undefined = not loaded yet
  useEffect(() => setApp(getApplication()), []);

  return (
    <main className={u.shell}>
      <Header />
      {app === undefined ? null : app ? (
        <section className="fade-in">
          <p className={u.sectionLabel} style={{ marginTop: "var(--space-6)" }}>Current application</p>
          <h1 className={u.title} style={{ marginTop: 0 }}>{app.position}</h1>
          <p className={u.lede}>{app.company}</p>
          <div className={u.actions}>
            <Link href="/application" className="btn btn-primary">Continue</Link>
            <Link href="/new" className="btn btn-outline">Start a new application</Link>
          </div>
        </section>
      ) : (
        <section className="fade-in">
          <h1 className={u.title}>Rehearse the interview before it counts.</h1>
          <p className={u.lede}>
            Give Javis your resume and the job you're applying for. He'll prepare questions with model
            answers built from your experience, then interview you out loud.
          </p>
          <div className={u.actions}>
            <Link href="/new" className="btn btn-primary">Start a new application</Link>
          </div>
        </section>
      )}
      <p className={u.note}>Technical questions are answered out loud, as in a verbal round. There is no code editor.</p>
    </main>
  );
}
