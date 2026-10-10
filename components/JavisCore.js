"use client";
// Javis's AI core (Step 5). One component: pass in the state, the voice volume and the face position.
//   state:  "idle" | "speaking" | "listening" | "thinking"
//   power:  "off" | "booting" | "on" | "shutdown"  (boot-up and shutdown animations)
//   volumeRef: ref whose .current is 0..1 (Javis's voice loudness, from the voice analyser)
//   faceRef:   ref whose .current is { x, y } in -1..1 (where the candidate's face is), or null
// Calm by design: slow, smooth motion; nothing flickers.
import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

const GOLD = new THREE.Color("#e2c27f");
const GOLD_DEEP = new THREE.Color("#c9a55c");
const SAGE = new THREE.Color("#9cc5a8");
const WARM_WHITE = new THREE.Color("#fff3d6");

// Targets per state. Everything eases towards these, so changes are smooth.
const STATE = {
  idle:      { ring: 0.12, listen: 0, eyeY: 1.0,  gazeX: 0, gazeY: 0, bright: 0.55 },
  speaking:  { ring: 0.18, listen: 0, eyeY: 1.0,  gazeX: 0, gazeY: 0, bright: 0.75 },
  listening: { ring: 0.06, listen: 1, eyeY: 1.08, gazeX: 0, gazeY: 0, bright: 0.6 },
  thinking:  { ring: 0.55, listen: 0, eyeY: 0.55, gazeX: 0.13, gazeY: 0.11, bright: 0.6 },
};
const ease = (a, b, k) => a + (b - a) * k;

