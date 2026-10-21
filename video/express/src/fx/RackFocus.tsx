import React from 'react';
import { useVideoConfig } from 'remotion';

/**
 * Rack focus without Chromium's stepped blur ramp. Animating filter: blur() on a large layer jumps
 * from sharp to soft in visible steps, so this renders the layer twice - sharp, and at a constant
 * blur - and cross-fades them (an optional middle copy at ~0.35x the radius hides the double
 * image mid-rack). Copies are overscanned so the blur never pulls in transparent edge pixels.
 * Never put will-change on these layers: promotion plus a blur causes stale ghost frames.
 */
export const RackFocus: React.FC<{
  t: number; // 0 = sharp, 1 = fully defocused
  blur: number; // px at t = 1; 10-12 reads as "background"
  mid?: boolean; // add the 0.35x copy for slow racks
  overscan?: number;
  render: () => React.ReactNode; // content in frame coordinates
  style?: React.CSSProperties;
}> = ({ t, blur, mid = false, overscan = 80, render, style }) => {
  const { width, height } = useVideoConfig();
  const box: React.CSSProperties = { position: 'absolute', left: -overscan, top: -overscan, width: width + overscan * 2, height: height + overscan * 2, overflow: 'hidden' };
  const inner: React.CSSProperties = { position: 'absolute', left: overscan, top: overscan, width, height };
  const tc = Math.min(1, Math.max(0, t));
  const layer = (px: number, opacity: number) => (
    <div style={{ ...box, filter: px > 0 ? `blur(${px}px)` : undefined, opacity }}>
      <div style={inner}>{render()}</div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, ...style }}>
      {tc < 0.999 && layer(0, 1)}
      {mid && tc > 0.001 && tc < 0.999 && layer(blur * 0.35, Math.sin(Math.PI * tc))}
      {tc > 0.001 && layer(blur, Math.min(1, tc * 1.8))}
    </div>
  );
};
