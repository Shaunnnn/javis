// Step 6: delivery scoring. Runs on the webcam feed in the browser; video never leaves the device.
// Only numbers are kept (eye contact %, look-aways, steadiness, engagement).
import "./polyfills";

const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const importUrl = new Function("u", "return import(u)");

let landmarkerPromise = null;
export function loadLandmarker() {
  landmarkerPromise ??= (async () => {
    const { FilesetResolver, FaceLandmarker } = await importUrl(VISION_URL);
    const files = await FilesetResolver.forVisionTasks(VISION_WASM);
    return FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: LANDMARKER_MODEL },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  })().catch((e) => { landmarkerPromise = null; throw e; });
  return landmarkerPromise;
}

// Head angles (degrees) from MediaPipe's face transformation matrix.
function headPose(matrix) {
  const m = matrix?.data;
  if (!m) return null;
  // Column-major 4x4: rotation part
  const r00 = m[0], r10 = m[1], r20 = m[2], r21 = m[6], r22 = m[10];
  const deg = 180 / Math.PI;
  return {
    pitch: Math.atan2(r21, r22) * deg,           // nodding up/down
    yaw: Math.atan2(-r20, Math.hypot(r21, r22)) * deg, // turning left/right
    roll: Math.atan2(r10, r00) * deg,            // tilting
  };
}

// Reads one frame of results into simple signals.
export function readFrame(result, video) {
  const lm = result?.faceLandmarks?.[0];
  if (!lm) return { face: false };
  const bs = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map((c) => [c.categoryName, c.score]));
  const pose = headPose(result.facialTransformationMatrixes?.[0]) || { pitch: 0, yaw: 0, roll: 0 };
  const g = (k) => bs[k] || 0;
  const lookSide = Math.max(g("eyeLookOutLeft"), g("eyeLookOutRight"), g("eyeLookInLeft"), g("eyeLookInRight"));
  const lookDown = (g("eyeLookDownLeft") + g("eyeLookDownRight")) / 2;
  const lookUp = (g("eyeLookUpLeft") + g("eyeLookUpRight")) / 2;
  const down = lookDown > 0.5 || pose.pitch < -14;
  const away = down || lookSide > 0.5 || lookUp > 0.55 || Math.abs(pose.yaw) > 18 || pose.pitch > 16;
  const smile = (g("mouthSmileLeft") + g("mouthSmileRight")) / 2;
  const expressive = Math.max(g("browInnerUp"), g("browOuterUpLeft"), g("browOuterUpRight"), g("jawOpen") * 0.6);
  // Face centre (mirrored like the self-view), for Javis's eyes to follow.
  const nose = lm[1];
  const facePos = { x: -(nose.x * 2 - 1), y: -(nose.y * 2 - 1) };
  return { face: true, away, down, pose, smile, expressive, facePos };
}

// Collects signals over one answer and turns them into scores.
export function createAnswerTracker() {
  let frames = [], last = null;
  return {
    add(sig, t) {
      if (last !== null && t - last < 120) return; // ~8 samples a second is plenty
      last = t;
      frames.push({ ...sig, t });
    },
    finish() {
      const f = frames;
      frames = []; last = null;
      const seen = f.filter((x) => x.face);
      if (seen.length < 5) return null; // camera off or face not visible: no scores
      const dt = (i) => (i > 0 ? Math.min(400, f[i].t - f[i - 1].t) : 120);
      let total = 0, looking = 0, lookAways = 0, longDown = 0, runAway = 0, runDown = 0, wasAway = false;
      f.forEach((x, i) => {
        const d = dt(i);
        total += d;
        const away = !x.face || x.away;
        if (!away) looking += d;
        if (away) { runAway += d; if (x.down) runDown += d; } else { runAway = 0; runDown = 0; }
        if (away && !wasAway) wasAway = true;
        if (!away && wasAway) wasAway = false;
        if (runAway >= 500 && runAway - d < 500) lookAways++;      // a glance away of half a second or more
        if (runDown >= 1500 && runDown - d < 1500) longDown++;     // a long look down (reading notes?)
      });
      // Steadiness: how much the head moves frame to frame.
      let move = 0;
      for (let i = 1; i < seen.length; i++) {
        const a = seen[i].pose, b = seen[i - 1].pose;
        move += Math.abs(a.yaw - b.yaw) + Math.abs(a.pitch - b.pitch) + Math.abs(a.roll - b.roll);
      }
      const avgMove = move / Math.max(1, seen.length - 1);
      const steadiness = Math.round(Math.max(0, Math.min(100, 100 - (avgMove - 0.6) * 22)));
      const smile = seen.reduce((s, x) => s + x.smile, 0) / seen.length;
      const expr = seen.reduce((s, x) => s + x.expressive, 0) / seen.length;
      const eng = smile * 0.6 + expr * 0.4;
      return {
        eyeContactPct: Math.round((looking / Math.max(1, total)) * 100),
        lookAways,
        longDownLooks: longDown,
        steadiness,
        engagement: eng > 0.28 ? "high" : eng > 0.12 ? "medium" : "low",
      };
    },
  };
}

// Speech measures from the transcript and how long the answer took.
const FILLERS = /\b(um+|uh+|erm+|er|ah+|hmm+|like|you know|kind of|sort of|basically|actually)\b/gi;
export function speechMetrics(text, seconds) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const fillers = ((text || "").match(FILLERS) || []).length;
  const wpm = seconds > 3 ? Math.round(words / (seconds / 60)) : null;
  return {
    seconds: Math.round(seconds),
    words,
    wpm,
    fillers,
    fillersPerMin: seconds > 3 ? +(fillers / (seconds / 60)).toFixed(1) : null,
    lengthFlag: seconds < 25 ? "short" : seconds > 150 ? "long" : "ok",
  };
}
