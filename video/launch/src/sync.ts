// The sound events of the film, computed from the picture code. scripts/export-cues.ts calls the
// default export and writes out/cues.json; scripts/audio/score.py turns each event into a tuned
// sound on its exact frame (schema and recipes: references/sound.md).
//
// The rules this file follows:
// - Every sound has a visible cause, but not every picture event gets a sound: sound discrete
//   state changes (a message landing, a lock, a landing, the logo assembling), leave continuous
//   motion silent (the camera, the typing cursor's blink, the panel's shrink), and let the music
//   carry most cuts. A class of action, once sounded, is sounded every time.
// - Impacts go on the contact frame, pops on the 50% frame, settles on the 97% frame, and a
//   whoosh's apex on the velocity peak of the move it belongs to.
import { E, SPR } from './lib/anim';
import { delayTo, peak, settleOf } from './lib/sync';
import { typeFrames } from './fx/TypeOn';
import { ACT, CUE, FPS, TOTAL } from './timeline';
import { avatarCenter, SESSION } from './ui/layout';

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
const panX = (x: number) => Math.max(-0.8, Math.min(0.8, ((x - 1920 / 2) / (1920 / 2)) * 0.8));
/** The act a frame belongs to, so QA reports read "proof:constraint" rather than a bare frame. */
const actOf = (f: number) => Object.entries(ACT).find(([, a]) => f >= a.from && f < a.from + a.dur)?.[0] ?? 'tail';

/** A move from frame a to b on `ease`: whoosh as long as the move with its apex on the velocity peak. */
const whoosh = (a: number, b: number, ease: (t: number) => number, weight: number, pan: number, id: string): SoundEvent => {
  const apex = peak(a, b, ease);
  const dur = Math.max(sec(0.3), b - a);
  return { f: apex, kind: 'whoosh', weight, pan, dur, apexFrac: (apex - a) / (b - a), id };
};

/** One 'key' tick per word of a typed bubble, at the frame its first character lands. */
const typedWordTicks = (text: string, start: number, cps: number, pan: number, idPrefix: string): SoundEvent[] => {
  const at = typeFrames(text.length, { start, cps });
  const out: SoundEvent[] = [];
  let i = 0;
  text.split(' ').forEach((w, wi) => {
    out.push({ f: at[i], kind: 'key', weight: 0.6, pan, variant: 'word', id: `${idPrefix}-w${wi}` });
    i += w.length + 1;
  });
  return out;
};

export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // --- hook: the pull-back is the shot's only move -----------------------------------------
  ev.push(whoosh(CUE.hookPullStart, CUE.hookResolved, E.dolly, 0.6, -0.1, 'hook-pullback'));

  // --- turn: the panel folds away, the glyph iris carries the cut --------------------------
  ev.push({ f: CUE.turnStart + 36, kind: 'click', weight: 0.8, pan: 0.3, id: 'panel-fold' });
  ev.push(whoosh(CUE.irisSeed, CUE.sessionReveal, E.out, 1.3, 0, 'iris-swallow'));
  ev.push({ f: CUE.sessionReveal, kind: 'drop', weight: 0.9, id: 'session-revealed' }); // the world warms: a music event, not an effect alone

  // --- proof: each rederive message pops in; typed answers tick per word -------------------
  const pa = avatarCenter('problem');
  const ca = avatarCenter('constraint');
  ev.push({ f: CUE.ringResolve1 + delayTo(SPR.firm, 0.5), kind: 'pop', weight: 0.9, pan: panX(pa.x), id: 'problem-lands' });
  ev.push(...typedWordTicks('One big function with if statements.', CUE.naiveTypeStart, 16, 0.5, 'naive'));
  ev.push({ f: CUE.ringResolve2 + delayTo(SPR.firm, 0.5), kind: 'pop', weight: 1, pan: panX(ca.x), id: 'constraint-lands' });
  ev.push({ f: CUE.pushInPeak, kind: 'tick', weight: 0.7, pan: 0, id: 'push-in' });
  ev.push(...typedWordTicks('Put the check in one function every route calls first.', CUE.betterIn, 20, 0.5, 'better'));

  // --- payoff: the loudest moment in the film -----------------------------------------------
  ev.push({ f: CUE.payoffBoldFlash, kind: 'bell', weight: 1.4, variant: 'motif', id: 'payoff-bell' });
  ev.push({ f: CUE.payoffBoldFlash, kind: 'drop', weight: 1.3, id: 'payoff-drop' });
  ev.push({ f: settleOf(CUE.payoffBoldFlash, CUE.payoffResolved, E.out, 0.97), kind: 'tock', weight: 0.8, pan: 0, id: 'payoff-settle' });
  ev.push(whoosh(CUE.pullbackStart, CUE.pullbackEnd, E.cam, 0.6, 0, 'payoff-pullback'));

  // --- lockup: the panel collapses, the avatar becomes the mark, the accent floods once -----
  ev.push({ f: CUE.detachStart, kind: 'click', weight: 0.7, pan: panX(SESSION.x + SESSION.pad), id: 'avatar-detaches' });
  ev.push({ f: CUE.collapseEnd, kind: 'click', weight: 0.8, pan: 0, id: 'panel-becomes-pill' });
  ev.push({ f: CUE.lockupIrisStart, kind: 'swell', weight: 1.1, dur: sec(0.6), id: 'accent-flood' });
  ev.push({ f: CUE.wordmarkResolved, kind: 'snap', weight: 0.9, pan: 0, id: 'wordmark-locks' });
  ev.push({ f: CUE.taglineResolved, kind: 'tick', weight: 0.6, pan: 0, id: 'tagline-settles' });
  ev.push({ f: CUE.urlIn + sec(0.2), kind: 'tick', weight: 0.5, pan: 0, id: 'url-settles' });

  for (const e of ev) {
    if (!(e.f >= 0 && e.f < TOTAL)) throw new Error(`sync: ${e.id} at f=${e.f} is outside the film (0..${TOTAL - 1})`);
    e.id = `${actOf(e.f)}:${e.id}`;
  }
  return ev;
}
