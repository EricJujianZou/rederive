// Colour mixing in OKLab. interpolateColors() mixes in gamma sRGB and rounds each step to whole
// code values, so slow ramps stair-step and hue mixes go muddy through grey; this mixes
// perceptually and rounds once, at the end.
type Lab = [number, number, number];

// Accepts '#rgb', '#rrggbb' and the 'rgb(r, g, b)' strings mixColor returns, so mixes can nest.
const hexToRgb = (hex: string): Lab => {
  const m = hex.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [m[1], m[2], m[3]].map((v) => Number(v) / 255) as Lab;
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255) as Lab;
};
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const toLab = (hex: string): Lab => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};

const fromLab = ([L, A, B]: Lab) => {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return rgb.map((c) => Math.round(Math.min(1, Math.max(0, gam(c))) * 255));
};

/** Perceptual mix of two colours (hex or 'rgb(...)'), t in 0..1 -> 'rgb(r, g, b)'. Nesting is safe. */
export const mixColor = (a: string, b: string, t: number) => {
  const A = toLab(a);
  const B = toLab(b);
  const k = Math.min(1, Math.max(0, t));
  const [r, g, bl] = fromLab([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
  return `rgb(${r}, ${g}, ${bl})`;
};
