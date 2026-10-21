// The sound events of the film, computed from the picture code. scripts/export-cues.ts calls the
// default export and writes out/cues.json; scripts/audio/score.py turns each event into a sound on
// its exact frame: a take from the earshot kit (audio/kit.json) when the event's role has one,
// otherwise the synth voice for its kind (schema and recipes: references/sound.md).
import { IRIS } from './acts/Act3';
import { E, SPR } from './lib/anim';
import { hit, peak, settleOf } from './lib/sync';
import { ACT, CUE, f60, TOTAL, W } from './timeline';
import { BOX_DROP_LEAD, BROWSER_EXIT, CHAIN_LAND_START, ENTRANCE, GATE, GATE_DROP_START, SCROLL, CARD_DROP_START } from './ui/diagram-math';
import { D, layoutFor, SV } from './ui/layout';
import { isWordFrame, SCHEDULES, unitFrames } from './ui/typing';

export type Kind = 'tick' | 'tock' | 'hit' | 'land' | 'pop' | 'whoosh' | 'riser' | 'drop' | 'key' | 'click' | 'snap' | 'swell' | 'bell' | 'suck';

export type SoundEvent = {
  f: number;
  kind: Kind;
  weight?: number;
  pan?: number;
  pitch?: number | string;
  apexFrac?: number;
  dur?: number;
  variant?: string;
  role?: string; // the earshot kit role that voices it (score.json "kit"); the synth voices it otherwise
  id?: string;
};

const panX = (x: number) => Math.max(-0.8, Math.min(0.8, ((x - W / 2) / (W / 2)) * 0.8));
const L = layoutFor(W, 1080);
const dx = (x: number) => panX(L.diagram.cx + x * L.diagram.k); // a drawing-unit x to a pan
const actOf = (f: number) => Object.entries(ACT).find(([, a]) => f >= a.from && f < a.from + a.dur)?.[0] ?? 'tail';

