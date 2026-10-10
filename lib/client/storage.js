// Everything the app stores lives in this browser only (see Privacy in the plan).
const PREFIX = "javis:";
const KEYS = { application: `${PREFIX}application`, questions: `${PREFIX}questions`, interviewSettings: `${PREFIX}interviewSettings`, session: `${PREFIX}session` };

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const getApplication = () => read(KEYS.application);
export const saveApplication = (app) => {
  write(KEYS.application, app);
  write(KEYS.questions, { appId: app.id, items: [] }); // a new application starts a fresh question list
};

// Questions belong to the current application; anything saved for an older one is ignored.
export function getQuestions(appId) {
  const q = read(KEYS.questions);
  return q && q.appId === appId && Array.isArray(q.items) ? q.items : [];
}
export const saveQuestions = (appId, items) => write(KEYS.questions, { appId, items });

// Interview settings chosen on the setup screen (remembered for next time).
export const DEFAULT_INTERVIEW_SETTINGS = { mode: "full", style: "neutral", type: "behavioral", timeLimit: 20, camera: true };
export const getInterviewSettings = () => ({ ...DEFAULT_INTERVIEW_SETTINGS, ...(read(KEYS.interviewSettings) || {}) });
export const saveInterviewSettings = (s) => write(KEYS.interviewSettings, s);

// The live interview, saved after every turn so nothing is lost if the page drops.
export const getSession = () => read(KEYS.session);
export const saveSession = (sess) => write(KEYS.session, sess);
export const clearSession = () => { try { localStorage.removeItem(KEYS.session); } catch {} };

// Used by "Delete all my data" in Settings.
export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {}
}
