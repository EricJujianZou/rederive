// Brand tokens: the only place a colour, face or type size is written down. Acts import these;
// scripts/lint-film.mjs fails any hex colour that is not declared here.
//
// Light stage this time (BRIEF.md: white canvas in the manner of the Muse launch film). Ink is
// the brand's own #0D1117 (assets/banner-dark.png stage, used as type here). The neutrals come
// from `palette.py --accent #1A7F37 --stage light`, the paper pushed to pure white per the brief.
import type React from 'react';
import { safeInsets } from '../lib/safe';
import { H, W } from '../timeline';

export const C = {
  ink: '#0D1117', // type, the mark, lines, packets, the user's bubble
  ink2: '#1A1E1B', // raised dark surfaces (unused on a white stage; kept for the lint's palette)
  paper: '#FFFFFF', // the stage: the brief asks for white
  mist: '#F1F3F2', // the rederive bubble and the phone screens
  line: '#D6DAD7', // hairlines and the router gate, >= 1.5 px on screen
  mute: '#646B65', // secondary text: diagram labels, the URL (5.1:1 on paper)
  white: '#FFFFFF',
  // The one accent, and what it means: "resolved: your design matches the real one". GitHub's
  // light-theme green for an added line, 4.7:1 on paper. It appears only when the direct path
  // works (bar 9), on the word ICE (bar 10) and as the iris seed; never on the end card's type.
  accent: '#1A7F37',
};

export const FONT = {
  // Geist is the wordmark's own face (assets/banner-light.png), so it is the brand's choice, not
  // the starter's stand-in: every role uses it. The mono carries only the install URL.
  text: '"Geist Variable", system-ui, sans-serif',
  mono: '"Geist Mono Variable", ui-monospace, monospace',
};

/** Faces the FontGate waits for before anything renders or measures (one entry per weight in use). */
export const FACES = ['650 16px "Geist Variable"', '500 16px "Geist Variable"', '450 16px "Geist Mono Variable"'];

/** Layout unit: 1 at 1080p, scales every size with the short side of the frame (16:9, 9:16, 1:1). */
export const U = Math.min(W, H) / 1080;

// One token per role, reused everywhere, so nothing is "almost matched" (size in px at 1080p).
export const TYPE = {
  display: { size: 128, weight: 650, track: -0.03, lead: 1.0 }, // the wordmark and the giant ICE
  secondary: { size: 46, weight: 500, track: -0.01, lead: 1.2 }, // the end-card tagline
  ui: { size: 34, weight: 500, track: -0.01, lead: 1.3 }, // the bubbles and the composer
  label: { size: 24, weight: 500, track: 0.0, lead: 1.2 }, // diagram labels, chips, the header pill
  mono: { size: 30, weight: 450, track: 0.0, lead: 1.4 }, // the URL
};

/** CSS for a type role at a size (px). Tabular figures always, so numbers never jitter in width. */
export const typeStyle = (role: keyof typeof TYPE, size = TYPE[role].size * U): React.CSSProperties => ({
  fontFamily: role === 'mono' ? FONT.mono : FONT.text,
  fontSize: size,
  fontWeight: TYPE[role].weight,
  letterSpacing: `${TYPE[role].track}em`,
  lineHeight: TYPE[role].lead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'pre',
});

export const safeArea = (w: number, h: number) => {
  const i = safeInsets(undefined, w, h);
  return { x: Math.max(i.left, i.right), y: Math.max(i.top, i.bottom) };
};
export const SAFE = safeArea(W, H);
