// Where everything sits, per frame size. One canvas: the rederive bubble above the drawing, the
// composer below it, the drawing in the middle. Node-safe (no React) so src/sync.ts can import it.
import { safeBox } from '../lib/safe';

export type Layout = ReturnType<typeof layoutFor>;

export const layoutFor = (W: number, H: number) => {
  const u = Math.min(W, H) / 1080;
  const tall = H > W;
  const square = H === W;
  const box = safeBox(undefined, W, H); // the clear band: feed zones excluded in 9:16
  const top = box.y;
  const bottom = box.y + box.h;
  const k = tall ? 0.95 : square ? 0.82 : 1.22; // the drawing's scale
  const sx = tall ? 0.8 : 1; // how far apart the phones sit, horizontally (tight in 9:16)
  const bubbleW = Math.min(1100 * u, W - 2 * box.x);
  return {
    u,
    W,
    H,
    tall,
    header: { x: box.x, y: top + (tall ? 0 : -8 * u), h: 44 * u },
    // the rederive bubble: avatar centre and the bubble's left edge
    assistant: { ax: (W - bubbleW) / 2 + 24 * u, ay: top + (tall ? 190 : 150) * u, bx: (W - bubbleW) / 2 + 72 * u, maxW: bubbleW - 72 * u },
    // the drawing: centre, scale, and the server's rest offset above the phone line
    diagram: { cx: W / 2, cy: tall ? H * 0.5 + 10 * u : H * 0.585, k, sx, serverY: -215, serverFar: -265 },
    // the composer: left edge, vertical centre, width
    composer: { x: (W - bubbleW) / 2, y: bottom - (tall ? 130 : 110) * u, w: bubbleW },
    // where a sent line docks: its right edge and centre
    sent: { right: (W + bubbleW) / 2, y: bottom - (tall ? 130 : 110) * u },
    // the four next-problem chips, around the drawing (world offsets from the diagram centre, in drawing units)
    chips: tall
      ? [
          { x: -215, y: -400 },
          { x: 215, y: -400 },
          { x: -215, y: 330 },
          { x: 215, y: 330 },
        ]
      : [
          { x: -600, y: -310 },
          { x: 600, y: -310 },
          { x: -600, y: 300 },
          { x: 600, y: 300 },
        ],
    // the end card
    end: { markSize: (tall ? 150 : 180) * u, cy: H / 2 - (tall ? 60 : 50) * u },
  };
};

// The drawing's own geometry, in drawing units (scaled by diagram.k, centred on diagram.cx/cy).
export const D = {
  phoneA: { x: -540, y: 0 },
  routerA: { x: -270, y: 0 },
  routerB: { x: 270, y: 0 },
  phoneB: { x: 540, y: 0 },
  phoneW: 150,
  phoneH: 270,
  routerW: 140,
  routerH: 78,
  serverW: 200,
  serverH: 116,
  packet: 18,
};
