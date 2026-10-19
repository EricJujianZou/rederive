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
