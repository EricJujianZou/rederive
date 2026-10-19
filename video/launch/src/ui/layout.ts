// Fixed layout for the one chat container the whole film shares (TREATMENT.md §3: "one chat
// container runs the whole film"). Every row is a known constant, not a scroll: five messages fit
// inside the session panel without needing one, so each row's screen position is computed once,
// here, rather than measured at render time. Node-safe (no React), so acts and src/sync.ts can
// both import it.
import { H, W } from '../timeline';

export const SESSION = {
  w: 1440,
  h: 560,
  get x() {
    return (W - this.w) / 2;
  },
  get y() {
    return (H - this.h) / 2;
  },
  radius: 20,
  headerH: 64,
  pad: 32,
  rowH: 64,
  rowGap: 28,
  avatar: 40,
};

export const INTERVIEW = {
  w: 1200,
  h: 284,
  get x() {
    return (W - this.w) / 2;
  },
  get y() {
    return (H - this.h) / 2;
  },
  radius: 20,
  headerH: 64,
  pad: 32,
  rowH: 64,
  rowGap: 28,
  avatar: 40,
};

/** Row index of each message in the session panel's fixed, never-scrolling stack. */
export const ROW = { problem: 0, naive: 1, constraint: 2, better: 3, payoff: 4 } as const;
export type RowId = keyof typeof ROW;

/** Top of row i (world px, panel at its own x/y - callers translate if the panel has moved). */
export const rowTop = (i: number) => SESSION.y + SESSION.headerH + SESSION.pad + i * (SESSION.rowH + SESSION.rowGap);
export const rowCenterY = (i: number) => rowTop(i) + SESSION.rowH / 2;

/** The avatar's world-space centre for a given row, at the panel's static (un-shrunk) position. */
export const avatarCenter = (row: RowId) => ({
  x: SESSION.x + SESSION.pad + SESSION.avatar / 2,
  y: rowCenterY(ROW[row]),
});

/** Left edge every bubble (and the avatar column) shares. */
export const bubbleLeft = (panelX = SESSION.x) => panelX + SESSION.pad + SESSION.avatar + 16;

// The interview card (Acts 1-2): row 0 the interviewer's line, row 1 the candidate's empty reply.
export const interviewRowCenterY = (i: number) => INTERVIEW.y + INTERVIEW.headerH + INTERVIEW.pad + i * (INTERVIEW.rowH + INTERVIEW.rowGap) + INTERVIEW.rowH / 2;
export const interviewAvatarCenter = () => ({ x: INTERVIEW.x + INTERVIEW.pad + INTERVIEW.avatar / 2, y: interviewRowCenterY(0) });
export const interviewBubbleLeft = () => INTERVIEW.x + INTERVIEW.pad + INTERVIEW.avatar + 16;
export const interviewBubbleRight = () => INTERVIEW.x + INTERVIEW.w - INTERVIEW.pad;

// --- Responsive layout (cinetic formats.md §7): "let layout constants switch on the frame size" --
// The static SESSION/INTERVIEW/ROW/* exports above stay exactly as they are (1920x1080 geometry):
// src/sync.ts reads them for stereo panning in the one shared soundtrack, and the 16:9 Film
// composition's acts use them unchanged, so the master's render and its forensics baseline do not
// move. Film9x16 and Film1x1 call layoutFor(width, height) instead (from useVideoConfig()), which
// returns the same shape, scaled and re-centred for the format's own safe band, plus a `u` text
// scale (cinetic copy-and-type.md §7: UI type runs ~1.3-1.5x on 9:16, ~1.15x on 1:1, for a frame
// watched full-screen close up) and a `panelScale` that shrinks the chat card to fit the narrower
// safe width instead of bleeding past it.
export type Fmt = 'wide' | 'square' | 'vertical';
export const fmtOf = (w: number, h: number): Fmt => {
  const r = w / h;
  if (Math.abs(r - 1) < 0.05) return 'square';
  return r < 1 ? 'vertical' : 'wide';
};

// The chat panel's own row width (pad + avatar + gap + a 1040 px-wide bubble ceiling) is built for
// a 1920 px frame; cinetic's own preference is bigger UI type on a narrower frame (1.3-1.5x), but
// that is a second, independent scale only if the bubble's own box width tracks it too, and this
// panel's box width and its text size are the same fixed ratio throughout (Bubble/TypedBubble's
// maxWidth is `1040 * u`) - so here, for this unchanged copy, text scale and panel scale are the
// same number: a bigger u without a bigger box reproduces the exact right-edge clip two critique
// rounds already fixed once in the 16:9 master. 0.72 is the largest panel that still fits inside a
// 1080 px-wide frame; true per-format legibility (32 px UI, cinetic's 9:16 target) would need this
// panel's own row layout redesigned narrower, not just rescaled, which is out of scope here.
const PANEL_SCALE: Record<Fmt, number> = { wide: 1, square: 0.72, vertical: 0.72 };
export const U_SCALE: Record<Fmt, number> = { wide: 1, square: 0.72, vertical: 0.72 };

export type Panel = { w: number; h: number; x: number; y: number; radius: number; headerH: number; pad: number; rowH: number; rowGap: number; avatar: number };
export type Layout = {
  fmt: Fmt;
  w: number;
  h: number;
  u: number;
  SESSION: Panel;
  INTERVIEW: Panel;
  rowTop: (i: number) => number;
  rowCenterY: (i: number) => number;
  avatarCenter: (row: RowId) => { x: number; y: number };
  bubbleLeft: (panelX?: number) => number;
  interviewRowCenterY: (i: number) => number;
  interviewAvatarCenter: () => { x: number; y: number };
  interviewBubbleLeft: () => number;
  interviewBubbleRight: () => number;
  bubbleRight: () => number;
};

