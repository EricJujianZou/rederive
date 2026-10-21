// The drawing's motion as numbers, Node-safe, so src/sync.ts can put each sound on the frame the
// picture actually crosses a lock, a gate or a box, and the acts share one set of paths.
import { clamp, E, mix, prog, SPR } from '../lib/anim';
import { delayTo } from '../lib/sync';
import { CUE, f60 } from '../timeline';
import { D, SV } from './layout';

export type P = { x: number; y: number };

/** Where a request leaves the browser, and where it enters the server. */
export const BROWSER_EXIT: P = { x: D.browser.x + D.browser.w / 2, y: 0 };
export const ENTRANCE: P = { x: SV.left, y: 0 };
/** The gate (auth) sits on the entrance, straddling the server's edge. */
export const GATE: P = { x: D.crowd[0].x, y: 0 };

/** The gate's drop starts so its spring makes contact on CUE.gateLand (landing 1 of 2). */
export const GATE_DROP_START = CUE.gateLand - delayTo(SPR.land, 1);
/** The repo card's drop starts so its spring makes contact on CUE.cardLand. */
export const CARD_DROP_START = CUE.cardLand - delayTo(SPR.land, 1);
/** A box's drop starts this many frames before its cue, so its spring makes contact on the cue. */
export const BOX_DROP_LEAD = delayTo(SPR.land, 1);
/** The handler the chain reaches pulses with a landing spring from this frame (landing 2 of 2). */
export const CHAIN_LAND_START = CUE.chainLand - delayTo(SPR.land, 1);

/** The forty routes. The first five are visible from bar 3; the rest scroll past in bar 6. */
export const ROUTES: string[] = [
  'GET /users', 'POST /login', 'GET /orders', 'PUT /cart', 'GET /me',
  'POST /logout', 'GET /users/:id', 'PATCH /users/:id', 'DELETE /users/:id', 'GET /orders/:id',
  'POST /orders', 'PUT /orders/:id', 'GET /cart', 'POST /cart', 'DELETE /cart/:id',
  'GET /products', 'GET /products/:id', 'POST /products', 'PATCH /products/:id', 'GET /search',
  'GET /invoices', 'GET /invoices/:id', 'GET /admin/users', 'POST /invoices', 'GET /settings',
  'PUT /settings', 'GET /sessions', 'DELETE /sessions/:id', 'GET /teams', 'POST /teams',
  'GET /teams/:id', 'PUT /teams/:id', 'GET /billing', 'POST /billing/cards', 'DELETE /billing/cards/:id',
  'GET /notifications', 'PUT /notifications/:id', 'GET /export', 'POST /webhooks', 'GET /health',
];
if (ROUTES.length !== D.routes || ROUTES[D.openRow] !== 'GET /admin/users') throw new Error('diagram-math: ROUTES must list 40 routes with GET /admin/users at the open row');

/** The row the chain's request lands in, and the row the first request reaches. */
export const CHAIN_ROW = 2; // GET /orders
export const FIRST_ROW = 1; // POST /login

/** The list's scroll at frame f: 0, through the forty rows to the open row, back to 0 on send2. */
export const scrollAt = (f: number) => {
  const target = SV.centreScroll(D.openRow);
  const down = prog(f, CUE.scrollStart, CUE.scrollEnd, E.inOut);
  const back = prog(f, CUE.locksLift, CUE.locksLift + f60(40), E.smooth);
  return target * down * (1 - back);
};
/** The scroll's velocity peak: where the whoosh's apex goes. */
export const SCROLL = { from: CUE.scrollStart, to: CUE.scrollEnd };

/** The routes counter: 5 -> 40 over the scroll (the reel reads the fractional value). */
export const countAt = (f: number) => mix(5, D.routes, prog(f, CUE.scrollStart, CUE.scrollEnd, E.smooth));

/** A point on a polyline at t in [0, 1], by arc length. */
export const poly = (pts: P[], t: number): P => {
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(l);
    total += l;
  }
  let d = clamp(t) * total;
  for (let i = 1; i < pts.length; i++) {
    const l = lens[i - 1];
    if (d <= l || i === pts.length - 1) {
      const u = l > 0 ? clamp(d / l) : 1;
      return { x: mix(pts[i - 1].x, pts[i].x, u), y: mix(pts[i - 1].y, pts[i].y, u) };
    }
    d -= l;
  }
  return pts[pts.length - 1];
};

/** The way into row `y` from a point on the entrance line: down the server's left margin, then along the row. */
const intoRow = (from: P, y: number): P[] => [from, { x: SV.rowLeft - 10, y }, { x: SV.lockX, y }];
const alongRow = (y: number): P[] => [{ x: SV.lockX, y }, { x: SV.handlerX, y }];

/**
 * The first request: leaves the browser (dotWait), waits at the entrance, goes in on dotEnter,
 * meets row 1's lock exactly on lockPass and reaches its handler on handler1.
 */
