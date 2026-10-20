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

// Acts. The session is one continuous take (no cut until the iris), split in two at a bar line so
// each half can be iterated alone; both render the same Session component on the absolute frame.
export const ACT = {
  propose: { from: b(1), dur: b(6) - b(1) }, // problem, straight send dropped, relay lands
  resolve: { from: b(6), dur: b(13) - b(6) }, // detour, address swap, direct path, ICE, next problems
  lockup: { from: b(13), dur: b(15) + TAIL - b(13) }, // the iris from the avatar, the end card
};

export const TOTAL = b(15) + TAIL;

// Named sync points (absolute frames), all on the 16th grid.
export const CUE = {
  // bar 1: hook. Frame 0 already moves: the phones slide in, the header pill is there.
  phonesIn: b(1), // both phones set off from the frame edges
  phonesLand: b(1, 1), // they settle; the routers draw in front of them from here
  ring1: b(1, 1), // the thinking ring spins beside the avatar
  problemIn: b(1, 2), // the problem bubble starts typing
  labels: b(1, 3), // the phone and router labels fade in under the drawing
  wifi: b(2, 0), // the home-network arcs draw above each router
  problemResolved: b(2, 1), // fully readable
  // bar 2: the first answer
  type1: b(2, 1), // composer typing starts
  type1Half: b(2, 2), // the line's middle word lands (key blips cluster here)
  type1Late: b(2, 3, 2), // the last word
  type1Done: b(3, 0),
  send1: b(3, 1), // the send press: the diagram swaps state and draws the straight arrow
  arrow1Drawn: b(3, 2),
  // bar 3-4: the drop
  packets1: b(3, 2), // packets launch from phone A
  gateAOpen: b(3, 3), // router A opens for its own outbound packet (true to NAT, and it primes bar 10)
  dropHit: b(4, 0), // the first packet hits router B: the contact frame
  pushIn: b(4, 0), // camera pushes 1.4x on router B over the bar
  ring2: b(4, 1),
  constraint1In: b(4, 2),
  constraint1Half: b(4, 3),
  constraint1Resolved: b(5, 1),
  pullOut: b(5, 0), // camera eases back
  // bar 5: the second answer
  type2: b(5, 1),
  type2Half: b(5, 2),
  type2Late: b(5, 3, 2),
  type2Done: b(6, 0),
  send2: b(6, 1),
  serverLand: b(6, 2), // the server tile lands (landing 1 of 2)
  relayDrawn: b(6, 3),
  packets2: b(6, 3), // packets flow through the server
  // bar 7: the detour
  relayBeat: b(7, 0), // the first relayed packet reaches phone B
  detour: b(7, 1), // the "+80 ms" label grows on the lengthening path
  ring3: b(7, 1),
  constraint2In: b(7, 2),
  constraint2Half: b(7, 3),
  detourPulse: b(8, 0), // the detour label ticks once more as the next packet takes it
  constraint2Resolved: b(8, 1),
  // bar 8: the third answer
  type3: b(8, 1),
  type3Word: b(8, 2),
  type3Pause: b(8, 3), // the one human pause inside the longer line
  type3Resume: b(9, 0),
  type3Done: b(9, 1),
  send3: b(9, 2),
  chipsFly: b(9, 2), // address chips leave the server
  chipsLand: b(9, 3), // they land on the phones
  serverOut: b(10, 0), // the server fades: its job is done
  // bar 10: the direct path (the drop)
  bothSend: b(10, 0), // both phones send at once
  gatesOpen: b(10, 1), // the routers open as the outbound packets pass
  cross: b(10, 1, 2), // the packets cross at the centre
  directLand: b(10, 2), // the packets arrive (landing 2 of 2): the kick
  sweep: b(10, 3), // the specular sweep along the green line
  pushIn2: b(10, 2), // camera pushes 1.2x on the line
  // bar 11: the payoff
  iceIn: b(11, 0), // giant ICE punches in
  iceSwap: b(11, 1), // it blur-swaps into the bubble line
  payoffResolved: b(11, 2),
  pullOut2: b(12, 0),
  // bar 12: the promise. Four next problems around the diagram
  chip1: b(12, 0),
  chip2: b(12, 0, 2),
  chip3: b(12, 1),
  chip4: b(12, 1, 2),
  // bar 12.5 -> end: the lockup
  dimOut: b(12, 2, 2), // the diagram and chips relax to mute: the eye goes to the avatar
  seed: b(13, 0), // the iris seed appears on the avatar
  iris: b(13, 1), // the iris opens (20 f) and the music stops on this bar line
  markLand: b(13, 2), // the mark reaches its lockup size
  nameLock: b(13, 3), // the wordmark locks beside it
  creep: b(14, 0), // the end card's slow push starts
  tagline: b(13, 3, 2),
  url: b(14, 1, 2),
  settle: b(14, 3), // the push settles
  end: b(15),
};