// Edge-lit (fresnel) sphere: bright rim, soft inside.
const coreShader = {
  uniforms: { uColor: { value: GOLD.clone() }, uRim: { value: WARM_WHITE.clone() }, uBright: { value: 0.6 }, uAlpha: { value: 1 } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uColor; uniform vec3 uRim; uniform float uBright; uniform float uAlpha;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.4);
      // Warm gold glow all the way through (a little brighter towards the middle), not a dark hollow.
      vec3 inner = uColor * (0.26 + 0.14 * (1.0 - f)) * uBright;
      vec3 col = inner + mix(uColor, uRim, 0.35) * f * (0.9 + uBright);
      gl_FragColor = vec4(col, (0.55 + f * 0.45) * uAlpha);
    }`,
};

function shellPoints(n, r) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, rr = r * (0.98 + Math.random() * 0.06);
    const s = Math.sqrt(1 - u * u);
    pos.set([rr * s * Math.cos(t), rr * u, rr * s * Math.sin(t)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}

function Core({ state, power, volumeRef, faceRef }) {
  const root = useRef(), coreMat = useRef(), shell = useRef(), ringA = useRef(), ringB = useRef();
  const markers = useRef([]), eyes = useRef(), eyeL = useRef(), eyeR = useRef(), wave = useRef(), eyeMatL = useRef(), eyeMatR = useRef();
  const shellGeo = useMemo(() => shellPoints(700, 1.14), []);
  const waveGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3));
    return g;
  }, []);
  const arcs = useMemo(() => [0, 1, 2, 3].map((i) => ({ start: i * (Math.PI / 2) + 0.18, len: Math.PI / 2 - 0.5 })), []);

  // Live animation state (not React state: updated every frame without re-rendering).
  const s = useRef({
    t: 0, vol: 0, ring: 0.1, listen: 0, eyeY: 0, gazeX: 0, gazeY: 0, bright: 0, boot: 0,
    blinkAt: 2, blink: 0, glanceUntil: 0, glanceX: 0, glanceY: 0, nextGlance: 3, ringAngle: 0,
  });

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const v = s.current;
    v.t += dt;
    const target = STATE[state] || STATE.idle;
    const k = 1 - Math.pow(0.02, dt); // smooth easing, frame-rate independent

    // Power: boot-up draws in over ~3 s; shutdown dims and slows.
    if (power === "on") v.boot = 1;
    else if (power === "off") v.boot = 0;
    else if (power === "booting") v.boot = Math.min(1, v.boot + dt / 3);   // ~3 s
    else if (power === "shutdown") v.boot = Math.max(0, v.boot - dt / 2.5);
    const b = THREE.MathUtils.clamp(v.boot, 0, 1);
    const ringsIn = THREE.MathUtils.smoothstep(b, 0, 0.45);
    const coreIn = THREE.MathUtils.smoothstep(b, 0.25, 0.75);
    const eyesOpen = THREE.MathUtils.smoothstep(b, 0.8, 1);

    // Voice: smoothed volume drives pulse and brightness while speaking.
    const raw = state === "speaking" ? Math.min(1, (volumeRef?.current || 0) * 1.6) : 0;
    v.vol = ease(v.vol, raw, raw > v.vol ? 0.35 : 0.12);

    v.ring = ease(v.ring, target.ring * (power === "shutdown" ? 0 : 1), k * 0.6);
    v.listen = ease(v.listen, target.listen, k * 0.5);
    v.bright = ease(v.bright, target.bright + v.vol * 0.6, k);
    v.eyeY = ease(v.eyeY, target.eyeY * (1 + v.vol * 0.12), k);

    // Gaze: mostly at the candidate (face position if known), brief glances away ~20% of the time.
    if (v.t > v.nextGlance && state !== "thinking") {
      if (Math.random() < 0.6) { // a ~1 s glance every 3-5 s, about 60% of the time: roughly 20% of time looking away
        v.glanceUntil = v.t + 0.6 + Math.random() * 0.8;
        v.glanceX = (Math.random() - 0.5) * 0.22; v.glanceY = (Math.random() - 0.3) * 0.12;
      }
      v.nextGlance = v.t + 3 + Math.random() * 2;
    }
    const face = faceRef?.current;
    let gx = target.gazeX + (face ? face.x * 0.12 : 0), gy = target.gazeY + (face ? face.y * 0.08 : 0);
    if (v.t < v.glanceUntil && state !== "listening") { gx += v.glanceX; gy += v.glanceY; }
    v.gazeX = ease(v.gazeX, gx, k * 0.8); v.gazeY = ease(v.gazeY, gy, k * 0.8);

    // Blink every 3-6 s (slow blink on shutdown).
    if (v.t > v.blinkAt) { v.blink = 1; v.blinkAt = v.t + 3 + Math.random() * 3; }
    v.blink = Math.max(0, v.blink - dt * (power === "shutdown" ? 2 : 7));
    const blinkScale = 1 - Math.sin(v.blink * Math.PI) * 0.92;

    // Apply
    const float = Math.sin(v.t * 0.9) * 0.04;
    root.current.position.y = float;
    const pulse = 1 + v.vol * 0.06 + Math.sin(v.t * 1.3) * 0.006;
    root.current.scale.setScalar(0.85 + 0.15 * coreIn);

    const col = GOLD.clone().lerp(SAGE, v.listen);
    coreMat.current.uniforms.uColor.value.copy(col);
    coreMat.current.uniforms.uBright.value = v.bright * coreIn;
    coreMat.current.uniforms.uAlpha.value = 0.15 + 0.85 * coreIn;
    shell.current.scale.setScalar(pulse);
    shell.current.rotation.y += dt * 0.04;
    shell.current.material.opacity = (0.35 + v.vol * 0.3) * coreIn;
    shell.current.material.color.copy(col);

    v.ringAngle += dt * v.ring;
    ringA.current.rotation.z = v.ringAngle;
    ringB.current.rotation.z = -v.ringAngle * 0.7;
    ringA.current.scale.setScalar(0.6 + 0.4 * ringsIn);
    ringB.current.scale.setScalar(0.5 + 0.5 * ringsIn);
    [ringA, ringB].forEach((r) => r.current.traverse((o) => { if (o.material) o.material.opacity = 0.75 * ringsIn; }));
    markers.current.forEach((m, i) => {
      if (!m) return;
      const a = v.ringAngle * (1 + i * 0.15) + i * 2.1;
      const r = i === 2 ? 1.78 : 1.55;
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      m.material.opacity = ringsIn;
    });

    eyes.current.position.set(v.gazeX, 0.06 + v.gazeY, 1.0);
    const eyeH = Math.max(0.04, v.eyeY * blinkScale * eyesOpen);
    eyeL.current.scale.set(1, eyeH, 1);
    eyeR.current.scale.set(1, eyeH, 1);
    [eyeMatL, eyeMatR].forEach((m) => { m.current.color.copy(WARM_WHITE).lerp(col, 0.42); m.current.opacity = eyesOpen; }); // warm ivory, tied to the gold

    // Thin voice waveform under the eyes.
    const p = wave.current.geometry.attributes.position;
    for (let i = 0; i < 48; i++) {
      const x = -0.32 + (i / 47) * 0.64;
      const env = Math.sin((i / 47) * Math.PI);
      const y = -0.3 + Math.sin(i * 0.55 + v.t * 9) * env * v.vol * 0.07;
      p.setXYZ(i, x, y, 1.0);
    }
    p.needsUpdate = true;
    // Only visible while he speaks, so it never reads as a mouth.
    v.waveVis = ease(v.waveVis || 0, state === "speaking" ? 1 : 0, k);
    wave.current.material.opacity = (0.15 + v.vol * 0.85) * v.waveVis * eyesOpen;
  });

  const ringMat = (o = 0.7) => <meshBasicMaterial color={GOLD_DEEP} transparent opacity={o} toneMapped={false} />;

  return (
    <group ref={root}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial ref={coreMat} args={[coreShader]} transparent depthWrite />
      </mesh>
      <points ref={shell} geometry={shellGeo}>
        <pointsMaterial size={0.018} color={GOLD} transparent opacity={0.4} sizeAttenuation depthWrite={false} toneMapped={false} />
      </points>

      <group ref={eyes}>
        <mesh ref={eyeL} position={[-0.21, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.16, 8, 16]} />
          <meshBasicMaterial ref={eyeMatL} color={WARM_WHITE} transparent toneMapped={false} />
        </mesh>
        <mesh ref={eyeR} position={[0.21, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.16, 8, 16]} />
          <meshBasicMaterial ref={eyeMatR} color={WARM_WHITE} transparent toneMapped={false} />
        </mesh>
      </group>
      <line ref={wave} geometry={waveGeo}>
        <lineBasicMaterial color={GOLD} transparent opacity={0.3} toneMapped={false} />
      </line>

      {/* Ring A: full, tilted one way */}
      <group rotation={[0.38, 0.35, 0]}>
        <group ref={ringA}>
          <mesh><torusGeometry args={[1.55, 0.006, 8, 160]} />{ringMat()}</mesh>
        </group>
      </group>
      {/* Ring B: broken into long arcs, tilted the other way */}
      <group rotation={[-0.34, -0.45, 0.15]}>
        <group ref={ringB}>
          {arcs.map((a, i) => (
            <mesh key={i} rotation={[0, 0, a.start]}><torusGeometry args={[1.78, 0.005, 8, 80, a.len]} />{ringMat(0.6)}</mesh>
          ))}
        </group>
      </group>
      {/* Three small gold markers riding the rings */}
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={i === 2 ? [-0.34, -0.45, 0.15] : [0.38, 0.35, 0]}>
          <mesh ref={(m) => (markers.current[i] = m)}>
            <sphereGeometry args={[0.028, 12, 12]} />
            <meshBasicMaterial color={WARM_WHITE} transparent toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function JavisCore({ state = "idle", power = "on", volumeRef, faceRef, className, background = "#1a2232" }) {
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      {/* Solid background (matches the tile) and no multisampling: transparent canvases with bloom flicker in Safari. */}
      <Canvas camera={{ position: [0, 0, 7.2], fov: 35 }} dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}>
        <color attach="background" args={[background]} />
        <Core state={state} power={power} volumeRef={volumeRef} faceRef={faceRef} />
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.7} luminanceThreshold={0.15} luminanceSmoothing={0.4} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
