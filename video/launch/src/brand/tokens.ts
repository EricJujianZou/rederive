// Brand tokens: the only place a colour, face or type size is written down. Acts import these;
// scripts/lint-film.mjs fails any hex colour that is not declared here.
//
// Every value below except `accent` is pixel-sampled from the brand's own supplied files
// (assets/banner-dark.png, assets/session-dark.png): this is GitHub's own dark palette, which is
// already the product's real dark theme. `accent` is this film's own addition (the brief supplied
// no accent in any asset): GitHub's dark diff view green for an added, correct line. See BRIEF.md.
import type React from 'react';
import { safeInsets } from '../lib/safe';
import { H, W } from '../timeline';

export const C = {
  ink: '#0D1117', // the stage: sampled from banner-dark.png and session-dark.png (both agree)
  ink2: '#161B22', // raised surfaces on ink: the assistant bubble in session-dark.png
  paper: '#F0F3F6', // type, the mark, the user bubble and avatar badge: sampled from both files
  mist: '#E6EDF3', // the user bubble's own shade (very close to paper, kept distinct for depth)
  line: '#21262D', // hairlines, >= 1.5 px on screen
  mute: '#9198A1', // secondary text: the banner's own subtitle grey, 6.5:1 on ink
  white: '#FFFFFF',
  // The one accent, and what it means: "resolved, you got it". The exact green GitHub's own dark
  // diff view uses for an added, correct line, picked because no supplied asset carries an accent
  // (BRIEF.md). 7.45:1 on ink. It arrives only on the rederive side of the thread and at the
  // payoff; it never appears during the interview act or on the lockup's resting frame.
  accent: '#3FB950',
};

export const FONT = {
  text: '"Geist Variable", system-ui, sans-serif', // the wordmark's own face (banner-dark.png); every display and secondary role
  mono: '"Geist Mono Variable", ui-monospace, monospace', // the banner's subtitle face; all UI chrome, chat text, the typed command
};

/** Faces the FontGate waits for before anything renders or measures (one entry per weight in use). */
export const FACES = [
  '650 16px "Geist Variable"',
  '560 16px "Geist Variable"',
  '450 16px "Geist Mono Variable"',
  '500 16px "Geist Mono Variable"',
];

/** Layout unit: 1 at 1080p, scales every size with the short side of the frame (16:9, 9:16, 1:1). */
export const U = Math.min(W, H) / 1080;

// One token per role, reused everywhere, so nothing is "almost matched" (size in px at 1080p).
export const TYPE = {
  display: { size: 112, weight: 650, track: -0.03, lead: 1.0 }, // the wordmark and the payoff's decision name
  secondary: { size: 46, weight: 500, track: 0.0, lead: 1.2 }, // the end-card tagline
  mono: { size: 30, weight: 450, track: 0.0, lead: 1.4 }, // the URL, the typed command
  ui: { size: 26, weight: 500, track: 0.0, lead: 1.35 }, // the chat bubbles
};

/** CSS for a type role at a size (px). Tabular figures always, so numbers never jitter in width. */
export const typeStyle = (role: keyof typeof TYPE, size = TYPE[role].size * U): React.CSSProperties => ({
  fontFamily: role === 'mono' || role === 'ui' ? FONT.mono : FONT.text,
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
