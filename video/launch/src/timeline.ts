// The single source of truth for time. Picture (src/acts), sound (src/sync.ts -> out/cues.json)
// and QA (scripts/grid-check.ts) all import this file, so a change here moves everything together.
// Think in bars and beats, never in seconds. Keep this file free of React and CSS imports:
// Node scripts load it directly.

export const FPS = 60;
export const BPM = 120;
export const W = 1920;
export const H = 1080;

/** Frames per beat. Must be a whole number (grid-check fails otherwise): 60 fps -> 90, 100, 120, 144, 150 BPM. */
export const BEAT = (60 / BPM) * FPS;
export const BAR = BEAT * 4;
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
export const TAIL = FPS;

// Acts: contiguous, bar-aligned, [from, from + dur). Each act is its own composition in Root.tsx.
export const ACT = {
  statement: { from: b(1), dur: b(3) - b(1) }, // the line counts in, word per beat, and locks
  mark: { from: b(3), dur: b(5) + TAIL - b(3) }, // the dot becomes the mark; lockup builds to the end
};

export const TOTAL = b(5) + TAIL;

// Named sync points (absolute frames), all on the 16th grid. A cue that must sit off the grid
// carries a trailing `// offgrid: <reason>` comment, which grid-check accepts.
// Picture code reads these; src/sync.ts turns them into sound events.
export const CUE = {
  word1: b(1, 0), // each word pops (50% of its entrance) on a beat; the dot ticks with it
  word2: b(1, 1),
  word3: b(1, 2),
  word4: b(1, 3),
  lock: b(2), // the spread line closes up and the dot seats as its period: hit 1
  pulse: b(2, 1), // the period keeps time once while the line is read
  exit: b(2, 2), // the words leave (their entrance reversed); the dot sets off for the mark
  fly: b(2, 3), // the dot's flight hits top speed here (whoosh apex): Act 1 solves its start from it
  handoff: b(3), // the dot arrives at rest in its slot; act 2 opens on exactly this pose
  pieceA: b(3, 1), // the dome lands (contact frame)
  pieceB: b(3, 2), // the block lands (contact frame)
  lockup: b(4), // the mark settles into the lockup and the name locks beside it: hit 2
  tick1: b(4, 1), // the dot keeps the clock through the lockup hold
  tick2: b(4, 2),
  tick3: b(4, 3),
  end: b(5), // last bar line; TAIL follows
};

export type Copy = {
  id: string;
  text: string; // exactly what is on screen (\n separates lines)
  in: number; // first frame any of it is visible
  resolved: number; // first frame it is fully readable
  out: number; // first frame it starts to leave (TOTAL if it stays)
  kind?: 'copy' | 'ui'; // 'ui': a string the product shows (a typed command, code, a URL, an app label); not budgeted
};

// Every on-screen word, for the word budget (kind: 'ui' entries are counted apart) and the hold check (resolved -> out >= 36 f + 6 f/word at 60 fps).
export const COPY: Copy[] = [
  { id: 'statement', text: 'Built on the beat', in: 0, resolved: CUE.lock, out: CUE.exit },
  // cinetic:placeholder - the demo's invented name: use the product's, then delete this line.
  { id: 'wordmark', text: 'plinth', in: CUE.lockup - f60(34), resolved: CUE.lockup, out: TOTAL },
];

/** One COPY entry by id; acts read their text and timing from here so the budget stays true. */
export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};
