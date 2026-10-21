// Text measurement against the real, loaded font. Only call it under <FontGate> (every act is),
// because a measurement taken with the fallback face would be cached and silently wrong.
import { FONT } from '../brand/tokens';

const widths = new Map<string, number>();

/** Advance width in px of one line, exactly as the DOM lays it out (variable weight, em tracking). */
export const measureTracked = (text: string, size: number, weight: number, trackEm: number, family = FONT.text) => {
  const key = `${text}|${size}|${weight}|${trackEm}|${family}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  const span = document.createElement('span');
  span.textContent = text;
  Object.assign(span.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'pre',
    fontFamily: family,
    fontSize: `${size}px`,
    fontWeight: String(weight),
    letterSpacing: `${trackEm}em`,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '1',
  });
  document.body.appendChild(span);
  const w = span.getBoundingClientRect().width;
  document.body.removeChild(span);
  widths.set(key, w);
  return w;
};

/** Largest size (px, at most `max`) at which `text` fits in `maxWidth`. Widths scale linearly with size. */
export const fitSize = (text: string, maxWidth: number, max: number, weight: number, trackEm: number, family = FONT.text) =>
  Math.min(max, (maxWidth / measureTracked(text, 100, weight, trackEm, family)) * 100);

/**
 * Ink metrics of `text` from the font itself (canvas measureText): how far glyphs rise above and
 * fall below the baseline, and where the ink starts and ends. Use it to sit a mark on the cap
 * height or a dot on the baseline instead of guessing from the font size.
 */
type Ink = { ascent: number; descent: number; left: number; right: number; fontAscent: number; fontDescent: number };
const inks = new Map<string, Ink>();

export const inkBox = (text: string, size: number, weight: number, family = FONT.text): Ink => {
  const key = `${text}|${size}|${weight}|${family}`;
  const hit = inks.get(key);
  if (hit) return hit;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('inkBox: no 2D canvas context');
  ctx.font = `${weight} ${size}px ${family}`;
  const m = ctx.measureText(text);
  const ink = {
    ascent: m.actualBoundingBoxAscent, // ink above the baseline
    descent: m.actualBoundingBoxDescent, // ink below it
    left: -m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    fontAscent: m.fontBoundingBoxAscent, // the font's line metrics, which CSS line boxes use
    fontDescent: m.fontBoundingBoxDescent,
  };
  inks.set(key, ink);
  return ink;
};

/** Distance from the top of a CSS line box (font-size `size`, line-height `lead`) down to its baseline. */
export const baselineOf = (size: number, weight: number, lead: number, family = FONT.text) => {
  const { fontAscent, fontDescent } = inkBox('Hg', size, weight, family);
  return (size * lead - (fontAscent + fontDescent)) / 2 + fontAscent;
};
