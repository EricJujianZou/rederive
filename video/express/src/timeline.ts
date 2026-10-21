// The single source of truth for time. Picture (src/acts), sound (src/sync.ts -> out/cues.json)
// and QA (scripts/grid-check.ts) all import this file, so a change here moves everything together.
// Think in bars and beats, never in seconds. Keep this file free of React and CSS imports.

export const FPS = 60;
export const BPM = 120;
export const W = 1920;
export const H = 1080;

export const BEAT = (60 / BPM) * FPS; // 30 f
export const BAR = BEAT * 4; // 120 f
export const b = (bar: number, beat = 0, sub = 0) => Math.round(((bar - 1) * 4 + beat) * BEAT + sub * (BEAT / 4));
export const f60 = (frames: number) => Math.round((frames * FPS) / 60);

/** After the last bar the picture holds while the audio decays to digital silence. */
export const TAIL = FPS;

// Acts. The session is one continuous take (no cut until the iris), split at bar lines so each
// part can be iterated alone; all three render the same Session component on the absolute frame.
export const ACT = {
  propose: { from: b(1), dur: b(8) - b(1) }, // the proposition, the repo, problem 1, the locks, the breach
  resolve: { from: b(8), dur: b(18) - b(8) }, // the gate, the crowd, the chain, the payoff, the hold
  lockup: { from: b(18), dur: b(19, 2) + TAIL - b(18) }, // the iris from the avatar, the end card
};

export const TOTAL = b(19, 2) + TAIL;

