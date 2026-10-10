"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { getHistory } from "@/lib/client/storage";
import u from "../ui.module.css";
import s from "./history.module.css";

const fmtDate = (t) => new Date(t).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

// Overall score over time, oldest to newest.
function Trend({ items }) {
  const pts = [...items].reverse().filter((r) => typeof r.overall === "number");
  if (pts.length < 2) return null;
  const W = 560, H = 120, pad = 20;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - (v / 100) * (H - pad * 2);
  const d = pts.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.overall).toFixed(1)}`).join(" ");
  return (
    <svg className={s.trend} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Overall score over time">
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className={s.base} />
      <path d={d} className={s.line} />
      {pts.map((r, i) => (
        <g key={r.id}>
          <circle cx={x(i)} cy={y(r.overall)} r="3.5" className={s.dot} />
          <text x={x(i)} y={y(r.overall) - 8} textAnchor="middle" className={s.val}>{r.overall}</text>
        </g>
      ))}
    </svg>
  );
}

export default function History() {
  const [items, setItems] = useState(null);
  useEffect(() => setItems(getHistory()), []);
  if (!items) return <main className={u.shell}><Header /></main>;

  return (
    <main className={u.shell}>
      <Header right={<Link href="/questions">Questions</Link>} />
      <section className={u.pageTop}>
        <p className={`${u.sectionLabel} ${u.pageTopLabel}`}>Your progress</p>
        <h1 className={`${u.title} ${u.pageTopTitle}`}>History</h1>
      </section>
      {items.length === 0 ? (
        <p className={u.lede} style={{ marginTop: "var(--space-4)" }}>No interviews yet. Your reports will appear here after each mock interview.</p>
      ) : (
        <>
          <section className={u.section} style={{ marginTop: "var(--space-4)" }}>
            <p className={s.muted}>Overall score over time. Look at the trend rather than any single number.</p>
            <Trend items={items} />
          </section>
          <ol className={s.list}>
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`/report?id=${r.id}`} className={s.row}>
                  <span className={`mono ${s.date}`}>{fmtDate(r.startedAt)}</span>
                  <span className={s.role}>{r.position}<span> · {r.company}</span></span>
                  <span className={`mono ${s.sub}`}>C {r.content?.score ?? "–"} · D {r.delivery?.score ?? "–"}</span>
                  <span className={`display ${s.score}`}>{r.overall ?? "–"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
