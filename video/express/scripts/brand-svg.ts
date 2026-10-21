/**
 * brand-svg.ts: the mark and the lockup as SVG files, for a brand the film invented.
 *
 * The mark is src/brand/Mark.tsx rendered to static markup (the same component the film animates),
 * once in ink for light grounds and once in paper for dark ones. The lockup adds the wordmark as
 * outlined paths (scripts/outline-text.py: shaped with the font's kerning at the display weight and
 * tracking), set the way the film's lockup is: the mark as tall as the name's ink ascent, a gap of
 * 0.3 of that height, one shared baseline (references/brand-and-color.md §6).
 *
 * When the mark is part of the name (a letter of the word is the mark, or the mark replaces one), a
 * mark beside a typed name is the wrong lockup. Export `LockupSvg` from src/brand/Mark.tsx instead: a
 * component that renders the whole lockup as one <svg> with its own viewBox, all outlines (no live
 * text), taking `ink` and `dot` colours. brand-svg.ts then writes it as is and needs no font.
 *
 * Usage (from the project root; scripts/brand-kit.sh calls it):
 *   npx tsx scripts/brand-svg.ts [--out out/deliver/brand] [--name plinth] [--font path.woff2]
 * The name defaults to COPY 'wordmark' in src/timeline.ts; the font to the first
 * @fontsource-variable import in src/brand/fonts.ts. Exit 0 written, 1 on any failure.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name: string, dflt?: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const die = (msg: string): never => {
  console.error(`brand-svg: ${msg}`);
  process.exit(1);
};
const root = process.cwd();
const out = resolve(opt('--out', 'out/deliver/brand')!);
const here = dirname(fileURLToPath(import.meta.url));

const main = async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const imp = (p: string) => import(pathToFileURL(join(root, p)).href);
  const markModule = await imp('src/brand/Mark.tsx');
  const { Mark } = markModule;
  const tokens = await imp('src/brand/tokens.ts');
  const { C, TYPE } = tokens;
  const timeline = await imp('src/timeline.ts');

  const markInner = (ink: string) =>
    renderToStaticMarkup(React.createElement(Mark, { size: 100, ink }))
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '');
  const svg = (w: number, h: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${Math.round(w)}" height="${Math.round(h)}">${body}</svg>\n`;
  mkdirSync(out, { recursive: true });

  // a lockup the brand draws itself (the mark is part of the word): written as is
  const LockupSvg = markModule.LockupSvg; // ({ ink, dot }) => <svg viewBox=...>
  if (LockupSvg) {
    const files: string[] = [];
    for (const [ground, ink] of [['light', C.ink], ['dark', C.paper]] as const) {
      writeFileSync(join(out, `mark-${ground}.svg`), svg(100, 100, markInner(ink)));
      let body = renderToStaticMarkup(React.createElement(LockupSvg, { ink, dot: C.accent }));
      if (!/^<svg[^>]*viewBox=/.test(body)) die('LockupSvg must render one <svg> with a viewBox');
      if (/<text[\s>]/.test(body)) die('LockupSvg renders live <text>; outline the name (scripts/outline-text.py) so the file needs no font');
      if (!/xmlns=/.test(body.slice(0, body.indexOf('>')))) body = body.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      writeFileSync(join(out, `lockup-${ground}.svg`), body + '\n');
      files.push(`mark-${ground}.svg`, `lockup-${ground}.svg`);
    }
    console.log(`brand-svg: ${files.join(', ')} -> ${out} (LockupSvg from src/brand/Mark.tsx)`);
    return;
  }

  const name: string = opt('--name') ?? timeline.COPY?.find((c: { id: string }) => c.id === 'wordmark')?.text ?? die('no --name and no COPY entry "wordmark"');
  let font = opt('--font');
  if (!font) {
    const src = readFileSync(join(root, 'src/brand/fonts.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    const pkg = src.match(/@fontsource-variable\/([\w-]+)/)?.[1] ?? src.match(/fonts\/([\w-]+)\//)?.[1]
      ?? die('no @fontsource-variable import or vendored font (src/brand/fonts/<name>/) in src/brand/fonts.ts; pass --font');
    // a font vendored by scripts/add-font.mjs wins over one in node_modules
    const vendored = join(root, 'src/brand/fonts', pkg, 'files', `${pkg}-latin-wght-normal.woff2`);
    font = existsSync(vendored) ? vendored : join(root, 'node_modules/@fontsource-variable', pkg, 'files', `${pkg}-latin-wght-normal.woff2`);
  }
  if (!existsSync(font)) die(`font file ${font} not found; pass --font`);

  const size = 200; // the wordmark's em in SVG units; everything scales together
  // the lockup as tokens.ts sets it (LOCKUP = { ratio, gap, weight, track }, references/brand-and-color.md §6),
  // falling back to the display type and the default proportions
  const L = (tokens as { LOCKUP?: { ratio?: number; gap?: number; weight?: number; track?: number } }).LOCKUP ?? {};
  const weight = L.weight ?? TYPE.display.weight;
  const track = L.track ?? TYPE.display.track;
  const text = JSON.parse(
    execFileSync('python3', [join(here, 'outline-text.py'), '--font', font, '--text', name, '--size', String(size), '--weight', String(weight), '--track', String(track)], { encoding: 'utf8' }),
  );
  const M = text.ascent * (L.ratio ?? 1); // mark height = the name's ink ascent x LOCKUP.ratio (as in the film's lockup)
  const gap = (L.gap ?? 0.3) * M;
  const pad = 0.25 * M;

  const files: string[] = [];
  for (const [ground, ink] of [['light', C.ink], ['dark', C.paper]] as const) {
    writeFileSync(join(out, `mark-${ground}.svg`), svg(100, 100, markInner(ink)));
    const w = pad + M + gap + (text.ink[2] - text.ink[0]) + pad;
    const h = pad + M + text.descent + pad;
    const base = pad + M; // baseline y
    const body =
      `<g transform="translate(${pad.toFixed(2)} ${pad.toFixed(2)}) scale(${(M / 100).toFixed(4)})">${markInner(ink)}</g>` +
      `<path fill="${ink}" transform="translate(${(pad + M + gap - text.ink[0]).toFixed(2)} ${base.toFixed(2)})" d="${text.d}"/>`;
    writeFileSync(join(out, `lockup-${ground}.svg`), svg(w, h, body));
    files.push(`mark-${ground}.svg`, `lockup-${ground}.svg`);
  }
  console.log(`brand-svg: ${files.join(', ')} -> ${out} ("${name}", ${weight} / ${track} em)`);
};
main().catch((e) => die(e instanceof Error ? e.message : String(e)));
