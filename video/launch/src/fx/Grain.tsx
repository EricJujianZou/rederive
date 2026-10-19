import React from 'react';
import { staticFile } from 'remotion';
import { fd, rand } from '../lib/anim';

/**
 * tx-global-grain: a fine, even grain over the whole film at one strength. Eight seeded noise
 * tiles (public/grain/tileN.png, sigma ~90 levels, baked offline so nothing is drawn with
 * Math.random or an animated feTurbulence) cycle two frames apart, each shown at a different
 * repeat offset so the 512 px tile never reads as a repeat. At 0.018 opacity on a normal blend
 * this reads as about a 1.5-2 code-level texture: it breaks the flat ink/panel fields' banding
 * and keeps every frame of the film genuinely different from its neighbour (no two-frame hold
 * reads as a frozen player), without the frame ever looking "grainy".
 */
export const Grain: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 0.018 }) => {
  const i = Math.floor(fd(frame) / 2) % 8;
  const ox = Math.floor(rand(`grain-x-${i}`) * 512);
  const oy = Math.floor(rand(`grain-y-${i}`) * 512);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        pointerEvents: 'none',
        mixBlendMode: 'normal',
        backgroundImage: `url(${staticFile(`grain/tile${i}.png`)})`,
        backgroundRepeat: 'repeat',
        backgroundPosition: `${-ox}px ${-oy}px`,
        backgroundSize: '512px 512px',
      }}
    />
  );
};
