// Typing schedules, Node-safe: the picture draws from these and src/sync.ts derives every key
// sound from the same numbers, so a retimed line moves its sounds with it.
import { clamp, E, fd } from '../lib/anim';
import { copy, CUE, f60 } from '../timeline';

export type Schedule = {
  text: string;
  start: number; // first character on the next whole frame
  end: number; // last character shows here
  mode: 'char' | 'word'; // a human types characters; the product streams words
  pause?: { at: number; until: number }; // a human pause: the count freezes between these frames
};

const S = (id: string, mode: 'char' | 'word', pause?: Schedule['pause']): Schedule => {
  const c = copy(id);
  return { text: c.text, start: c.in, end: c.resolved, mode, pause };
};

export const SCHEDULES: Record<string, Schedule> = {
  intro: S('intro', 'word'),
  cmd: S('cmd', 'char'),
  problem: S('problem', 'word'),
  answer1: S('answer1', 'char'),
  constraint1: S('constraint1', 'word'),
  answer2: S('answer2', 'char'),
  constraint2: S('constraint2', 'word'),
  answer3: S('answer3', 'char', { at: CUE.type3Pause, until: CUE.type3Resume }),
  payoff: S('payoff', 'word'),
};

/** Units (characters or words) in the text. */
export const unitsOf = (s: Schedule) => (s.mode === 'word' ? s.text.split(' ').length : s.text.length);

/** Effective typing time at frame f, with the pause removed. */
const tAt = (s: Schedule, f: number) => {
  if (!s.pause) return f - s.start;
  if (f < s.pause.at) return f - s.start;
  if (f < s.pause.until) return s.pause.at - s.start;
  return f - s.start - (s.pause.until - s.pause.at);
};
const boxOf = (s: Schedule) => s.end - s.start - (s.pause ? s.pause.until - s.pause.at : 0);

/** Units shown at frame f (whole number, from the rounded frame so blur sub-samples agree). */
export const shownAt = (s: Schedule, f: number) => {
  const F = fd(f);
  const n = unitsOf(s);
  const t = clamp(tAt(s, F) / boxOf(s));
  // a human types with a quad-out cadence (fast start, slow end); the product streams evenly
  const p = s.mode === 'char' ? E.type(t) : t;
  return F < s.start ? 0 : Math.min(n, Math.ceil(p * n - 1e-6));
};

/** The whole frame on which each unit first shows (for the key sounds). */
export const unitFrames = (s: Schedule): number[] => {
  const n = unitsOf(s);
  const at: number[] = [];
  for (let F = Math.ceil(s.start); F <= s.end + f60(2) && at.length < n; F++) {
    const k = shownAt(s, F);
    while (at.length < k) at.push(F);
  }
  while (at.length < n) at.push(s.end);
  return at;
};

/** Is a space (a word boundary) typed on frame F? For the 'word' key variant. */
export const isWordFrame = (s: Schedule, F: number) => {
  if (s.mode === 'word') return true;
  const k = shownAt(s, F);
  const prev = shownAt(s, F - 1);
  return k > prev && s.text[k - 1] === ' ';
};
