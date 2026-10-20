import React from 'react';
import { useVideoConfig } from 'remotion';
import { C, U } from '../brand/tokens';
import { clamp, E, Ease, lmix, prog } from '../lib/anim';
import { f60 } from '../timeline';

/** Distance from (x, y) to the farthest corner of a w x h frame. */
export const farCorner = (x: number, y: number, w: number, h: number) => Math.hypot(Math.max(x, w - x), Math.max(y, h - y));

/**
 * Radius of an iris at `frame`: from r0 to r1 in log space (equal ratios per frame), on `ease`.
 * In linear px an E.out flood leaps to half the frame on its first frame and a linear one crawls
 * and then snaps; in log space it opens from the point and decelerates as it fills.
 */
export const irisRadius = (frame: number, start: number, dur: number, r0: number, r1: number, ease: Ease) =>
  lmix(Math.max(0.01, r0), Math.max(0.01, r1), prog(frame, start, start + dur, ease));

/**
 * Iris: reveals `children` (or floods `color`, a one-time accent flood) through a circle growing
 * from a point (a glyph, a button) to the frame's far corner, radius eased in log space. `close`
 * runs it backwards: the circle shrinks onto the point and hides what was inside. Defaults at
 * 60 fps: 24 f, E.out (opening) or E.in (closing) in log space, from 1 px to the far corner + 2 px
 * (more if needed to clear it on the last clipped frame), so the edge leaves the frame cleanly.
 * Start it at `cue - 1` so the circle is already opening on the hit frame. Before an opening iris
 * starts nothing is drawn; once it ends the clip is removed (no anti-aliased edge left on screen).
 * `ring` adds a thin ring (2 px at 1080p, never under 1.5 px) that runs ahead of the edge on a
 * shorter clock and fades out: the residue of the burst. The clip is a clip-path circle on one
 * full-frame layer, placed in frame px; never put will-change on it.
 */
export const Iris: React.FC<{
  frame: number; // local frame
  start: number;
  x: number; // origin, frame px
  y: number;
  dur?: number;
  ease?: Ease;
  close?: boolean;
  r0?: number;
  color?: string; // flood colour (a hex token); omit to reveal children
  children?: React.ReactNode;
  ring?: boolean;
  ringColor?: string;
  ringWidth?: number;
  style?: React.CSSProperties;
}> = ({ frame, start, x, y, dur = f60(24), ease, close = false, r0 = 1, color, children, ring = false, ringColor = C.accent, ringWidth = Math.max(1.5, 2 * U), style }) => {
  const { width, height } = useVideoConfig();
  const far = farCorner(x, y, width, height);
  // An opening circle must already cover the corners on its last clipped frame (start + dur - 1),
  // or they pop in when the clip comes off: far + 2 is short there for an iris of <= 9 frames.
  const e1 = (ease ?? E.out)(clamp((dur - 1) / dur));
  const R = close || e1 <= 0 ? far + 2 : Math.max(far + 2, Math.exp((Math.log(far + 2) - (1 - e1) * Math.log(Math.max(0.01, r0))) / e1));
  const t = prog(frame, start, start + dur, E.linear);
  const content = color !== undefined ? <div style={{ position: 'absolute', inset: 0, background: color }} /> : children;
  const layer = (clip?: string) => <div style={{ position: 'absolute', inset: 0, clipPath: clip, ...style }}>{content}</div>;
  if (close ? t >= 1 : frame < start) return null;
  if (!close && t >= 1) return layer();
  if (close && frame < start) return layer();
  const r = close ? irisRadius(frame, start, dur, R, r0, ease ?? E.in) : irisRadius(frame, start, dur, r0, R, ease ?? E.out);
  // The ring runs the same curve in 75% of the time, so it stays ahead of the edge, fading as it goes.
  const ringR = irisRadius(frame, start, dur * 0.75, r0, R, ease ?? E.out);
  const ringO = 1 - prog(frame, start + dur * 0.1, start + dur * 0.75, E.smooth);
  return (
    <>
      {layer(`circle(${r.toFixed(3)}px at ${x.toFixed(3)}px ${y.toFixed(3)}px)`)}
      {ring && !close && ringO > 0.001 && (
        <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <circle cx={x} cy={y} r={Math.max(0, ringR)} fill="none" stroke={ringColor} strokeWidth={ringWidth} opacity={ringO} />
        </svg>
      )}
    </>
  );
};
