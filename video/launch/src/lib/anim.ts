// The house motion system. Acts take every curve, spring and envelope from here, so the film has
// one motion character; scripts/lint-film.mjs fails raw beziers anywhere else. The numbers are
// proven defaults, not dogma: retune a token here and the whole film follows.
import { Easing, interpolate, spring, SpringConfig } from 'remotion';
import { FPS } from '../timeline';

export type Ease = (t: number) => number;

/** Easing tokens, named for how they feel. Entrances decay, exits accelerate; only the camera eases both ways. */
export const E = {
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: arrivals and reveals (never for fade-outs)
  outSoft: Easing.bezier(0.22, 1, 0.36, 1), // quint-out: gentle settles
  in: Easing.bezier(0.7, 0, 0.84, 0), // expo-in: implosions and hard snaps out (20-24% of the travel in the last frame)
  exit: Easing.bezier(0.55, 0.055, 0.675, 0.19), // cubic-in: exits into a cut, speed growing about x1.14 per frame over the last 10-24 f
  inOut: Easing.bezier(0.87, 0, 0.13, 1), // expo-in-out: whips and lockup slides
  smooth: Easing.bezier(0.65, 0, 0.35, 1), // cubic-in-out: drifts and 10-14 f fades
  ui: Easing.bezier(0.4, 0, 0.2, 1), // small UI state changes
  cam: Easing.bezier(0.48, 0.1, 0, 0.9), // camera: slow start, peak at ~27%, long settle
  glide: Easing.bezier(0.47, 0.2, 0.15, 1), // 150-350 px moves with a soft landing
  rest: Easing.bezier(0.45, 0, 0.1, 1), // zero-slope start, ends at rest: chains after another move
  contact: Easing.bezier(0.55, 0, 0.9, 0.55), // accelerates INTO an impact (ends with velocity)
  whip: Easing.bezier(0.6, 0, 0.15, 1), // feature-to-feature whips
  dolly: Easing.bezier(0.35, 0, 0.65, 1), // slow push through a hold
  type: Easing.bezier(0.5, 1, 0.89, 1), // quad-out: an eased typewriter, 2x its mean rate at the start, last key at ~80%
  linear: (t: number) => t, // drift only
};

/**
 * Spring presets. Default to critical damping (damping >= 2*sqrt(stiffness*mass)); overshoot is for
 * impacts only, and clamp it wherever it could cross other geometry or go negative.
 */
export const SPR = {
  snap: { damping: 18, stiffness: 260, mass: 0.7 }, // locks into place, small overshoot
  pop: { damping: 11, stiffness: 180, mass: 0.6 }, // 14% overshoot: a true landing only (<= 2 landings per film)
  soft: { damping: 26, stiffness: 120, mass: 1 }, // weighty, no overshoot
  heavy: { damping: 30, stiffness: 90, mass: 1.4 }, // big objects
  firm: { damping: 24, stiffness: 140, mass: 1 }, // UI arrivals, no overshoot
  micro: { damping: 30, stiffness: 500, mass: 0.6 }, // chips, badges, small snaps
  land: { damping: 14.5, stiffness: 200, mass: 1 }, // ~15% overshoot: a true landing only (<= 2 per film)
  word: { damping: 20, stiffness: 170, mass: 0.9 }, // words sliding in to lock (clamp at the lock)
  detent: { damping: 24, stiffness: 380, mass: 0.6 }, // a reel or picker clicking home
} satisfies Record<string, Partial<SpringConfig>>;

export type Spr = Partial<SpringConfig>;