export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // Typing. A human's keys thock per character (the space bar on spaces); the product's words tap softly.
  for (const [id, s] of Object.entries(SCHEDULES)) {
    const frames = unitFrames(s);
    const human = s.mode === 'char';
    const pan = human ? 0.15 : -0.25;
    frames.forEach((F, i) => {
      if (human) ev.push({ f: F, kind: 'key', weight: id === 'cmd' ? 0.3 : 0.8, pan, variant: isWordFrame(s, F) ? 'word' : undefined, id: `${id}-k${i}` });
      else ev.push({ f: F, kind: 'tick', weight: 0.45, pan, variant: 'crisp', role: 'tick.crisp', id: `${id}-w${i}` });
    });
  }

  // The sends: a tuned pluck per press, one scale step higher each time the user answers.
  (
    [
      [CUE.sendCmd, 'D6', 'send-cmd'],
      [CUE.send1, 'E6', 'send1'],
      [CUE.send2, 'F#6', 'send2'],
      [CUE.send3, 'A6', 'send3'],
    ] as const
  ).forEach(([f, pitch, id]) => ev.push({ f, kind: 'click', weight: 0.9, pan: 0.3, pitch, variant: 'confirm', role: 'click.confirm', id }));

  // Bar 2-3: the repo card lands, the browser and the server settle, the rows fill, the card becomes the pill
  ev.push({ f: hit(CARD_DROP_START, SPR.firm, 0.92), kind: 'land', weight: 0.8, pan: 0, role: 'land', id: 'card-land' });
  ev.push({ f: hit(CUE.drawIn, SPR.soft, 0.92), kind: 'land', weight: 0.5, pan: 0, variant: 'light', role: 'land.light', id: 'draw-land' });
  for (let i = 0; i < D.rowsVisible; i++) ev.push({ f: CUE.routesIn + f60(6) * i + f60(10), kind: 'tick', weight: 0.3, pan: dx(D.server.x), variant: 'crisp', role: 'tick.crisp', id: `row${i}` });
  ev.push({ f: CUE.headerIn, kind: 'land', weight: 0.4, pan: -0.5, variant: 'light', role: 'land.light', id: 'header' });

  // The step line pops before each problem
  [CUE.label1, CUE.label2, CUE.label3].forEach((f, i) => ev.push({ f: hit(f, SPR.micro, 0.5), kind: 'pop', weight: 0.7, pan: -0.3, role: 'pop', id: `step${i + 1}` }));

  // Bar 5-6: a lock on each row, the request passes one and reaches its handler
  for (let i = 0; i < D.rowsVisible; i++) ev.push({ f: hit(CUE.locksIn + f60(6) * i, SPR.micro, 0.5), kind: 'tick', weight: 0.4, pan: dx(SV.lockX), role: 'tick', id: `lock${i}` });
  ev.push({ f: CUE.lockPass, kind: 'tick', weight: 0.7, pan: dx(SV.lockX), role: 'tick', id: 'lock-pass' });
  ev.push({ f: CUE.handler1, kind: 'land', weight: 0.6, pan: dx(SV.handlerX), variant: 'light', role: 'land.light', id: 'handler1' });

  // Bar 6-7: the list scrolls (a whoosh on its velocity peak), the camera pushes, the breach
  ev.push({ f: peak(SCROLL.from, SCROLL.to, E.inOut), kind: 'whoosh', weight: 0.5, pan: dx(D.server.x) * 0.5, dur: SCROLL.to - SCROLL.from, apexFrac: (peak(SCROLL.from, SCROLL.to, E.inOut) - SCROLL.from) / (SCROLL.to - SCROLL.from), role: 'whoosh.short', id: 'scroll' });
  const push1 = { from: CUE.pushIn - 6, to: CUE.pushIn + 44 };
  ev.push({ f: peak(push1.from, push1.to, E.cam), kind: 'whoosh', weight: 0.5, pan: dx(D.server.x) * 0.5, dur: push1.to - push1.from, apexFrac: (peak(push1.from, push1.to, E.cam) - push1.from) / (push1.to - push1.from), role: 'whoosh.short', id: 'push1' });
  ev.push({ f: CUE.breachHit, kind: 'hit', weight: 1.0, pan: dx(SV.handlerX) * 0.5, role: 'hit', id: 'breach' });

  // Bar 10-11: the locks stream into the gate (landing 1 of 2), a request passes it, one bounces off
  ev.push({ f: CUE.locksMid, kind: 'whoosh', weight: 0.4, pan: dx(GATE.x) * 0.5, dur: CUE.gateLand - CUE.locksLift, apexFrac: 0.5, role: 'whoosh.short', id: 'locks-lift' });
  ev.push({ f: hit(GATE_DROP_START, SPR.land, 1), kind: 'land', weight: 1.0, pan: dx(GATE.x), role: 'land', id: 'gate-land' });
  ev.push({ f: CUE.gatePass, kind: 'tick', weight: 0.7, pan: dx(GATE.x), role: 'tick', id: 'gate-pass' });
  ev.push({ f: CUE.handler2, kind: 'land', weight: 0.6, pan: dx(SV.handlerX), variant: 'light', role: 'land.light', id: 'handler2' });
  ev.push({ f: CUE.bounce, kind: 'tock', weight: 0.7, pan: dx(GATE.x), role: 'tock', id: 'bounce' });

  // Bar 11: log, parse and rate limit drop onto the gate's spot
  ([[CUE.logIn, 'log'], [CUE.parseIn, 'parse'], [CUE.rateIn, 'rate']] as const).forEach(([f, id]) =>
    ev.push({ f: hit(f - BOX_DROP_LEAD, SPR.firm, 0.92), kind: 'land', weight: 0.5, pan: dx(GATE.x), variant: 'light', role: 'land.light', id: `box-${id}` }),
  );

  // Bar 14-16: the boxes line up, the request steps through them (four plucks up the scale) and lands (landing 2 of 2)
  ev.push({ f: peak(CUE.lineUp, CUE.lineUpDone - f60(12), E.inOut), kind: 'whoosh', weight: 0.4, pan: dx(-200) * 0.5, dur: CUE.lineUpDone - CUE.lineUp, apexFrac: 0.45, role: 'whoosh.short', id: 'line-up' });
  ev.push({ f: CUE.lineUpDone, kind: 'land', weight: 0.6, pan: dx(-120), variant: 'light', role: 'land.light', id: 'line-up-done' });
  ([[CUE.chain1, 'E5'], [CUE.chain2, 'F#5'], [CUE.chain3, 'A5'], [CUE.chain4, 'B5']] as const).forEach(([f, pitch], i) =>
    ev.push({ f, kind: 'bell', weight: 0.8, pan: dx(D.chainX[i]), pitch, role: 'bell.short', id: `chain${i + 1}` }),
  );
  ev.push({ f: hit(CHAIN_LAND_START, SPR.land, 1), kind: 'land', weight: 1.4, pan: dx(SV.handlerX) * 0.5, role: 'land', id: 'chain-land' });
  ev.push({ f: CUE.chainLand, kind: 'bell', weight: 1.1, pan: 0, pitch: 'D6', role: 'bell', id: 'chain-tonic' });
  // the giant word punches in; the payoff line resolves on the motif
  ev.push({ f: CUE.mwIn + 2, kind: 'hit', weight: 0.9, pan: 0, role: 'hit', id: 'middleware' });
  ev.push({ f: CUE.payoffResolved, kind: 'bell', weight: 0.6, pan: -0.2, variant: 'motif', role: 'bell', id: 'payoff-bell' });

  // Lockup: the seed swells, the iris swallows (suck into the cut), the mark lands, the name locks, the tagline settles
  ev.push({ f: CUE.seed, kind: 'swell', weight: 0.6, pan: -0.3, dur: CUE.iris - CUE.seed, id: 'seed' });
  ev.push({ f: IRIS.from + IRIS.dur, kind: 'suck', weight: 1.0, pan: 0, dur: IRIS.dur + 10, apexFrac: 0.85, role: 'suck', id: 'iris' });
  ev.push({ f: IRIS.from + IRIS.dur, kind: 'land', weight: 0.7, pan: 0, role: 'land', id: 'iris-full' });
  ev.push({ f: hit(CUE.markLand, SPR.word, 0.92), kind: 'snap', weight: 0.8, pan: -0.1, role: 'snap', id: 'name-lock' });
  ev.push({ f: settleOf(CUE.tagline, CUE.tagline + 26, E.out), kind: 'bell', weight: 0.7, pan: 0, pitch: 'D5', role: 'bell', id: 'tagline' });

  void BROWSER_EXIT;
  void ENTRANCE;
  return ev.map((e) => ({ ...e, id: `${actOf(e.f)}:${e.id}` })).filter((e) => e.f >= 0 && e.f < TOTAL).sort((a, b) => a.f - b.f);
}
