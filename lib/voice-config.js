// Javis's voice: every setting to tune by ear lives here.
// Original voice only: Kokoro's built-in British voices. Never a clone of any real person's voice.
export const VOICE = {
  voices: [
    { id: "bm_daniel", label: "Daniel" },
    { id: "bf_alice", label: "Alice" },
    { id: "bf_emma", label: "Emma" },
    { id: "bf_isabella", label: "Isabella" },
    { id: "bf_lily", label: "Lily" },
  ],
  defaultVoice: "bm_daniel",

  // Delivery. Pitch is lowered by slowing playback, which also slows speech,
  // so the model speaks slightly faster to land at about 0.9x overall.
  pitchSemitones: -1.5,
  modelSpeed: 1.31, // ≈1.2x overall after the pitch drop
  sentencePauseMs: 90, // added after trimming Kokoro's own silence at each sentence end
  // Natural variation so he sounds less flat: questions a touch slower, short lines a touch quicker.
  questionSpeed: 0.95,
  shortLineSpeed: 1.04,

  // "AI system" effect: keep everything subtle. An AI, not a robot.
  effect: {
    echo: { delaySec: 0.085, feedback: 0.18, wet: 0.12 },        // speaking from the room's speakers
    chorus: { delaySec: 0.014, depthSec: 0.0018, rateHz: 0.7, wet: 0.16 }, // faint digital shimmer
    presence: { freqHz: 3200, gainDb: 2.2, q: 0.9 },              // crisp upper-mids (kept gentle for warmth)
    warmth: { freqHz: 220, gainDb: 1.5 },                         // fuller low-mids: a warmer voice
  },
};