export const firstDotAt = (f: number): P | null => {
  if (f < CUE.dotWait) return null;
  if (f < CUE.dotEnter) return poly([BROWSER_EXIT, ENTRANCE], prog(f, CUE.dotWait, CUE.dotWaiting, E.out));
  const y = SV.rowY(FIRST_ROW, 0);
  if (f < CUE.lockPass) return poly(intoRow(ENTRANCE, y), prog(f, CUE.dotEnter, CUE.lockPass, E.smooth));
  return poly(alongRow(y), prog(f, CUE.lockPass, CUE.handler1, E.contact));
};

/** The second request: straight through the open row, no lock in the way, into the handler on breachHit. */
export const breachDotAt = (f: number): P | null => {
  if (f < CUE.dot2) return null;
  const y = SV.rowY(D.openRow, scrollAt(f));
  const t1 = CUE.dot2 + f60(20);
  if (f < t1) return poly([BROWSER_EXIT, ENTRANCE], prog(f, CUE.dot2, t1, E.smooth));
  return poly([...intoRow(ENTRANCE, y), { x: SV.handlerX, y }], prog(f, t1, CUE.breachHit, E.contact));
};

/** The request with a token: through the gate on gatePass, into row 2's handler on handler2. */
export const tokenDotAt = (f: number): P | null => {
  if (f < CUE.tokenDot) return null;
  if (f < CUE.gatePass) return poly([BROWSER_EXIT, GATE], prog(f, CUE.tokenDot, CUE.gatePass, E.smooth));
  const y = SV.rowY(CHAIN_ROW, 0);
  return poly([...intoRow(GATE, y), { x: SV.handlerX, y }], prog(f, CUE.gatePass, CUE.handler2, E.contact));
};

/** The request without a token: into the gate's face on bounce, then back and down. */
export const BOUNCE_X = GATE.x - D.box.w / 2 - D.dot / 2;
export const noTokenDotAt = (f: number): { p: P; squash: number; opacity: number } | null => {
  if (f < CUE.noTokenDot) return null;
  if (f < CUE.bounce) return { p: poly([BROWSER_EXIT, { x: BOUNCE_X, y: 0 }], prog(f, CUE.noTokenDot, CUE.bounce, E.contact)), squash: 0, opacity: 1 };
  const t = f - CUE.bounce;
  const x = BOUNCE_X - 70 * (1 - Math.exp(-t / 8));
  const y = -36 * Math.sin(Math.min(1, t / 18) * Math.PI) + 0.5 * Math.max(0, t - 10) ** 2 * 0.9;
  const opacity = 1 - prog(f, CUE.bounce + f60(14), CUE.bounce + f60(30), E.smooth);
  return opacity <= 0 ? null : { p: { x, y: Math.min(y, 170) }, squash: Math.max(0, 1 - t / 4), opacity };
};

/** The chain: box by box on chain1..chain4, then into row 2's handler on chainLand. */
export const chainDotAt = (f: number): P | null => {
  if (f < CUE.chainDot) return null;
  const bx = D.chainX.map((x) => ({ x, y: 0 }));
  if (f < CUE.chain1) return poly([BROWSER_EXIT, bx[0]], prog(f, CUE.chainDot, CUE.chain1, E.smooth));
  if (f < CUE.chain2) return poly([bx[0], bx[1]], prog(f, CUE.chain1, CUE.chain2, E.linear));
  if (f < CUE.chain3) return poly([bx[1], bx[2]], prog(f, CUE.chain2, CUE.chain3, E.linear));
  if (f < CUE.chain4) return poly([bx[2], bx[3]], prog(f, CUE.chain3, CUE.chain4, E.linear));
  const y = SV.rowY(CHAIN_ROW, 0);
  return poly([bx[3], ...intoRow(ENTRANCE, y), { x: SV.handlerX, y }], prog(f, CUE.chain4, CUE.chainLand, E.contact));
};

/** Lock i lifts off its row from this frame (the rows nearest the open row go first), a 36 f flight. */
export const LIFT_DUR = f60(36);
export const liftStart = (i: number) => CUE.locksLift + Math.min(Math.abs(i - D.openRow), 18);
export const liftP = (i: number, f: number) => prog(f, liftStart(i), liftStart(i) + LIFT_DUR, E.inOut);
/** Where lock i starts its flight: its row at that moment, clamped into the viewport so hidden rows stream out of the box's edges. */
export const liftFrom = (i: number): P => {
  const y = SV.rowY(i, scrollAt(liftStart(i)));
  return { x: SV.lockX, y: clamp(y, SV.top + 14, SV.bottom - 14) };
};

/** Where each box sits: its crowd spot until lineUp, then its place in the chain (log, parse, auth, rate limit). */
export const BOX_ORDER = { log: 0, parse: 1, auth: 2, rate: 3 } as const;
export const CROWD_INDEX = { auth: 0, log: 1, parse: 2, rate: 3 } as const;
export const boxAt = (name: keyof typeof BOX_ORDER, f: number): P => {
  const c = D.crowd[CROWD_INDEX[name]];
  const k = BOX_ORDER[name];
  const p = prog(f, CUE.lineUp + f60(4) * k, CUE.lineUpDone - f60(12) + f60(4) * k, E.inOut);
  return { x: mix(c.x, D.chainX[k], p), y: mix(c.y, 0, p) };
};