/** Clamped tween between two frames. interpolate() extends past its range by default; this never does. */
export const tw = (frame: number, from: number, to: number, a: number, b: number, ease: Ease = E.out) =>
  interpolate(frame, [from, to], [a, b], { easing: ease, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/**
 * 0..1 progress between two frames. It is 0 ON `from`, so a change meant to show on a hit frame
 * starts at `cue - 1`. Pass the ease explicitly for exits and fades (E.in / E.smooth): the E.out
 * default is for arrivals only.
 */
export const prog = (frame: number, from: number, to: number, ease: Ease = E.out) => tw(frame, from, to, 0, 1, ease);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Log-space mix for scale and zoom: equal ratios per frame, so a zoom never seems to accelerate. */
export const lmix = (a: number, b: number, t: number) => Math.exp(mix(Math.log(a), Math.log(b), t));
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Spring started at `start` (frames). Same maths as src/lib/sync.ts uses to find its hit frame. */
export const spr = (frame: number, start: number, cfg: Spr = SPR.snap) => spring({ frame: frame - start, fps: FPS, config: cfg });

/**
 * Attack-decay envelope for every punch and tick, `t` frames after its cue: rises over `attack`
 * frames (the picture peaks just after its sound), then decays with time constant `tau`. No
 * velocity step at either end, unlike a half-sine on a hard window. Returns 0..1; multiply by the
 * amplitude. `attack` and `tau` are 60 fps frames, so a pulse lasts the same time at any fps.
 */
export const hitPulse = (t: number, attack = 2, tau = 5) => {
  const u = (t * 60) / FPS;
  return u <= 0 || u > attack + 6 * tau ? 0 : u < attack ? Math.sin((u / attack) * (Math.PI / 2)) : Math.exp(-(u - attack) / tau);
};

/**
 * Blur for an entrance at eased progress p (0..1), `px` at p = 0. Chromium quantises CSS blur (the
 * radius steps about every 0.5 px and anything under ~0.75 px renders fully sharp), so a ramp that
 * ends slowly snaps into focus while the element is almost still. This one is gone by 60% of the
 * move, while the element is still travelling fast and half transparent. Text lands sharp.
 */
export const blurIn = (p: number, px: number) => px * clamp(1 - p / 0.6);
/** Blur for an exit at eased progress q: it only starts once the element is already moving (q > 0.3). */
export const blurOut = (q: number, px: number) => px * clamp((q - 0.3) / 0.7);

/**
 * Vertical text moves: Chromium's headless shell snaps a text layer's vertical position to whole
 * pixels (horizontal stays sub-pixel), so the slow tail of an ease-out renders as 1 px ticks with
 * holds between them (a visible stair-step as a word settles). `arrive` rescales eased progress so
 * the move ends at `k` of its curve, while it still travels ~0.5-1 px/f, and then stops; `depart`
 * does the same for the slow start of an exit. Use them on the translateY of text and small UI;
 * opacity, blur and horizontal moves keep the plain progress.
 */
export const arrive = (p: number, k = 0.94) => clamp(p / k);
export const depart = (q: number, k = 0.06) => clamp((q - k) / (1 - k));
/**
 * The `k` for arrive() on a vertical move of `px` over `dur` frames on `ease`: the point of the
 * curve where its step falls below 1 px/f, so the move stops from ~1 px/f at any travel and fps.
 * The default 0.94 fits a ~40 px rise at 60 fps; a 140 px slide would stop from 3 px/f with it
 * (12 px/f at 30 fps), a 20 px one would tick.
 */
export const arriveK = (px: number, dur: number, ease: Ease = E.out) => {
  const n = Math.max(1, Math.round(dur));
  for (let i = 1; i <= n; i++) if (Math.abs(px) * (ease(i / n) - ease((i - 1) / n)) < 1) return clamp(ease((i - 1) / n), 0.5, 1);
  return 1;
};

/** Contact squash for a landing, `t` frames after contact: widen 8% and flatten 10%, back over ~8 f (at 60 fps). Anchor it at the contact edge. */
export const squash = (t: number) => {
  const k = hitPulse(t, 1, 4);
  return { along: 1 - 0.1 * k, across: 1 + 0.08 * k };
};

/** Deterministic pseudo-random in [0,1) from a number or string seed (Math.random is banned: renders must repeat). */
export const rand = (seed: number | string) => {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/**
 * Whole frame for discrete state (typed characters, carets, counters, layout switches). The
 * motion-blur pass renders fractional frames; deciding state on Math.round keeps every sub-sample
 * of one output frame in agreement.
 */
export const fd = Math.round;

/**
 * Start offset (frames) of item i of n spread over `span` frames: 0 for the first, `span` for the
 * last. The ease shapes the gaps (E.linear: even; E.out: the first items bunch up, the tail spreads
 * out). Add it to the group's start: prog(f, at + stagger(i, n, 24), at + stagger(i, n, 24) + 26, E.out).
 * A group arrives within 30 f at 60 fps (references/motion-tokens.md §6); longer reads as a queue.
 */
export const stagger = (i: number, n: number, span: number, ease: Ease = E.linear) => (n > 1 ? span * ease(clamp(i / (n - 1))) : 0);

/**
 * Inertial scroll that starts `start` at v0 px/f and loses (1 - decay) of its speed every frame, in
 * closed form: x = v0·tau·(1 - d^n), v = v0·d^n, with tau = -1/ln d. Before `start` it moves at a
 * constant v0, so a shot can open at peak scroll speed and coast (the velocity has no step). `decay`
 * is per 60 fps frame (0.89: tau = 8.6 f, travel = 8.6·v0, within 0.5 px of rest after
 * `settle` frames); it is converted for other frame rates. A slow vertical tail of text settles in
 * 1 px ticks (references/chromium-rendering.md §15): for text use total * arrive(x / total,
 * 1 - 1 / |v0|) after `start` (x before it), which stops from ~1 px/f at any v0 > 1.
 */
export const inertia = (frame: number, start: number, v0: number, decay = 0.89) => {
  const d = clamp(decay, 1e-6, 0.999999) ** (60 / FPS);
  const tau = -1 / Math.log(d);
  const n = frame - start;
  const total = v0 * tau;
  const settle = Math.abs(total) > 0.5 ? Math.ceil(tau * Math.log(Math.abs(total) / 0.5)) : 0;
  if (n <= 0) return { x: v0 * n, v: v0, total, settle };
  const k = d ** n;
  return { x: total * (1 - k), v: v0 * k, total, settle };
};
