// Step 7: turning a finished interview into a report.
// Content is scored by Gemini (fixed rubric, temperature 0). Delivery is calculated here with
// simple formulas, so the same performance always gets the same delivery score.

const CRITERIA = ["relevance", "structure", "evidence", "role_fit", "depth"];
export const CRITERIA_LABELS = { relevance: "Relevance", structure: "Structure", evidence: "Evidence", role_fit: "Role fit", depth: "Depth" };

// Groups the conversation into one section per main question (ids like q12, or s1 for surprises).
export function sections(session) {
  const out = [];
  let surprise = 0;
  session.plan.forEach((item, i) => {
    const turns = session.turns.filter((t) => t.qIndex === i && !t.icebreaker);
    const answered = turns.some((t) => t.role === "candidate");
    if (!answered) return;
    const id = item.surprise ? `s${++surprise}` : item.id || `p${i + 1}`;
    // The question as Javis actually asked it: the first Javis line for this section.
    const asked = turns.find((t) => t.role === "javis")?.text || item.question || "";
    out.push({ id, index: i, question: item.surprise ? asked : item.question || asked, asked, model_answer: item.model_answer || "", turns });
  });
  return out;
}

export function transcriptText(secs) {
  return secs.map((s) =>
    `### question_id: ${s.id}\nMain question: ${s.question}\n` +
    s.turns.map((t) => `${t.role === "javis" ? "Javis" : "Candidate"}: ${t.text}`).join("\n")
  ).join("\n\n");
}

export function modelAnswersText(secs) {
  const withModel = secs.filter((s) => s.model_answer);
  return withModel.length ? withModel.map((s) => `${s.id}: ${s.model_answer}`).join("\n\n") : "(none)";
}

// Full marks inside the range; marks drop off gradually outside it.
const band = (x, lo, hi, perUnitBelow, perUnitAbove) =>
  x == null ? null : Math.max(0, Math.min(100, Math.round(x < lo ? 100 - (lo - x) * perUnitBelow : x > hi ? 100 - (x - hi) * perUnitAbove : 100)));

export function deliveryScores(session) {
  const d = session.turns.filter((t) => t.role === "candidate" && !t.icebreaker && t.delivery).map((t) => t.delivery);
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const pick = (k) => d.map((x) => x[k]).filter((v) => typeof v === "number");
  const cam = d.some((x) => x.camera);
  const totalSeconds = d.reduce((a, x) => a + (x.seconds || 0), 0);
  const fillersPerMin = totalSeconds > 5 ? d.reduce((a, x) => a + (x.fillers || 0), 0) / (totalSeconds / 60) : null;
  const measures = {
    eyeContact: cam ? { value: Math.round(mean(pick("eyeContactPct"))), unit: "%", score: band(mean(pick("eyeContactPct")), 60, 80, 2.5, 2), target: "60–80% (100% feels like staring)" } : null,
    pace: { value: pick("wpm").length ? Math.round(mean(pick("wpm"))) : null, unit: "wpm", score: band(mean(pick("wpm")), 130, 160, 1.5, 1.5), target: "130–160 words a minute" },
    fillers: { value: fillersPerMin == null ? null : +fillersPerMin.toFixed(1), unit: "/min", score: band(fillersPerMin, 0, 3, 0, 12), target: "under about 3 a minute" },
    steadiness: cam ? { value: Math.round(mean(pick("steadiness"))), unit: "/100", score: Math.round(mean(pick("steadiness"))), target: "little fidgeting or looking away" } : null,
    length: { value: pick("seconds").length ? Math.round(mean(pick("seconds"))) : null, unit: "s", score: band(mean(pick("seconds")), 60, 120, 0.8, 0.8), target: "about 1–2 minutes per main answer" },
  };
  const scored = Object.values(measures).filter((m) => m && m.score != null);
  return { measures, camera: cam, score: scored.length ? Math.round(mean(scored.map((m) => m.score))) : null, perAnswer: d };
}

export function contentScore(scoring) {
  const answers = scoring?.answers || [];
  const per = answers.map((a) => {
    const total = CRITERIA.reduce((n, c) => n + (Number(a[c]?.score) || 0), 0);
    return { id: a.question_id, total, outOf: 25, pct: Math.round((total / 25) * 100), avg: total / 5 };
  });
  const score = per.length ? Math.round(per.reduce((n, p) => n + p.pct, 0) / per.length) : null;
  return { per, score };
}

// Content counts for 70%, delivery for 30%.
export const overallScore = (content, delivery) =>
  content == null ? null : delivery == null ? content : Math.round(content * 0.7 + delivery * 0.3);
