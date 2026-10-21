// Where everything sits at 1920x1080. One canvas: the rederive bubble above the drawing, the
// composer below it, the drawing in the middle. Node-safe (no React) so src/sync.ts can import it.
import { safeBox } from '../lib/safe';

export type Layout = ReturnType<typeof layoutFor>;

export const layoutFor = (W: number, H: number) => {
  const u = Math.min(W, H) / 1080;
  const box = safeBox(undefined, W, H);
  const top = box.y;
  const bottom = box.y + box.h;
  const k = 1.22; // the drawing's scale (drawing units -> px at 1080p)
  const bubbleW = Math.min(1100 * u, W - 2 * box.x);
  return {
    u,
    W,
    H,
    tall: false,
    header: { x: box.x, y: top, h: 44 * u, w: 330 * u },
    // the rederive bubble: avatar centre and the bubble's left edge
    assistant: { ax: (W - bubbleW) / 2 + 24 * u, ay: top + 150 * u, bx: (W - bubbleW) / 2 + 72 * u, maxW: bubbleW - 72 * u },
    // the drawing: centre and scale
    diagram: { cx: W / 2, cy: H * 0.585, k },
    // the composer: left edge, vertical centre, width
    composer: { x: (W - bubbleW) / 2, y: bottom - 110 * u, w: bubbleW },
    // the proposition: the mark and the line beneath it
    intro: { markY: H * 0.33, markSize: 170 * u, lineY: H * 0.33 + 170 * u },
    // the repo card
    card: { w: 820 * u, h: 176 * u, cx: W / 2, cy: H * 0.5 },
    // the end card
    end: { markSize: 180 * u, cy: H / 2 - 80 * u },
  };
};

// The drawing's own geometry, in drawing units (scaled by diagram.k, centred on diagram.cx/cy).
export const D = {
  browser: { x: -600, w: 280, h: 190 },
  server: { x: 330, w: 520, h: 380, pad: 24, head: 32 }, // head: the strip with the counter
  row: { h: 44, pitch: 56 }, // rows inside the server, 56 units apart
  rowsVisible: 5,
  routes: 40,
  openRow: 22, // GET /admin/users: the one row without a lock
  box: { w: 118, h: 56 },
  chainX: [-390, -258, -126, 6], // log, parse, auth, rate limit centres once lined up
  crowd: [
    { x: 70, y: 0 }, // auth: the gate's own spot, straddling the entrance
    { x: 34, y: -30 }, // log
    { x: 104, y: 24 }, // parse
    { x: 60, y: -4 }, // rate limit
  ],
  dot: 18,
};

/** The server's inner geometry: the entrance, the rows' viewport and where a row's parts sit. */
export const SV = (() => {
  const { x, w, h, pad, head } = D.server;
  const left = x - w / 2;
  const right = x + w / 2;
  const top = -h / 2 + pad + head; // the viewport's top (below the counter strip)
  const bottom = h / 2 - pad;
  const row0 = top + D.row.h / 2 + 4; // row 0's centre, unscrolled
  return {
    left,
    right,
    top,
    bottom,
    entrance: { x: left, y: 0 },
    rowLeft: left + pad,
    rowRight: right - pad,
    row0,
    lockX: left + pad + 22,
    handlerX: right - pad - 22,
    rowY: (i: number, scroll: number) => row0 + D.row.pitch * i - scroll,
    /** the scroll that centres row i in the viewport */
    centreScroll: (i: number) => row0 + D.row.pitch * i - (top + bottom) / 2,
  };
})();