// Named sync points (absolute frames), all on the 16th grid.
export const CUE = {
  // bar 1: the proposition. Frame 0 already moves: the mark is drawing itself.
  markIn: b(1), // the ∂ outline draws, then fills
  introIn: b(1, 0, 2), // the product line streams beneath it
  introHalf: b(1, 1, 2), // the mark fills; the line's middle word lands
  introResolved: b(1, 2, 2),
  composerIn: b(1, 2), // the composer rises from the bottom
  typeCmd: b(1, 3, 2), // the user types the command
  cmdHalf: b(2, 0, 2),
  cmdDone: b(2, 2),
  // bar 2: the example is named
  sendCmd: b(2, 2, 2), // the send press
  introOut: b(2, 2), // the mark and the line clear before the card falls
  cardLand: b(2, 3), // the repo card's spring makes contact
  drawIn: b(3, 1), // the browser and the server set off from the frame edges as the card leaves
  // bar 3: the drawing and the first problem
  composerOut: b(3, 0), // the sent command leaves
  drawLand: b(3, 1, 2), // the browser and the server settle
  routesIn: b(3, 1, 2), // the five route rows outline and fill, 6 f apart
  cardShrink: b(3, 1), // the card flies into the header pill as the drawing arrives
  labelsIn: b(3, 2), // "browser" and "server" fade in under the drawing
  headerIn: b(3, 2), // the pill reads "rederive · express"
  label1: b(3, 2, 2), // the step line pops: Problem 1 of 3
  ring1: b(3, 2, 2), // the thinking ring spins beside the avatar
  problemIn: b(4, 0),
  dotWait: b(4, 0, 2), // a request leaves the browser ...
  problemHalf: b(4, 1, 2),
  problemResolved: b(4, 3),
  dotWaiting: b(4, 3), // ... and waits at the server's edge
  // bar 5: the first answer
  type1: b(5, 0),
  type1Half: b(5, 1),
  type1Done: b(5, 2, 2),
  send1: b(5, 3), // the design appears: a lock on each row
  locksIn: b(5, 3), // five locks, 6 f apart
  dotEnter: b(6, 0), // the waiting request goes in
  // bar 6: the lock works, then the list is longer than it looked
  lockPass: b(6, 1), // it meets a lock and passes
  handler1: b(6, 1, 2), // it reaches its handler
  scrollStart: b(6, 2, 2), // the list scrolls through forty rows; the counter reels
  scrollMid: b(6, 3, 2), // the scroll's fastest frames
  scrollEnd: b(7, 0, 2), // the unguarded row sits at the centre
  pushIn: b(7, 0, 2), // camera pushes 1.4x on it
  dot2: b(7, 1), // a second request leaves the browser ...
  breachHit: b(7, 2, 2), // ... and slips straight into the handler: the breach
  // bar 7-8: the first constraint
  label2: b(7, 3), // the step line rolls to 2
  ring2: b(7, 3),
  constraint1In: b(8, 0),
  constraint1Half: b(8, 1, 2),
  constraint1Resolved: b(8, 3),
  pullOut: b(8, 2, 2), // camera eases back
  type2: b(8, 3, 2),
  type2Early: b(9, 0, 2),
  type2Half: b(9, 1, 2),
  type2Late: b(9, 2, 2),
  type2Done: b(9, 3, 2),
  // bar 10: the gate
  send2: b(10, 0),
  locksLift: b(10, 0), // the forty locks leave their rows ...
  locksMid: b(10, 1), // ... stream across ...
  gateLand: b(10, 2), // ... and become one gate at the entrance
  tokenDot: b(10, 2, 2), // a request with a token leaves the browser
  gatePass: b(10, 3, 2), // it passes the gate
  noTokenDot: b(11, 0), // a request without a token leaves the browser
  handler2: b(11, 0, 2), // the first one reaches its route
  bounce: b(11, 1, 2), // the second one bounces off the gate
  // bar 11-12: the crowd and the second constraint
  logIn: b(11, 2), // log drops onto the gate's spot
  parseIn: b(11, 2, 2), // parse lands on top
  rateIn: b(11, 3), // rate limit lands on top of that
  label3: b(11, 3, 2), // the step line rolls to 3
  ring3: b(11, 3, 2),
  constraint2In: b(12, 0, 2),
  constraint2Half: b(12, 2),
  constraint2Late: b(12, 3, 2),
  constraint2Resolved: b(13, 0),
  // bar 13-14: the third answer
  type3: b(13, 1),
  type3Word: b(13, 2),
  type3Pause: b(13, 3), // the one human pause inside the longer line
  type3Resume: b(13, 3, 2),
  type3Late: b(14, 0, 2),
  type3Done: b(14, 1, 2),
  send3: b(14, 2),
  lineUp: b(14, 2), // the boxes spread into a row
  lineUpMid: b(14, 3),
  lineUpDone: b(15, 0), // the row settles: log, parse, auth, rate limit, then the server
  // bar 15-16: the chain
  chainDot: b(15, 0), // a request leaves the browser
  chainDotMid: b(15, 1),
  pushIn2: b(15, 2), // camera pushes 1.3x on the chain
  chain1: b(15, 2), // it steps through log ...
  chain2: b(15, 2, 2), // ... parse ...
  chain3: b(15, 3), // ... auth ...
  chain4: b(15, 3, 2), // ... rate limit ...
  chainLand: b(16, 0), // ... and lands in its handler: the kick, everything turns green
  sweep: b(16, 0, 2), // the specular sweep along the chain
  mwIn: b(16, 1, 2), // giant "middleware" punches in
  mwSwap: b(16, 2, 2), // it blur-swaps into the payoff line
  payoffResolved: b(17, 0),
  pullOut2: b(17, 1, 2), // the camera eases back under the held line
  // bar 17.5 -> end: the lockup
  dimOut: b(17, 2, 2), // the drawing relaxes to mute: the eye goes to the avatar
  seed: b(17, 3), // the iris seed appears on the avatar
  iris: b(18, 0), // the iris opens (20 f); the music stops on this bar line
  markLand: b(18, 1), // the mark reaches its lockup size
  nameLock: b(18, 1, 2), // the wordmark locks beside it
  tagline: b(18, 2),
  url: b(18, 3),
  settle: b(19, 0, 2), // the push settles
  end: b(19, 2),
};

/** The one designed near-still hold: the payoff line under the music's breakdown, the camera easing back beneath it. */
export const HOLD = { from: CUE.payoffResolved, to: CUE.pullOut2 };

export type Copy = {
  id: string;
  text: string;
  in: number;
  resolved: number;
  out: number;
  kind?: 'copy' | 'ui';
};

const routeIn = (i: number) => CUE.routesIn + f60(6) * i;

