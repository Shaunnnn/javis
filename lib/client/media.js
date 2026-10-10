// Device helpers for the interview: mic level, speech recognition check, face detection.
// Everything runs in the browser; camera video never leaves the device.
import "./polyfills";

const VISION_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/vision_bundle.mjs";
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const importUrl = new Function("u", "return import(u)");

let detectorPromise = null;
export function loadFaceDetector() {
  detectorPromise ??= (async () => {
    const { FilesetResolver, FaceDetector } = await importUrl(VISION_URL);
    const files = await FilesetResolver.forVisionTasks(VISION_WASM);
    return FaceDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: FACE_MODEL },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.6,
    });
  })().catch((e) => { detectorPromise = null; throw e; });
  return detectorPromise;
}

// Live mic level (0..1) from a MediaStream. Returns a stop function.
export function watchLevel(ac, stream, onLevel) {
  const src = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let raf;
  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => { cancelAnimationFrame(raf); src.disconnect(); };
}

// Chrome's built-in speech recognition (Safari's is unreliable, so we don't depend on it).
export function speechRecognition() {
  if (typeof window === "undefined") return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  return SR && !isSafari ? SR : null;
}

export function browserName() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/^((?!chrome|android|crios|fxios).)*safari/i.test(ua)) return "safari";
  if (/Chrome|CriOS/.test(ua)) return "chrome";
  return "other";
}
