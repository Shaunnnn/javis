// Server-only. Exact JSON shapes Gemini must return for each prompt, so replies
// always parse (and stream) the same way. Keep in sync with the headers in /prompts.
import "server-only";

const S = { type: "STRING" };
const list = (items) => ({ type: "ARRAY", items });

export const SCHEMAS = {
  "javis-interviewer": {
    type: "OBJECT",
    properties: {
      action: { type: "STRING", enum: ["follow_up", "comment_and_next", "wrap_up", "repeat", "pause"] },
      say: { type: "STRING" },
      private_score: { type: "INTEGER" },
      notes: { type: "STRING" },
      transcript: { type: "STRING" },
    },
    required: ["action", "say", "private_score", "notes", "transcript"],
    propertyOrdering: ["transcript", "action", "say", "private_score", "notes"],
  },
  summarise: { type: "OBJECT", properties: { key_points: list(S) }, required: ["key_points"] },
  analysis: {
    type: "OBJECT",
    properties: {
      company: S, position: S, candidate_name: S,
      candidate_skills: list(S), experience_highlights: list(S),
      role_requirements: list(S), gaps: list(S), company_context: S,
    },
    required: ["company", "position", "candidate_skills", "experience_highlights", "role_requirements", "gaps", "company_context"],
    propertyOrdering: ["company", "position", "candidate_name", "candidate_skills", "experience_highlights", "role_requirements", "gaps", "company_context"],
  },
  questions: {
    type: "OBJECT",
    properties: {
      questions: list({
        type: "OBJECT",
        properties: {
          format: { type: "STRING", enum: ["short", "scenario"] },
          question: S,
          type: { type: "STRING", enum: ["behavioral", "technical", "role-fit", "gap"] },
          key_points: list(S),
          model_answer: S,
          tips: list(S),
        },
        required: ["format", "question", "type", "key_points", "model_answer", "tips"],
        propertyOrdering: ["format", "question", "type", "key_points", "model_answer", "tips"],
      }),
    },
    required: ["questions"],
  },
};
