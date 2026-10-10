"use client";
import Link from "next/link";
import Header from "@/components/Header";
import u from "../ui.module.css";

// The live interview screen arrives in Step 4c.
export default function Interview() {
  return (
    <main className={u.shell}>
      <Header />
      <h1 className={u.title}>Interview</h1>
      <p className={u.lede}>Your devices are ready. The live interview with Javis is built in the next part (4c).</p>
      <div className={u.actions}><Link href="/questions" className="btn btn-outline">Back to questions</Link></div>
    </main>
  );
}
