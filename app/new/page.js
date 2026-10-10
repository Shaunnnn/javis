"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { askLLM, fetchJobPage } from "@/lib/client/api";
import { pdfToText, imageToBase64 } from "@/lib/client/files";
import { saveApplication } from "@/lib/client/storage";
import u from "../ui.module.css";
import s from "./new.module.css";

const STAGES = ["Reading your resume", "Reading the job posting", "Javis is reviewing your resume against the role"];

const Req = () => <span className={s.req} aria-label="required">*</span>;

function FilePicker({ id, accept, file, onChange, label }) {
  return (
    <div className={s.fileRow}>
      <input id={id} type="file" accept={accept} className={s.hiddenInput}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <label htmlFor={id} className={`btn btn-outline ${s.fileBtn}`}>{file ? "Change file" : label}</label>
      {file && <span className={s.fileName}>{file.name}</span>}
    </div>
  );
}

export default function NewApplication() {
  const router = useRouter();
  const [resume, setResume] = useState(null);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jobMode, setJobMode] = useState("link");
  const [link, setLink] = useState("");
  const [shot, setShot] = useState(null);
  const [linkNotice, setLinkNotice] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const jobReady = jobMode === "link" ? link.trim() : shot;
  const ready = resume && jobReady && agreed && !status;

  async function analyse(e) {
    e.preventDefault();
    if (!ready) return;
    setError("");
    const files = [];
    try {
      // 1. Resume
      setStatus(STAGES[0]);
      let resumeText = "";
      if (resume.type === "application/pdf" || /\.pdf$/i.test(resume.name)) {
        resumeText = await pdfToText(resume);
        if (resumeText.length < 150) {
          throw new Error("This PDF looks like a scan, so its text can't be read. Upload a screenshot or photo of your resume instead.");
        }
      } else if (resume.type.startsWith("image/")) {
        files.push({ label: "the candidate's resume", ...(await imageToBase64(resume)) });
        resumeText = "(The resume is the attached image labelled \"the candidate's resume\".)";
      } else {
        throw new Error("Upload your resume as a PDF or an image.");
      }

      // 2. Job details
      let jobText = "";
      if (jobMode === "link") {
        setStatus(STAGES[1]);
        const page = await fetchJobPage(link);
        if (!page.ok) {
          setJobMode("screenshot");
          setLinkNotice(page.reason);
          setStatus("");
          return;
        }
        jobText = page.text;
      } else {
        files.push({ label: "a screenshot of the job posting", ...(await imageToBase64(shot)) });
        jobText = "(The job posting is the attached image labelled \"a screenshot of the job posting\".)";
      }

      // 3. Analysis
      setStatus(STAGES[2]);
      const profile = await askLLM({
        prompt: "analysis",
        vars: {
          company: company.trim() || "(not given; take it from the job details)",
          position: position.trim() || "(not given; take it from the job details)",
          resume: resumeText,
          job_details: jobText,
        },
        files,
        model: "fast",
        json: true,
        temperature: 0.2,
      });

      saveApplication({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        company: company.trim() || profile.company || "Unknown company",
        position: position.trim() || profile.position || "Unknown role",
        jobLink: jobMode === "link" ? link.trim() : "",
        resumeText: files.some((f) => f.label.includes("resume")) ? "" : resumeText,
        profile,
      });
      router.push("/application");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("");
    }
  }

  return (
    <main className={u.shell}>
      <Header right={<a href="/">Cancel</a>} />
      <h1 className={u.title}>New application</h1>
      <p className={u.lede}>Your resume and the job you're applying for. Javis uses both to tailor every question.</p>

      <form className={s.form} onSubmit={analyse}>
        <div className={s.field}>
          <div>
            <span className={s.label}>Resume <Req /></span>
            <p className={s.hint}>A PDF works best; a screenshot or photo also works. Remove your home address and NRIC or ID number first. Javis doesn't need them.</p>
          </div>
          <FilePicker id="resume" accept="application/pdf,image/*" file={resume} onChange={setResume} label="Choose resume" />
        </div>

        <div className={s.field}>
          <div>
            <span className={s.label}>The role</span>
            <p className={s.hint}>Optional. Leave blank and Javis takes them from the job posting.</p>
          </div>
          <div className={s.row}>
          <div>
            <label className={s.label} htmlFor="company">Company</label>
            <input id="company" className={s.input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Grab" autoComplete="organization" />
          </div>
          <div>
            <label className={s.label} htmlFor="position">Position</label>
            <input id="position" className={s.input} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Software Engineer, Payments" />
          </div>
          </div>
        </div>

        <div className={s.field}>
          <div>
            <span className={s.label}>Job posting <Req /></span>
            <p className={s.hint}>A link to the posting. If the site blocks reading it, use a screenshot.</p>
          </div>
          <div>
          <div className={s.tabs} role="tablist">
            {["link", "screenshot"].map((m) => (
              <button key={m} type="button" role="tab" aria-selected={jobMode === m}
                className={`${s.tab} ${jobMode === m ? s.tabOn : ""}`} onClick={() => setJobMode(m)}>
                {m === "link" ? "Link" : "Screenshot"}
              </button>
            ))}
          </div>
          {jobMode === "link" ? (
            <input className={s.input} type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" aria-label="Job posting link" />
          ) : (
            <FilePicker id="shot" accept="image/*" file={shot} onChange={setShot} label="Choose screenshot" />
          )}
          {linkNotice && jobMode === "screenshot" && <p className={s.notice}>{linkNotice}</p>}
          </div>
        </div>

        <div className={s.field}>
          <span className={s.label}>Privacy <Req /></span>
          <div className={s.privacy}>
          <p>Your resume, questions and results are stored only in this browser. Nothing is saved on a server.</p>
          <p>To analyse them, text and images are sent to Google's Gemini API. On Gemini's free tier, Google may use this data to improve its products.</p>
          <label className={s.check}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I understand and agree to continue.</span>
          </label>
          </div>
        </div>

        <div className={s.submit}>
          <span />
          <div>
            <button className="btn btn-primary" type="submit" disabled={!ready}>Analyse</button>
            {status && (
              <ol className={s.stages} role="status" aria-live="polite">
                {STAGES.map((label, i) => {
                  const at = STAGES.indexOf(status);
                  const state = i < at ? "done" : i === at ? "now" : "next";
                  return (
                    <li key={label} className={s[state]}>
                      {state === "done" ? "✓ " : ""}{label}
                      {state === "now" && <span className={s.dots} aria-hidden><i>.</i><i>.</i><i>.</i></span>}
                    </li>
                  );
                })}
                <li className={s.note}>Usually takes 5 to 15 seconds.</li>
              </ol>
            )}
            {error && <p className={u.error} role="alert">{error}</p>}
          </div>
        </div>
      </form>
    </main>
  );
}
