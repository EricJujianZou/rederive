// The sound events of the film, computed from the picture code. scripts/export-cues.ts calls the
// default export and writes out/cues.json; scripts/audio/score.py turns each event into a tuned
// sound on its exact frame (schema and recipes: references/sound.md).
//
// The rules this file follows:
// - Every sound has a visible cause, but not every picture event gets a sound: sound discrete
//   state changes (a press, an insert, a lock, a landing, the logo assembling), leave continuous
//   motion silent, and let the music carry most cuts. A class of action, once sounded, is
//   sounded every time.
// - Impacts go on the contact frame, pops on the 50% frame, settles on the 97% frame, and a
//   whoosh's apex on the velocity peak of the move it belongs to.
// - Import the constants the acts animate with (they export them for this file) and compute the
//   frame; a frame typed by hand drifts the first time an act is retimed.
import { DOT_TRAVEL } from './acts/Act1';
import { HERO, LOCKUP_MOVE } from './acts/Act2';
import { MARK } from './brand/Mark';
import { peak, settleOf } from './lib/sync';
import { ACT, CUE, FPS, TOTAL, W } from './timeline';

export type Kind =
  | 'tick' | 'tock' | 'hit' | 'land' | 'pop' | 'whoosh' | 'riser'
  | 'drop' | 'key' | 'click' | 'snap' | 'swell' | 'bell' | 'suck';

export type SoundEvent = {
  f: number; // absolute frame the sound belongs on (fractional is fine)
  kind: Kind;
  weight?: number; // 0..2, 1 = normal; scales level (and size for whoosh and land)
  pan?: number; // -1 left .. +1 right from screen x; score.py keeps effects within +-0.15, a whoosh travels the full amount
  pitch?: number | string; // MIDI number or "Eb6"; omit and score.py picks a tone in key
  apexFrac?: number; // whoosh / suck: where in its length the loudest point sits (lands on f)
  dur?: number; // frames: whoosh, riser, swell and suck length
  variant?: string; // key: 'word' | 'space' | 'return' | 'back'; tick: 'crisp'; click: 'confirm'; land: 'light'; bell: 'motif'; pop: 'down'
  id?: string; // a name for QA reports
};

/** Seconds to frames, for sound lengths. */
const sec = (s: number) => Math.round(s * FPS);
/** Screen x (px) to pan, scaled so nothing sits hard in one ear. */
const panX = (x: number) => Math.max(-0.8, Math.min(0.8, ((x - W / 2) / (W / 2)) * 0.8));
/** A mark piece's centre (mark units) to pan, with the mark at its hero position. */
const panMark = (cx: number) => panX(HERO.x + (cx / 100) * HERO.size);
/** The act a frame belongs to, so QA reports read "mark:dome" rather than a bare frame. */
const actOf = (f: number) => Object.entries(ACT).find(([, a]) => f >= a.from && f < a.from + a.dur)?.[0] ?? 'tail';

/** A move from frame a to b on `ease`: whoosh as long as the move with its apex on the velocity peak. */
const move = (m: { from: number; to: number; ease: (t: number) => number }, weight: number, pan: number, id: string): SoundEvent => {
  const apex = peak(m.from, m.to, m.ease);
  const dur = Math.max(sec(0.3), m.to - m.from); // even a short whip gets 0.3 s of air
  return { f: apex, kind: 'whoosh', weight, pan, dur, apexFrac: (apex - m.from) / (m.to - m.from), id };
};

export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // Act 1: each word pops ON its beat (the act starts it early by its 50% time) and the dot,
  // waiting at the right end of the line, ticks with it. The pops climb the key's pentatonic.
  [CUE.word1, CUE.word2, CUE.word3, CUE.word4].forEach((f, i) => {
    ev.push({ f, kind: 'pop', weight: 0.9, pan: -0.35 + 0.2 * i, id: `word${i + 1}` }); // words run left to right
    ev.push({ f, kind: 'tick', weight: 0.8, pan: 0.4, id: `dot-tick${i + 1}` });
  });
  // The line closes on E.contact and stops dead: the lock is a contact frame, tuned to the chord.
  ev.push({ f: CUE.lock, kind: 'snap', weight: 1.2, pan: 0.1, id: 'lock' });
  ev.push({ f: CUE.pulse, kind: 'tock', weight: 0.8, pan: 0.4, id: 'pulse' });
  // The words leave as the dot sets off: one whoosh for the flight, travelling left with it.
  ev.push(move(DOT_TRAVEL, 1, -0.5, 'dot-flight'));
  // The flight ends at rest (E.rest), so its sound goes on the 97% settle, not on the act seam.
  ev.push({ f: settleOf(DOT_TRAVEL.from, DOT_TRAVEL.to, DOT_TRAVEL.ease), kind: 'tock', weight: 0.7, pan: panMark(MARK.D.cx), id: 'dot-seats' });

  // Act 2: the dome and the block land on their contact frames (springs started early by delayTo).
  ev.push({ f: CUE.pieceA, kind: 'land', weight: 1, pan: panMark(MARK.A.cx), id: 'dome' });
  ev.push({ f: CUE.pieceB, kind: 'land', weight: 1, pan: panMark(MARK.B.x + MARK.B.w / 2), id: 'block' });
  // The mark slides into the lockup while the name rides out to its right. The slide eases into
  // the downbeat, where the camera punches: the name's lock rides on the drop instead of sitting
  // on the slide's 97% frame 7 f earlier, where the two hits would flam.
  ev.push(move(LOCKUP_MOVE, 0.7, 0.3, 'lockup-slide'));
  ev.push({ f: CUE.lockup, kind: 'drop', weight: 1, id: 'lockup' }); // the payoff: the music lands on the tonic
  ev.push({ f: CUE.lockup, kind: 'snap', weight: 0.8, pan: 0.2, id: 'name-locks' });
  // The dot keeps the clock through the hold: the film ends on the tick it opened with.
  ev.push({ f: CUE.tick1, kind: 'tick', weight: 1, pan: -0.15, id: 'hold-tick1' });
  ev.push({ f: CUE.tick2, kind: 'tock', weight: 1.2, pan: -0.15, id: 'hold-tock' }); // the lower partner sits in the pad's band
  ev.push({ f: CUE.tick3, kind: 'tick', weight: 1, pan: -0.15, id: 'hold-tick2' });

  for (const e of ev) {
    if (!(e.f >= 0 && e.f < TOTAL)) throw new Error(`sync: ${e.id} at f=${e.f} is outside the film (0..${TOTAL - 1})`);
    e.id = `${actOf(e.f)}:${e.id}`;
  }
  return ev;
}