export const COPY: Copy[] = [
  { id: 'intro', text: 'Learn any codebase by re-designing it\nyourself from first principles.', in: CUE.introIn, resolved: CUE.introResolved, out: CUE.introOut },
  { id: 'cmd', text: '/rederive express', in: CUE.typeCmd, resolved: CUE.cmdDone, out: CUE.composerOut, kind: 'ui' },
  { id: 'repoName', text: 'expressjs/express', in: CUE.cardLand - f60(6), resolved: CUE.cardLand, out: CUE.cardShrink, kind: 'ui' },
  { id: 'repoDesc', text: 'fast, unopinionated web framework for Node.js', in: CUE.cardLand - f60(6), resolved: CUE.cardLand, out: CUE.cardShrink, kind: 'ui' },
  { id: 'repoLang', text: 'JavaScript', in: CUE.cardLand - f60(6), resolved: CUE.cardLand, out: CUE.cardShrink, kind: 'ui' },
  { id: 'header', text: 'rederive · express', in: CUE.headerIn, resolved: CUE.headerIn, out: CUE.iris, kind: 'ui' },
  { id: 'route0', text: 'GET /users', in: routeIn(0), resolved: routeIn(0) + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'route1', text: 'POST /login', in: routeIn(1), resolved: routeIn(1) + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'route2', text: 'GET /orders', in: routeIn(2), resolved: routeIn(2) + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'route3', text: 'PUT /cart', in: routeIn(3), resolved: routeIn(3) + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'route4', text: 'GET /me', in: routeIn(4), resolved: routeIn(4) + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'labelBrowser', text: 'browser', in: CUE.labelsIn, resolved: CUE.labelsIn + f60(14), out: CUE.iris, kind: 'ui' },
  { id: 'labelServer', text: 'server', in: CUE.labelsIn, resolved: CUE.labelsIn + f60(14), out: CUE.iris, kind: 'ui' },
  { id: 'step1', text: 'Problem 1 of 3', in: CUE.label1, resolved: CUE.label1 + f60(8), out: CUE.ring2 - f60(6), kind: 'ui' },
  { id: 'problem', text: 'Every request must prove the user is logged in before its route runs. Where does that check live?', in: CUE.problemIn, resolved: CUE.problemResolved, out: CUE.ring2 - f60(6), kind: 'ui' },
  { id: 'answer1', text: 'At the top of each route handler.', in: CUE.type1, resolved: CUE.type1Done, out: CUE.type2 - f60(32), kind: 'ui' },
  { id: 'counter', text: '40 routes', in: CUE.scrollStart, resolved: CUE.scrollEnd, out: CUE.iris, kind: 'ui' },
  { id: 'routeOpen', text: 'GET /admin/users', in: CUE.scrollStart, resolved: CUE.scrollEnd, out: CUE.iris, kind: 'ui' },
  { id: 'step2', text: 'Problem 2 of 3', in: CUE.label2, resolved: CUE.label2 + f60(8), out: CUE.ring3 - f60(6), kind: 'ui' },
  { id: 'constraint1', text: "But here's the problem: there are forty routes. Miss one, and that route is open to everyone.", in: CUE.constraint1In, resolved: CUE.constraint1Resolved, out: CUE.ring3 - f60(6), kind: 'ui' },
  { id: 'answer2', text: 'One function every request passes through before any route.', in: CUE.type2, resolved: CUE.type2Done, out: CUE.type3 - f60(32), kind: 'ui' },
  { id: 'gate', text: 'auth', in: CUE.gateLand - f60(10), resolved: CUE.gateLand, out: CUE.iris, kind: 'ui' },
  { id: 'boxLog', text: 'log', in: CUE.logIn - f60(10), resolved: CUE.logIn, out: CUE.iris, kind: 'ui' },
  { id: 'boxParse', text: 'parse', in: CUE.parseIn - f60(10), resolved: CUE.parseIn, out: CUE.iris, kind: 'ui' },
  { id: 'boxRate', text: 'rate limit', in: CUE.rateIn - f60(10), resolved: CUE.rateIn, out: CUE.iris, kind: 'ui' },
  { id: 'step3', text: 'Problem 3 of 3', in: CUE.label3, resolved: CUE.label3 + f60(8), out: CUE.mwIn - f60(10), kind: 'ui' },
  { id: 'constraint2', text: 'That could work, but consider this new problem: logging, body parsing and rate limits each need that same spot.', in: CUE.constraint2In, resolved: CUE.constraint2Resolved, out: CUE.mwIn - f60(10), kind: 'ui' },
  { id: 'answer3', text: 'Make it a list. Each function does its job, then calls the next.', in: CUE.type3, resolved: CUE.type3Done, out: CUE.mwIn - f60(6), kind: 'ui' },
  { id: 'payoff', text: 'You successfully rederived the middleware chain. Express does exactly this.', in: CUE.mwSwap, resolved: CUE.payoffResolved, out: CUE.iris, kind: 'ui' },
  { id: 'wordmark', text: 'rederive', in: CUE.markLand, resolved: CUE.nameLock, out: TOTAL },
  { id: 'tagline', text: 'Learn any codebase\nby re-designing it yourself\nfrom first principles.', in: CUE.tagline, resolved: CUE.tagline + f60(54), out: TOTAL },
  { id: 'url', text: 'github.com/EricJujianZou/rederive', in: CUE.url, resolved: CUE.url + f60(20), out: TOTAL, kind: 'ui' },
];

export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};