/** The one designed near-still hold: the payoff line under the music's breakdown. */
export const HOLD = { from: CUE.payoffResolved, to: CUE.pullOut2 };

export type Copy = {
  id: string;
  text: string;
  in: number;
  resolved: number;
  out: number;
  kind?: 'copy' | 'ui';
};

export const COPY: Copy[] = [
  { id: 'header', text: 'rederive · linphone', in: 0, resolved: 0, out: CUE.iris, kind: 'ui' },
  { id: 'problem', text: 'Two phones on two home networks need to send voice to each other.', in: CUE.problemIn, resolved: CUE.problemResolved, out: CUE.send1, kind: 'ui' },
  { id: 'answer1', text: 'Send the packets straight to the other phone.', in: CUE.type1, resolved: CUE.type1Done, out: CUE.send2, kind: 'ui' },
  { id: 'constraint1', text: 'Its router drops packets from addresses it never contacted.', in: CUE.constraint1In, resolved: CUE.constraint1Resolved, out: CUE.send2, kind: 'ui' },
  { id: 'answer2', text: 'Relay every packet through a server.', in: CUE.type2, resolved: CUE.type2Done, out: CUE.send3, kind: 'ui' },
  { id: 'constraint2', text: 'That works, but every call now detours through your server.', in: CUE.constraint2In, resolved: CUE.constraint2Resolved, out: CUE.send3, kind: 'ui' },
  { id: 'detour', text: '+80 ms', in: CUE.detour, resolved: CUE.detour + f60(20), out: CUE.send3, kind: 'ui' },
  { id: 'answer3', text: 'Use the server only to swap addresses, then send direct.', in: CUE.type3, resolved: CUE.type3Done, out: CUE.iceIn, kind: 'ui' },
  { id: 'chipA', text: '203.0.113.9', in: CUE.chipsFly, resolved: CUE.chipsLand, out: CUE.iris, kind: 'ui' },
  { id: 'chipB', text: '198.51.100.4', in: CUE.chipsFly, resolved: CUE.chipsLand, out: CUE.iris, kind: 'ui' },
  { id: 'payoff', text: "That's ICE. Linphone does exactly this.", in: CUE.iceSwap, resolved: CUE.payoffResolved, out: CUE.iris, kind: 'ui' },
  { id: 'next1', text: 'Packets arrive out of order', in: CUE.chip1, resolved: CUE.chip1 + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'next2', text: 'Two codecs, pick one', in: CUE.chip2, resolved: CUE.chip2 + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'next3', text: 'Keys over an open line', in: CUE.chip3, resolved: CUE.chip3 + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'next4', text: 'Your own voice comes back', in: CUE.chip4, resolved: CUE.chip4 + f60(10), out: CUE.iris, kind: 'ui' },
  { id: 'wordmark', text: 'rederive', in: CUE.markLand, resolved: CUE.nameLock, out: TOTAL },
  { id: 'tagline', text: 'Learn any codebase\nby re-designing it yourself.', in: CUE.tagline, resolved: CUE.tagline + f60(24 + 4 * 7 + 22), out: TOTAL },
  { id: 'url', text: 'github.com/EricJujianZou/rederive', in: CUE.url, resolved: CUE.url + f60(20), out: TOTAL, kind: 'ui' },
];

export const copy = (id: string): Copy => {
  const c = COPY.find((x) => x.id === id);
  if (!c) throw new Error(`timeline: no COPY entry "${id}"`);
  return c;
};
