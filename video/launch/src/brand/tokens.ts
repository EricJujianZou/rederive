// Brand tokens: the only place a colour, face or type size is written down. Acts import these;
// scripts/lint-film.mjs fails any hex colour that is not declared here.
//
// cinetic:placeholder - delete these four lines once the palette is the film's own. This palette
// is the starter's stand-in, not a brand: apply the user's brand or invent one for this film
// (references/brand-and-color.md). lint-film.mjs errors while a placeholder marker is left in src/,
// because a film that keeps the starter's palette and mark looks like every other starter film.
import type React from 'react';
import { safeInsets } from '../lib/safe';
import { H, W } from '../timeline';

export const C = {
  ink: '#0D0E10', // type, marks, dark stages
  ink2: '#1C1E22', // raised surfaces on ink
  paper: '#F5F6F7', // the light stage (a dark stage is just as valid: the brand decides)
  mist: '#E9EBEE', // soft panels on paper
  line: '#D6D9DE', // hairlines, >= 1.5 px on screen
  mute: '#686D76', // secondary text: 4.8:1 on paper, readable at any size
  white: '#FFFFFF',
  // The one accent, and what it means: "the beat" - whatever just landed and locked. A signal
  // green (3.5:1 on paper, 5.1:1 on ink: large type and graphics only). It arrives on new things
  // and relaxes to ink; it covers well under 8% of the frame except in one designed flood.
  accent: '#08965A',
};

export const FONT = {
  text: '"Geist Variable", system-ui, sans-serif', // the film's one sans, for every role; typeStyle and measure.ts read it
  mono: '"Geist Mono Variable", ui-monospace, monospace',
};

/** Faces the FontGate waits for before anything renders or measures (one entry per weight in use). */
export const FACES = ['400 16px "Geist Variable"', '600 16px "Geist Variable"', '400 16px "Geist Mono Variable"'];

/** Layout unit: 1 at 1080p, scales every size with the short side of the frame (16:9, 9:16, 1:1). */
export const U = Math.min(W, H) / 1080;

// One token per role, reused everywhere, so nothing is "almost matched" (size in px at 1080p).
export const TYPE = {
  display: { size: 120, weight: 600, track: -0.045, lead: 1.0 }, // statements and the wordmark
  secondary: { size: 48, weight: 450, track: -0.02, lead: 1.15 }, // descriptor lines, URLs
  ui: { size: 24, weight: 500, track: -0.01, lead: 1.3 }, // smallest readable size on screen
};

/** CSS for a type role at a size (px). Tabular figures always, so numbers never jitter in width. */
export const typeStyle = (role: keyof typeof TYPE, size = TYPE[role].size * U): React.CSSProperties => ({
  fontFamily: FONT.text,
  fontSize: size,
  fontWeight: TYPE[role].weight,
  letterSpacing: `${TYPE[role].track}em`,
  lineHeight: TYPE[role].lead,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'pre',
});

/**
 * Safe margins for a w x h frame as a symmetric envelope: the larger inset of each pair from the
 * frame's safe-zone preset (src/lib/safe.ts), so a centred layout that fits inside clears every
 * side. 96 x 64 px at 1920x1080; 120 x 420 at 1080x1920, where the feed zones are asymmetric
 * (use safeBox() from lib/safe.ts there to centre on the clear band instead of the frame).
 */
export const safeArea = (w: number, h: number) => {
  const i = safeInsets(undefined, w, h);
  return { x: Math.max(i.left, i.right), y: Math.max(i.top, i.bottom) };
};
/** The film's safe margins; text stays inside them (scripts/layout-audit.sh checks). */
export const SAFE = safeArea(W, H);
