// Builds the question plan before the interview starts, so Javis never repeats or skips questions.
// A plan item is { id, question, model_answer } from the list, or { surprise: true } for a new one Javis writes.

const TYPES_FOR = {
  hr: ["role-fit", "gap", "behavioral"],
  behavioral: ["behavioral", "role-fit", "gap"],
  technical: ["technical", "gap", "role-fit"],
};
const isOpener = (q) => /tell me about yourself/i.test(q.question);

export function buildPlan(questions, settings) {
  if (settings.mode === "targeted") {
    return questions.filter((q) => q.selected).map(({ id, question, model_answer }) => ({ id, question, model_answer }));
  }
  const mains = settings.timeLimit >= 30 ? 7 : 5; // plus 1 to 2 surprises: 6-8 in total
  const surprises = settings.timeLimit >= 30 ? 2 : 1;
  const wanted = TYPES_FOR[settings.type] || TYPES_FOR.behavioral;

  const opener = questions.find(isOpener) || { id: null, question: "Tell me about yourself.", model_answer: "" };
  const rest = questions.filter((q) => !isOpener(q));
  // Favour unpractised questions of the wanted types; a little randomness so each interview differs.
  const score = (q) => (q.practised ? 2 : 0) + (wanted.indexOf(q.type) === -1 ? 3 : wanted.indexOf(q.type) * 0.5) + Math.random() * 1.5;
  const picked = [...rest].sort((a, b) => score(a) - score(b)).slice(0, mains - 1);

  // Realistic order: motivation and fit, then experience, then technical and scenarios, then gaps.
  const rank = (q) => (q.type === "role-fit" ? 0 : q.type === "behavioral" ? 1 : q.type === "technical" ? 2 : 3);
  picked.sort((a, b) => rank(a) - rank(b));
  const plan = [opener, ...picked].map(({ id, question, model_answer }) => ({ id, question, model_answer }));
  // Surprises go in the second half, before the gap questions.
  for (let i = 0; i < surprises; i++) plan.splice(Math.max(2, plan.length - 1 - i * 3), 0, { surprise: true });
  return plan;
}
