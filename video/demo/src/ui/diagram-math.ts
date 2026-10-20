// The drawing's motion as numbers, Node-safe, so src/sync.ts can put each sound on the frame the
// picture actually crosses a router or lands on a phone.
import { E, mix, prog } from '../lib/anim';
import { CUE, f60 } from '../timeline';
import { D } from './layout';

/** The phones' inner edges, where packets leave and land. */
export const EDGE_A = D.phoneA.x + D.phoneW / 2; // -501
export const EDGE_B = D.phoneB.x - D.phoneW / 2; // 501

/** Straight attempt: packet i (0..2) leaves phone A at packets1 + 8 i and accelerates into router B. */
export const STRAIGHT = { n: 3, stagger: f60(8), dur: CUE.dropHit - CUE.packets1 };
export const straightX = (i: number, f: number) => mix(EDGE_A, D.routerB.x - D.routerW / 2, prog(f, CUE.packets1 + i * STRAIGHT.stagger, CUE.packets1 + i * STRAIGHT.stagger + STRAIGHT.dur, E.contact));
export const straightHit = (i: number) => CUE.packets1 + i * STRAIGHT.stagger + STRAIGHT.dur;
/** First frame packet i has passed router A (its own router opens for the outbound packet). */
export const crossing = (xAt: (f: number) => number, x: number, from: number, to: number) => {
  for (let F = from; F <= to; F++) if (xAt(F) >= x) return F;
  return to;
};
export const GATE_A_FRAME = crossing((f) => straightX(0, f), D.routerA.x, CUE.packets1, CUE.dropHit);

/** Relay: a packet every 30 f from packets2, alternating A->S->B and B->S->A, 30 f per trip. */
export const RELAY = { period: f60(30), dur: f60(30), count: 12 };
export const relayStart = (i: number) => CUE.packets2 + i * RELAY.period;

/** Direct: both packets leave at bothSend, cross at the centre and land at directLand. */
export const DIRECT = { from: CUE.bothSend, to: CUE.directLand };
/** Packet from A at frame f (x grows); the B packet mirrors it. Eases in, so each opens its router mid-flight. */
export const directX = (f: number) => mix(EDGE_A, EDGE_B, prog(f, DIRECT.from, DIRECT.to, E.smooth));
export const GATE_DIRECT_FRAME = crossing(directX, D.routerA.x, DIRECT.from, DIRECT.to);
export const CROSS_FRAME = crossing(directX, 0, DIRECT.from, DIRECT.to);

/** Address chips: they leave the server at chipsFly and land on the phones at chipsLand. */
export const CHIP = { from: CUE.chipsFly, to: CUE.chipsLand };
