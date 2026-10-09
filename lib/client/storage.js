// Everything the app stores lives in this browser only (see Privacy in the plan).
const PREFIX = "javis:";
const KEYS = { application: `${PREFIX}application` };

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const getApplication = () => read(KEYS.application);
export const saveApplication = (app) => write(KEYS.application, app);

// Used by "Delete all my data" in Settings.
export function clearAll() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch {}
}
