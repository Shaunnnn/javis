// A made-up report for previewing the report page locally: open /report?id=demo (dev only).
const t0 = Date.now() - 3600_000;
const crit = (r, s, e, f, d, why) => ({
  relevance: { score: r, reason: why[0] }, structure: { score: s, reason: why[1] }, evidence: { score: e, reason: why[2] },
  role_fit: { score: f, reason: why[3] }, depth: { score: d, reason: why[4] },
});

const answers = [
  { question_id: "q1", ...crit(5, 4, 4, 4, 4, [
    "Answered directly with your background, current studies and what draws you to AI data work.",
    "Clear past-present-future flow, though the ending trailed off slightly.",
    "Mentioned the repricing bots at CPO and the Stock Watcher RAG project with concrete detail.",
    "Linked your data and automation work to data operations at TikTok.",
    "Handled the follow-up on why data quality matters with a sensible example."]) },
  { question_id: "q7", ...crit(4, 3, 2, 4, 3, [
    "Addressed why TikTok, mainly through the product and scale.",
    "Ideas came in a loose order rather than two or three clear reasons.",
    "Few specifics about the team or the Eco & Social Creation work itself.",
    "Connected your interest in AI to the role reasonably well.",
    "The follow-up on what you'd want to learn got a fairly general answer."]) },
  { question_id: "s1", ...crit(4, 4, 3, 5, 4, [
    "Responded to the scenario of labeler agreement dropping after a guideline change.",
    "Good sequence: check the guideline diff, sample disagreements, then retrain labelers.",
    "Would be stronger with a metric, such as the agreement threshold you'd aim to restore.",
    "Very relevant to day-to-day AI data operations.",
    "When pushed on deadlines, you weighed speed against quality well."]) },
  { question_id: "q12", ...crit(3, 2, 2, 3, 2, [
    "Partly answered the question about a time you disagreed with a teammate.",
    "No clear STAR shape: the situation and result were hard to follow.",
    "No outcome or numbers, so it's hard to see the impact.",
    "Collaboration matters in this role, but the link wasn't made.",
    "The follow-up asking what you'd do differently got a short answer."]) },
];

const turns = [
  { role: "javis", text: "Good evening, Shaun. I'm Javis, and I'll be conducting your interview today for the AI Data Project Intern role at TikTok. Before we begin, how are you feeling today?", qIndex: 0 },
  { role: "candidate", text: "A bit nervous, but good, thanks.", qIndex: 0, icebreaker: true },
  { role: "javis", text: "Perfectly natural. Let's start. Tell me about yourself.", qIndex: 0 },
  { role: "candidate", text: "I'm a computer science student. Last year I worked part-time at CPO, where I maintained Python repricing bots for Backmarket listings, and I've built a RAG chatbot over SEC filings called Stock Watcher. I'm drawn to roles where data quality directly shapes how well AI works.", qIndex: 0, delivery: { camera: true, eyeContactPct: 71, lookAways: 2, longDownLooks: 0, steadiness: 86, engagement: "medium", seconds: 64, words: 158, wpm: 148, fillers: 2 } },
  { role: "javis", text: "Ah, data quality. Why does it matter so much to you?", qIndex: 0 },
  { role: "candidate", text: "Because with the repricing bots, one bad data feed would push wrong prices live. Clean inputs saved us hours of fixes.", qIndex: 0, delivery: { camera: true, eyeContactPct: 74, lookAways: 1, longDownLooks: 0, steadiness: 88, engagement: "medium", seconds: 22, words: 55, wpm: 150, fillers: 1 } },
  { role: "javis", text: "Very good. Why do you want to work at TikTok?", qIndex: 1 },
  { role: "candidate", text: "Um, I use it every day, and like, the scale is huge. I think working on AI data there would teach me a lot, you know, about how big systems work.", qIndex: 1, delivery: { camera: true, eyeContactPct: 52, lookAways: 4, longDownLooks: 1, steadiness: 74, engagement: "low", seconds: 38, words: 92, wpm: 145, fillers: 6 } },
  { role: "javis", text: "Imagine annotation guidelines change mid-week and labeler agreement suddenly drops. Walk me through what you'd do.", qIndex: 2 },
  { role: "candidate", text: "First I'd compare the old and new guidelines to see what changed, then sample the disagreements to find the confusing cases, write clear examples for those, and run a short recalibration with the labelers before scaling back up.", qIndex: 2, delivery: { camera: true, eyeContactPct: 78, lookAways: 1, longDownLooks: 0, steadiness: 90, engagement: "high", seconds: 81, words: 205, wpm: 152, fillers: 1 } },
  { role: "javis", text: "Tell me about a time you disagreed with a teammate.", qIndex: 3 },
  { role: "candidate", text: "In a school project we disagreed on the database. I explained my view and we went with MongoDB in the end.", qIndex: 3, delivery: { camera: true, eyeContactPct: 63, lookAways: 3, longDownLooks: 1, steadiness: 80, engagement: "medium", seconds: 19, words: 44, wpm: 139, fillers: 2 } },
  { role: "javis", text: "Do you have any questions for me?", qIndex: 3 },
  { role: "candidate", text: "What does a typical week look like for an intern on this team?", qIndex: 3 },
  { role: "javis", text: "That's something your recruiter can tell you more about. Thank you for your time, Shaun. We'll be in touch.", qIndex: 3, action: "wrap_up" },
];

