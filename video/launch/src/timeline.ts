// The single source of truth for time. Picture (src/acts), sound (src/sync.ts -> out/cues.json)
// and QA (scripts/grid-check.ts) all import this file, so a change here moves everything together.
// Think in bars and beats, never in seconds. Keep this file free of React and CSS imports:
// Node scripts load it directly.
//
// 1 bar = 4 beats = 2 s at 120 BPM. 14 bars = 28 s, the brief's own spec. One bar per beat-sheet
// row in TREATMENT.md: bars 1-2 hook, bar 3 turn, bars 4-8 proof, bars 9-10 payoff, bars 11-14 lockup.

export const FPS = 60;
export const BPM = 120;
export const W = 1920;
export const H = 1080;

/** Frames per beat. Must be a whole number (grid-check fails otherwise): 60 fps -> 90, 100, 120, 144, 150 BPM. */
export const BEAT = (60 / BPM) * FPS; // 30
export const BAR = BEAT * 4; // 120

/**
 * Absolute frame of a grid position: bar is 1-based, beat 0-3, sub = 16ths within the beat.
 * b(3) is the downbeat of bar 3; b(2, 1, 2) is the "and" of beat 2 in bar 2.
 */
export const b = (bar: number, beat = 0, sub = 0) => Math.round(((bar - 1) * 4 + beat) * BEAT + sub * (BEAT / 4));

/**
 * A choreography length written in 60 fps frames (the unit every number in the cinetic
 * references uses), converted to this film's fps. Cues come from b(); durations inside a move
 * use f60(), so the film keeps its timing if --fps changes.
 */
export const f60 = (frames: number) => Math.round((frames * FPS) / 60);

/** After the last bar the picture holds while the audio decays to digital silence. */
export const TAIL = FPS; // 60 f, inside bar 14 (see ACT.lockup): the last second is the decay, not extra runtime.

// Acts: contiguous, bar-aligned, [from, from + dur). Each act is its own composition in Root.tsx.
export const ACT = {
  hook: { from: b(1), dur: b(3) - b(1) }, // the cropped word pulls back to the interviewer's line, then the empty reply box holds
  turn: { from: b(3), dur: b(4) - b(3) }, // the interview panel shrinks away; the glyph iris swallows the frame into the real session
  proof: { from: b(4), dur: b(9) - b(4) }, // problem, naive answer, the constraint that breaks it, a held beat of revising, the better answer
  payoff: { from: b(9), dur: b(11) - b(9) }, // "you rederived a middleware chain", tight, then the pull-back to the whole thread
  lockup: { from: b(11), dur: b(15) - b(11) }, // the panel collapses to the URL pill, the avatar becomes the mark, the tagline, the tail
};

export const TOTAL = b(15); // 1680 f = 28.0 s exactly

// Named sync points (absolute frames), all on the 16th grid. A cue that must sit off the grid
// carries a trailing `// offgrid: <reason>` comment, which grid-check accepts.
// Picture code reads these; src/sync.ts turns them into sound events.
export const CUE = {
  // hook (bars 1-2)
  hookIn: b(1, 0), // 0: frame 0, already cropped tight on "this" and drifting
  hookPullStart: b(1, 1), // 30: the pull-back to reading size begins
  hookPullPeak: b(1, 2), // 60: the pull-back's velocity peak (E.dolly), keeps the move alive mid-bar
  hookResolved: b(1, 3), // 90: the full interviewer line reads at rest
  holdFrom: b(2, 0), // 120: the empty reply box, cursor blinking - the film's one designated long hold
  // turn (bar 3): the hold above runs to HOLD.to (96 f later, inside bar 2); see HOLD below
  turnStart: b(3, 0), // 240: cut point - the interview panel starts its subtract-reveal shrink
  shrinkStart: b(3, 0), // 240
  irisSeed: b(3, 1), // 270: the seed dot appears on the newly-arrived avatar (75% into the 40 f shrink: the overlap law)
  sessionReveal: b(3, 2), // 300: the iris has swallowed the frame; full ink/paper/accent and the real session are visible
  turnSettle: b(3, 3), // 330: everything at rest before the proof act opens
  // proof (bars 4-8)
  ringAppear1: b(4, 0), // 360: the thinking ring appears beside the avatar
  ringResolve1: b(4, 0, 2), // 375: resolves plain (this reply is not the payoff)
  problemIn: b(4, 0, 2), // 375
  problemResolved: b(4, 1, 2), // 405 (= 6.75 s, about a quarter of the film: the product is named here, in its own chat chrome)
  naiveTypeStart: b(4, 3), // 450: the user's reply box starts filling in
  problemOut: b(5, 0), // 480
  naiveIn: b(5, 0), // 480
  naiveResolved: b(5, 1), // 510
  naiveReadTick: b(5, 2), // 540: a quiet reading beat before rederive starts "thinking"
  ringAppear2: b(5, 3), // 570
  ringResolve2: b(6, 0), // 600
  constraintIn: b(6, 0), // 600
  naiveOut: b(6, 0), // 600
  constraintResolved: b(6, 1), // 630
  pushInPeak: b(6, 2), // 660: the camera's one proof-act hero move, pushing onto the line that breaks the naive answer
  replyBoxAppear: b(6, 3), // 690: the candidate's empty reply box returns, cursor live
  pauseStart: b(7, 0), // 720: a held beat with no new text - the revision has to read as real work
  constraintOut: b(7, 1), // 750
  falseStart2: b(7, 2), // 780: a second typed-then-deleted attempt (the beat sheet's "false starts")
  pauseEnd: b(7, 3), // 810
  betterIn: b(8, 0), // 840
  betterResolved: b(8, 0, 2), // 855
  betterTick1: b(8, 2), // 900: a quiet read-beat while the better answer sits, waiting on rederive
  betterTick2: b(8, 3), // 930
  betterOut: b(9, 0), // 960
  // payoff (bars 9-10)
  ringAppear3: b(9, 0), // 960
  ringResolveBright: b(9, 0, 2), // 975: this is the one that resolves in the accent, because this is the one that's done
  payoffIn: b(9, 0, 2), // 975
  payoffBoldFlash: b(9, 1), // 990: "middleware chain" locks in the accent the instant it's said
  irisPulse: b(9, 1), // 990: the signature move's second use - a pulse that stays inside the shot
  payoffResolved: b(9, 2), // 1020
  payoffHoldTick: b(9, 3), // 1050: the chime's tail still ringing, under a thinning pad
  pullbackStart: b(10, 0), // 1080
  pullbackMid: b(10, 1, 2), // 1125: the pull-back's midpoint
  pullbackEnd: b(10, 3), // 1170
  payoffOut: b(11, 0), // 1200
  // lockup (bars 11-14)
  shrinkStart2: b(11, 0), // 1200: the session panel begins collapsing toward the URL pill
  shrinkTick1: b(11, 1), // 1230
  shrinkTick2: b(11, 2), // 1260
  shrinkTick3: b(11, 3), // 1290
  detachStart: b(12, 0), // 1320: the avatar separates from the panel and starts scaling up on its own
  detachTick: b(12, 1), // 1350
  collapseMid: b(12, 2), // 1380
  collapseEnd: b(12, 3), // 1410
  lockupIrisStart: b(13, 0), // 1440: the signature move's third and final use
  lockupIrisFull: b(13, 1), // 1470: it becomes the end card's own ground
  wordmarkIn: b(13, 1), // 1470
  urlIn: b(13, 2), // 1500 (reads for 180 f = 3.0 s, over the brief's 1.7 s floor)
  wordmarkResolved: b(13, 3), // 1530
  taglineIn: b(13, 3), // 1530: starts the instant the wordmark resolves
  taglineResolved: b(14, 0), // 1560
  taglineHoldTick: b(14, 1), // 1590
  taglineExitStart: b(14, 2), // 1620: reading-order exit begins as the tail starts to decay
};

