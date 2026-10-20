// The sound events of the film, computed from the picture code. scripts/export-cues.ts calls the
// default export and writes out/cues.json; scripts/audio/score.py turns each event into a tuned
// sound on its exact frame (schema and recipes: references/sound.md).
import { IRIS } from './acts/Act3';
import { SPR } from './lib/anim';
import { hit, peak, settleOf } from './lib/sync';
import { E } from './lib/anim';
import { ACT, CUE, TOTAL, W } from './timeline';
import { CROSS_FRAME, GATE_A_FRAME, GATE_DIRECT_FRAME, RELAY, relayStart, STRAIGHT, straightHit } from './ui/diagram-math';
import { SERVER_DROP_START, SCREEN_LAND_START } from './ui/Diagram';
import { D, layoutFor } from './ui/layout';
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
  id?: string;
};

const panX = (x: number) => Math.max(-0.8, Math.min(0.8, ((x - W / 2) / (W / 2)) * 0.8));
const L = layoutFor(W, 1080);
const dx = (x: number) => panX(L.diagram.cx + x * L.diagram.k); // a drawing-unit x to a pan
const actOf = (f: number) => Object.entries(ACT).find(([, a]) => f >= a.from && f < a.from + a.dur)?.[0] ?? 'tail';

export default function cues(): SoundEvent[] {
  const ev: SoundEvent[] = [];

  // Typing. A human's keys tick per character (word blips on spaces); the product's words pop softly.
  for (const [id, s] of Object.entries(SCHEDULES)) {
    const frames = unitFrames(s);
    const human = s.mode === 'char';
    const pan = human ? 0.15 : -0.25;
    frames.forEach((F, i) => {
      if (human) ev.push({ f: F, kind: 'key', weight: 0.5, pan, variant: isWordFrame(s, F) ? 'word' : undefined, id: `${id}-k${i}` });
      else ev.push({ f: F, kind: 'tick', weight: 0.35, pan, variant: 'crisp', id: `${id}-w${i}` });
    });
  }

  // The sends: a confirm click on each press.
  [CUE.send1, CUE.send2, CUE.send3].forEach((f, i) => ev.push({ f, kind: 'click', weight: 0.9, pan: 0.3, variant: 'confirm', id: `send${i + 1}` }));

  // Bar 1: the phones land (soft), the routers draw (nothing: continuous), the labels fade (nothing).
  ev.push({ f: hit(CUE.phonesIn, SPR.soft, 0.92), kind: 'land', weight: 0.5, pan: 0, variant: 'light', id: 'phones-land' });

  // Bar 3: router A opens for its own packet (a small snap), the packets drop at router B (thuds).
  ev.push({ f: GATE_A_FRAME, kind: 'snap', weight: 0.5, pan: dx(D.routerA.x), id: 'gateA' });
  for (let i = 0; i < STRAIGHT.n; i++) ev.push({ f: straightHit(i), kind: 'hit', weight: i === 0 ? 1.1 : 0.7, pan: dx(D.routerB.x), id: `drop${i}` });
  // the push-in on router B: a whoosh with its apex on the camera's velocity peak
  const push1 = { from: CUE.pushIn - 6, to: CUE.pushIn + 44 };
  ev.push({ f: peak(push1.from, push1.to, E.cam), kind: 'whoosh', weight: 0.6, pan: dx(D.routerB.x) * 0.5, dur: push1.to - push1.from, apexFrac: (peak(push1.from, push1.to, E.cam) - push1.from) / (push1.to - push1.from), id: 'push1' });

  // Bar 6: the server lands (landing 1), the relay lines draw (settle tick), each relayed packet passes (soft tick)
  ev.push({ f: hit(SERVER_DROP_START, SPR.land, 1), kind: 'land', weight: 1.0, pan: 0, id: 'server-land' });
  ev.push({ f: settleOf(CUE.relayDrawn, CUE.relayDrawn + 16, E.out), kind: 'tick', weight: 0.5, pan: 0, id: 'relay-drawn' });
  for (let i = 0; i < RELAY.count; i++) {
    const mid = relayStart(i) + RELAY.dur / 2;
    if (mid > CUE.send3) break;
    ev.push({ f: mid, kind: 'tick', weight: 0.4, pan: 0, id: `relay${i}` });
  }
  // Bar 7: the detour label pops, its bar fills (nothing), it ticks once more
  ev.push({ f: hit(CUE.detour, SPR.firm, 0.5), kind: 'pop', weight: 0.7, pan: dx(250), id: 'detour' });
  ev.push({ f: CUE.detourPulse, kind: 'tick', weight: 0.5, pan: dx(250), variant: 'crisp', id: 'detour-pulse' });

  // Bar 9: the address chips land on the phones, the server leaves (a soft suck)
  ev.push({ f: CUE.chipsLand, kind: 'land', weight: 0.6, pan: dx(D.phoneA.x), variant: 'light', id: 'chipA-land' });
  ev.push({ f: CUE.chipsLand, kind: 'land', weight: 0.6, pan: dx(D.phoneB.x), variant: 'light', id: 'chipB-land' });
  ev.push({ f: CUE.serverOut + 8, kind: 'suck', weight: 0.5, pan: 0, dur: 16, apexFrac: 0.5, id: 'server-out' });

  // Bar 10: the routers open (snaps), the packets cross (a whoosh apex), the arrival is the drop
  ev.push({ f: GATE_DIRECT_FRAME, kind: 'snap', weight: 0.8, pan: dx(D.routerA.x), id: 'gateA-open' });
  ev.push({ f: GATE_DIRECT_FRAME, kind: 'snap', weight: 0.8, pan: dx(D.routerB.x), id: 'gateB-open' });
  ev.push({ f: CROSS_FRAME, kind: 'whoosh', weight: 0.7, pan: 0, dur: CUE.directLand - CUE.bothSend, apexFrac: (CROSS_FRAME - CUE.bothSend) / (CUE.directLand - CUE.bothSend), id: 'cross' });
  ev.push({ f: hit(SCREEN_LAND_START, SPR.land, 1), kind: 'drop', weight: 1.3, pan: 0, id: 'direct-land' });
  // Bar 11: ICE punches in (hit), re-forms as the line (nothing: the words tick)
  ev.push({ f: CUE.iceIn + 2, kind: 'hit', weight: 1.0, pan: 0, id: 'ice' });
  ev.push({ f: CUE.payoffResolved, kind: 'bell', weight: 0.9, pan: -0.2, variant: 'motif', id: 'payoff-bell' });
  // Bar 12: the four chips pop
  [CUE.chip1, CUE.chip2, CUE.chip3, CUE.chip4].forEach((f, i) => ev.push({ f: hit(f, SPR.micro, 0.5), kind: 'pop', weight: 0.6, pan: i % 2 === 0 ? -0.4 : 0.4, id: `chip${i + 1}` }));

  // Lockup: the seed swells, the iris swallows (suck into the cut), the mark lands, the name locks, the tagline settles
  ev.push({ f: CUE.seed, kind: 'swell', weight: 0.6, pan: -0.3, dur: CUE.iris - CUE.seed, id: 'seed' });
  ev.push({ f: IRIS.from + IRIS.dur, kind: 'suck', weight: 1.0, pan: 0, dur: IRIS.dur + 10, apexFrac: 0.7, id: 'iris' });
  ev.push({ f: hit(CUE.markLand, SPR.word, 0.92), kind: 'snap', weight: 0.8, pan: -0.1, id: 'name-lock' });
  ev.push({ f: settleOf(CUE.tagline, CUE.tagline + 24, E.out), kind: 'bell', weight: 0.7, pan: 0, variant: 'motif', id: 'tagline' });

  return ev.map((e) => ({ ...e, id: `${actOf(e.f)}:${e.id}` })).filter((e) => e.f >= 0 && e.f < TOTAL).sort((a, b) => a.f - b.f);
}