/** Safe-area right inset per format (lib/safe.ts's own presets), plus a small margin. */
const SAFE_RIGHT: Record<Fmt, number> = { wide: 96, square: 64, vertical: 120 };

/** Returns the SESSION/INTERVIEW geometry (and its row helpers) for an arbitrary w x h frame. At
 * 1920x1080 ('wide') every number matches the static exports above exactly. */
export const layoutFor = (w: number, h: number): Layout => {
  const fmt = fmtOf(w, h);
  const s = PANEL_SCALE[fmt];
  const u = U_SCALE[fmt];
  // 'vertical' stretches the row spacing and padding further (on top of the panel's own scale):
  // a 1080-wide frame caps every panel's width (and so, at one uniform scale, its height) well
  // short of the 1230 px-tall safe band, which otherwise left the frame's lower reaches bare ink
  // (formats.md §7's "no empty bottom 40%", measured true at first build: nothing below 77% of
  // the frame). Taller rows and gaps make the card genuinely taller without touching its width or
  // its text size (still panelScale, unrelated to this).
  // 4 keeps the whole stretched card (all 5 rows) inside the safe band's own top/bottom (270-1500)
  // when bottom-anchored there (below); a stronger stretch reaches further down but starts pushing
  // the card's own top, or its lowest row's text, past the band's edges instead, which is a safe-
  // margin violation on real text, not just bled decoration (verified: v ~ 1.8 bottom-anchored
  // further down than this pushed the payoff row's own text past y 1500).
  const vStretch = fmt === 'vertical' ? 4 : 1;
  const panel = (w0: number, h0: number): Omit<Panel, 'x' | 'y'> => ({
    w: w0 * s,
    h: h0 * s,
    radius: 20 * s,
    headerH: 64 * s * Math.sqrt(vStretch),
    pad: 32 * s * vStretch,
    rowH: 64 * s,
    rowGap: 28 * s * vStretch,
    avatar: 40 * s,
  });
  const sessionDims = panel(1440, 560);
  const interviewDims = panel(1200, 284);
  // `panel()`'s own w/h only cover the base shape; the stretched padding/gaps above change the
  // real content height, so derive it from the actual rows rather than the unstretched h0 * s.
  sessionDims.h = sessionDims.headerH + 2 * sessionDims.pad + 5 * sessionDims.rowH + 4 * sessionDims.rowGap;
  interviewDims.h = interviewDims.headerH + 2 * interviewDims.pad + 2 * interviewDims.rowH + 1 * interviewDims.rowGap;
  // Centre horizontally on the frame always. Vertically, 'wide' and 'square' centre on the frame;
  // 'vertical' anchors the panel's own bottom edge on the safe band's own bottom line (not past
  // it: the panel's last row is real text, not decoration, so it has to stay inside the band like
  // any other line) instead of centring it in the band.
  const bandBottom = h - 420;
  const SESSION: Panel = fmt === 'vertical' ? { ...sessionDims, x: (w - sessionDims.w) / 2, y: bandBottom - sessionDims.h } : { ...sessionDims, x: (w - sessionDims.w) / 2, y: h / 2 - sessionDims.h / 2 };
  const INTERVIEW: Panel = fmt === 'vertical' ? { ...interviewDims, x: (w - interviewDims.w) / 2, y: bandBottom - interviewDims.h } : { ...interviewDims, x: (w - interviewDims.w) / 2, y: h / 2 - interviewDims.h / 2 };

  const rowTopL = (i: number) => SESSION.y + SESSION.headerH + SESSION.pad + i * (SESSION.rowH + SESSION.rowGap);
  const rowCenterYL = (i: number) => rowTopL(i) + SESSION.rowH / 2;
  return {
    fmt,
    w,
    h,
    u,
    SESSION,
    INTERVIEW,
    rowTop: rowTopL,
    rowCenterY: rowCenterYL,
    avatarCenter: (row: RowId) => ({ x: SESSION.x + SESSION.pad + SESSION.avatar / 2, y: rowCenterYL(ROW[row]) }),
    bubbleLeft: (panelX = SESSION.x) => panelX + SESSION.pad + SESSION.avatar + 16 * s,
    interviewRowCenterY: (i: number) => INTERVIEW.y + INTERVIEW.headerH + INTERVIEW.pad + i * (INTERVIEW.rowH + INTERVIEW.rowGap) + INTERVIEW.rowH / 2,
    interviewAvatarCenter: () => ({ x: INTERVIEW.x + INTERVIEW.pad + INTERVIEW.avatar / 2, y: INTERVIEW.y + INTERVIEW.headerH + INTERVIEW.pad + INTERVIEW.rowH / 2 }),
    interviewBubbleLeft: () => INTERVIEW.x + INTERVIEW.pad + INTERVIEW.avatar + 16 * s,
    // Clamped to the format's own safe-right line (plus a small margin): at 'wide' this is always
    // the panel's own inset (240 px of clearance there, never the binding constraint); at 'square'
    // and 'vertical' the shrunk panel's own right edge sits close enough to the frame edge that an
    // unclamped right-aligned bubble ran past the safe margin (verified: feed9x16, f975-1200).
    interviewBubbleRight: () => Math.min(INTERVIEW.x + INTERVIEW.w - INTERVIEW.pad, w - SAFE_RIGHT[fmt] - 40),
    bubbleRight: () => Math.min(SESSION.x + SESSION.w - SESSION.pad, w - SAFE_RIGHT[fmt] - 40),
  };
};