const sections = [
  { id: "q1", index: 0, question: "Tell me about yourself.", model_answer: "x" },
  { id: "q7", index: 1, question: "Why do you want to work at TikTok?", model_answer: "x" },
  { id: "s1", index: 2, question: "Imagine annotation guidelines change mid-week and labeler agreement suddenly drops. Walk me through what you'd do.", model_answer: "" },
  { id: "q12", index: 3, question: "Tell me about a time you disagreed with a teammate.", model_answer: "x" },
];

export function sampleReport({ deliveryScores, contentScore, overallScore }) {
  const scoring = { answers, candidate_questions: { score: 3, reason: "One sensible question about the day-to-day; asking about the team's current priorities would show more interest." } };
  const session = { plan: sections.map((s) => ({ id: s.id })), turns };
  const content = contentScore(scoring);
  const delivery = deliveryScores(session);
  return {
    id: "demo", appId: "demo", company: "TikTok", position: "AI Data Project Intern",
    startedAt: t0, endedAt: t0 + 14 * 60_000, settings: { mode: "full", style: "neutral", type: "behavioral", timeLimit: 20 },
    sections, turns, scoring, content, delivery, overall: overallScore(content.score, delivery.score),
    feedback: {
      summary: "You came across as thoughtful and well grounded in real data work, especially on the scenario question. Your motivation and teamwork answers were the weak spots: they need sharper reasons and a clear outcome.",
      strengths: [
        "Strong, concrete opener built on your CPO repricing bots and Stock Watcher project.",
        "The labeler-agreement scenario got a clear, practical sequence of steps.",
        "Steady eye contact and good pace on your best answers (around 150 words a minute).",
      ],
      improvements: [
        "Give two or three specific reasons for 'Why TikTok?', ideally tied to the Eco & Social Creation team.",
        "Use STAR for behavioral answers: the disagreement story had no clear result.",
        "Cut fillers like 'um', 'like' and 'you know' on motivation questions, where you looked away most.",
        "Add a number or outcome to your scenario answers, such as the agreement rate you'd restore.",
      ],
      weakest_answer: {
        question_id: "q12",
        better_version: "In a group project last year, a teammate wanted MySQL while I argued for MongoDB, because our data was nested user activity that changed shape often. Rather than debate in circles, I suggested we each prototype the main query in an afternoon. My MongoDB version needed far less schema work and was easier to change when requirements shifted, so the team agreed to use it. We delivered on time, and I learned that settling disagreements with a quick, fair test works better than arguing opinions.",
      },
      comparisons: [
        { question_id: "q1", missed: ["Didn't mention what you're looking for in this internship specifically."] },
        { question_id: "q7", missed: ["No mention of the Eco & Social Creation team or its work.", "Didn't connect TikTok's AI data needs to your own experience."] },
        { question_id: "q12", missed: ["A clear result or what changed afterwards.", "What you learned from the disagreement."] },
      ],
    },
  };
}