/**
 * One designed near-still hold per film (motion-tokens.md): the empty reply box after the
 * interviewer's line, cursor still blinking, capped at the tool's 96 f ceiling. It is immediately
 * followed by the turn's subtract-reveal and glyph iris, the film's biggest move so far.
 */
export const HOLD = { from: CUE.holdFrom, to: CUE.holdFrom + 96 }; // 120 -> 216

export type Copy = {
  id: string;
  text: string; // exactly what is on screen (\n separates lines)
  in: number; // first frame any of it is visible
  resolved: number; // first frame it is fully readable
  out: number; // first frame it starts to leave (TOTAL if it stays)
  kind?: 'copy' | 'ui'; // 'ui': a string the product shows (a typed command, code, a URL, an app label); not budgeted
};

// Every on-screen word, for the word budget (kind: 'ui' entries are counted apart) and the hold
// check (resolved -> out >= 36 f + 6 f/word at 60 fps). The chat dialogue, the wordmark and the
// URL are all 'ui': the product's own text, not the film talking (references/copy-and-type.md §1).
// Only `tagline` is the film's own voice, and it is the brand's own existing line
// (assets/banner-dark.png), reused rather than rewritten.
export const COPY: Copy[] = [
  { id: 'interviewer', text: 'Walk me through this.', in: CUE.hookIn, resolved: CUE.hookResolved, out: CUE.turnStart, kind: 'ui' },
  { id: 'problem', text: 'One function handles every request.', in: CUE.problemIn, resolved: CUE.problemResolved, out: CUE.problemOut, kind: 'ui' },
  { id: 'naive', text: 'One big function with if statements.', in: CUE.naiveIn, resolved: CUE.naiveResolved, out: CUE.naiveOut, kind: 'ui' },
  { id: 'constraint', text: "Forty routes need it. Miss one, it's open.", in: CUE.constraintIn, resolved: CUE.constraintResolved, out: CUE.constraintOut, kind: 'ui' },
  { id: 'better', text: 'Put the check in one function every route calls first.', in: CUE.betterIn, resolved: CUE.betterResolved, out: CUE.betterOut, kind: 'ui' },
  { id: 'payoff', text: 'Yes, exactly. You rederived a middleware chain.', in: CUE.payoffIn, resolved: CUE.payoffResolved, out: CUE.payoffOut, kind: 'ui' },
  { id: 'wordmark', text: 'rederive', in: CUE.wordmarkIn, resolved: CUE.wordmarkResolved, out: TOTAL, kind: 'ui' },
  { id: 'url', text: 'github.com/EricJujianZou/rederive', in: CUE.urlIn, resolved: CUE.urlIn + 30, out: TOTAL, kind: 'ui' },
  { id: 'tagline', text: 'Learn any codebase by re-designing\nit yourself from first principles.', in: CUE.taglineIn, resolved: CUE.taglineResolved, out: TOTAL },
];

/** One COPY entry by id; acts read their text and timing from here so the budget stays true. */
export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};
