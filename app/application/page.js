"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { getApplication } from "@/lib/client/storage";
import u from "../ui.module.css";

function List({ label, items }) {
  return (
    <section className={u.section}>
      <h2 className={u.sectionLabel} style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>{label}</h2>
      {items?.length ? (
        <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
          {items.map((t, i) => <li key={i} style={{ marginBottom: "var(--space-2)" }}>{t}</li>)}
        </ul>
      ) : (
        <p style={{ margin: 0, color: "var(--muted)" }}>Nothing noted.</p>
      )}
    </section>
  );
}

export default function Application() {
  const [app, setApp] = useState(undefined);
  useEffect(() => setApp(getApplication()), []);

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

  const p = app.profile || {};
  return (
    <main className={u.shell}>
      <Header right={<Link href="/new">New application</Link>} />
      <p className={u.sectionLabel} style={{ marginTop: "var(--space-6)" }}>{app.company}</p>
      <h1 className={u.title} style={{ marginTop: 0 }}>{app.position}</h1>
      <p className={u.lede}>
        {p.candidate_name ? `${p.candidate_name}, here` : "Here"} is how your experience lines up with the role.
        Every question Javis prepares builds on this.
      </p>

      {p.company_context && (
        <section className={u.section}>
          <h2 className={u.sectionLabel} style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>About the role</h2>
          <p className={u.read} style={{ margin: 0 }}>{p.company_context}</p>
        </section>
      )}

      {/* Left: the role. Right: you. Read across to compare. */}
      <div className={u.columns}>
        <List label="What the role needs" items={p.role_requirements} />
        <List label="Your strongest experience" items={p.experience_highlights} />
        <List label="Gaps to prepare for" items={p.gaps} />
        <List label="Your skills" items={p.candidate_skills} />
      </div>

      <p className={u.note}>Next: interview questions with model answers (Step 3).</p>
    </main>
  );
}
