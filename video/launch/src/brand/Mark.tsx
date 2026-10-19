import React from 'react';
import { C } from './tokens';

// cinetic:brand-supplied mark stroke - rederive's mark is a partial-derivative glyph (∂, see
// assets/logo.png), cursive and italic-feeling by nature. That is the supplied brand, not an
// invented display style, so the hard ban on italic shapes does not apply to it (BRIEF.md). The
// path below is traced from the supplied PNG itself (OpenCV contour extraction on the real asset,
// Catmull-Rom smoothed, even-odd fill for the bowl's counter), not redrawn by eye, so the film's
// mark is pixel-true to the one in the README and on the Claude Code marketplace listing.
export const GLYPH = {
  d: 'M 36.18 0.34 C 34.02 0.11 30.66 0.06 28.33 0.34 C 26.00 0.63 24.40 0.00 22.18 2.05 C 19.97 4.10 15.76 10.64 15.02 12.63 C 14.28 14.62 15.36 14.62 17.75 13.99 C 20.14 13.37 26.45 9.73 29.35 8.87 C 32.25 8.02 32.99 8.36 35.15 8.87 C 37.32 9.39 40.33 10.52 42.32 11.95 C 44.31 13.37 45.79 15.24 47.10 17.41 C 48.41 19.57 49.43 22.35 50.17 24.91 C 50.91 27.47 51.31 29.07 51.54 32.76 C 51.76 36.46 52.84 46.08 51.54 47.10 C 50.23 48.12 45.90 40.67 43.69 38.91 C 41.47 37.14 40.10 37.03 38.23 36.52 C 36.35 36.01 34.76 35.72 32.42 35.84 C 30.09 35.95 26.51 36.58 24.23 37.20 C 21.96 37.83 21.39 37.60 18.77 39.59 C 16.15 41.58 11.38 45.05 8.53 49.15 C 5.69 53.24 3.07 60.52 1.71 64.16 C 0.34 67.80 0.57 68.09 0.34 70.99 C 0.11 73.89 0.00 78.56 0.34 81.57 C 0.68 84.58 1.54 87.03 2.39 89.08 C 3.24 91.13 4.27 92.49 5.46 93.86 C 6.66 95.22 7.85 96.30 9.56 97.27 C 11.26 98.24 12.57 99.32 15.70 99.66 C 18.83 100.00 25.37 99.72 28.33 99.32 C 31.29 98.92 31.46 98.46 33.45 97.27 C 35.44 96.08 38.28 94.08 40.27 92.15 C 42.26 90.22 43.80 88.17 45.39 85.67 C 46.99 83.16 48.24 81.46 49.83 77.13 C 51.42 72.81 53.75 65.24 54.95 59.73 C 56.14 54.21 56.66 49.20 57.00 44.03 C 57.34 38.85 57.28 32.82 57.00 28.67 C 56.71 24.52 56.09 21.96 55.29 19.11 C 54.49 16.27 53.53 13.88 52.22 11.60 C 50.91 9.33 49.26 7.11 47.44 5.46 C 45.62 3.81 43.17 2.56 41.30 1.71 C 39.42 0.85 38.34 0.57 36.18 0.34 Z M 38.57 41.64 C 40.22 42.04 41.41 42.78 42.66 43.69 C 43.91 44.60 44.94 45.39 46.08 47.10 C 47.21 48.81 48.86 52.56 49.49 53.92 C 50.11 55.29 49.83 54.49 49.83 55.29 C 49.83 56.09 50.00 56.09 49.49 58.70 C 48.98 61.32 47.55 67.97 46.76 70.99 C 45.96 74.00 45.62 74.63 44.71 76.79 C 43.80 78.95 42.72 81.63 41.30 83.96 C 39.87 86.29 37.60 89.19 36.18 90.78 C 34.76 92.38 33.90 92.78 32.76 93.52 C 31.63 94.25 31.06 94.88 29.35 95.22 C 27.65 95.56 24.29 95.79 22.53 95.56 C 20.76 95.34 19.91 94.65 18.77 93.86 C 17.63 93.06 16.61 92.15 15.70 90.78 C 14.79 89.42 13.82 87.03 13.31 85.67 C 12.80 84.30 12.74 84.70 12.63 82.59 C 12.51 80.49 12.34 76.17 12.63 73.04 C 12.91 69.91 13.37 67.12 14.33 63.82 C 15.30 60.52 17.18 55.86 18.43 53.24 C 19.68 50.63 20.76 49.49 21.84 48.12 C 22.92 46.76 24.00 45.85 24.91 45.05 C 25.82 44.25 26.00 43.97 27.30 43.34 C 28.61 42.72 30.89 41.58 32.76 41.30 C 34.64 41.01 36.92 41.24 38.57 41.64 Z',
  w: 57, // natural aspect in a 100-tall box: 57 wide x 100 tall
  h: 100,
  // The glyph's own visual centre (bowl + loop balanced), used as the iris seed point and the
  // anchor for scale transforms, so growing or shrinking the mark never drifts it sideways.
  cx: 27,
  cy: 56,
};

export const Mark: React.FC<{
  size: number; // px for the glyph's height; width follows its own aspect (0.57x)
  color?: string;
  style?: React.CSSProperties;
  opacity?: number;
}> = ({ size, color = C.paper, style, opacity = 1 }) => {
  const w = size * (GLYPH.w / GLYPH.h);
  return (
    <svg
      width={w}
      height={size}
      viewBox={`0 0 ${GLYPH.w} ${GLYPH.h}`}
      style={{ overflow: 'visible', display: 'block', ...style }}
    >
      <path d={GLYPH.d} fill={color} fillRule="evenodd" opacity={opacity} />
    </svg>
  );
};

/**
 * Transform that places a Mark rendered at `size` so its box's top-left sits at (x, y) scaled by k.
 * Scale the whole SVG by transform instead of changing `size` per frame: no relayout, no pixel snapping.
 */
export const placeMark = (x: number, y: number, k = 1): React.CSSProperties => ({
  position: 'absolute',
  left: 0,
  top: 0,
  transformOrigin: '0 0',
  transform: `translate(${x}px, ${y}px) scale(${Math.max(1e-4, k)})`,
});
