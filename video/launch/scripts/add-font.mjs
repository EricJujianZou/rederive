#!/usr/bin/env node
/**
 * add-font.mjs: vendor a @fontsource-variable/* family into the film project, without npm install.
 *
 * A project made with `new-film.sh --link-modules` shares its node_modules with other projects, so
 * `npm install <font>` inside it would write into that shared folder (and change every film that
 * uses it). This script fetches the package with `npm pack` into a temp folder (or reads it from
 * node_modules when it is already there, read-only), and copies the face into the project:
 *
 *   Remotion     src/brand/fonts/<name>/index.css + the .woff2 files it references + LICENSE;
 *                src/brand/fonts.ts imports './fonts/<name>/index.css' (replacing the starter's
 *                stand-in for that role); src/brand/tokens.ts gets the family in FONT.<role> and
 *                FACES, with every weight clamped to the font's axis. The bundler serves the files,
 *                FontGate waits for them: nothing is fetched at render time.
 *   HyperFrames  fonts/<name>-latin[-ext]-wght-normal.woff2 + fonts/<name>-LICENSE, and prints the
 *                @font-face block to paste into index.html.
 *
 * Only normal (upright) faces are copied: italics are a hard ban when you invent the look. The
 * package's own category decides the role: a monospace family becomes FONT.mono, a sans FONT.text;
 * serif, display and handwriting families are refused unless --brand-supplied (the user's brand
 * supplied it: record it in BRIEF.md).
 *
 * Usage (from the project root, or pass --dir):
 *   node scripts/add-font.mjs <name | @fontsource-variable/name[@version]> [--role text|mono]
 *                             [--dir <project>] [--no-tokens] [--brand-supplied] [--dry-run]
 *   e.g. node scripts/add-font.mjs manrope
 *        node scripts/add-font.mjs @fontsource-variable/jetbrains-mono --role mono
 * Exit codes: 0 vendored, 1 failed (the message says why), 2 bad arguments.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const HELP = readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, '');
let tmp = null; // the npm pack folder, removed on every exit
const cleanup = () => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; };
const die = (msg, code = 1) => { cleanup(); console.error(`add-font: ${msg}`); process.exit(code); };

const args = process.argv.slice(2);
let spec = null, role = null, dir = '.', tokens = true, brand = false, dry = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(HELP.trim()); process.exit(0); }
  else if (a === '--role') role = args[++i];
  else if (a === '--dir') dir = args[++i];
  else if (a === '--no-tokens') tokens = false;
  else if (a === '--brand-supplied') brand = true;
  else if (a === '--dry-run') dry = true;
  else if (a.startsWith('-')) die(`unknown option ${a} (see --help)`, 2);
  else if (spec) die(`one font per run (got ${spec} and ${a})`, 2);
  else spec = a;
}
if (!spec) { console.log(HELP.trim()); die('missing <name | package>', 2); }
if (role && !['text', 'mono'].includes(role)) die('--role must be text or mono', 2);
dir = resolve(dir);

// ---- which package ------------------------------------------------------------------------
const m = /^(?:(@[\w.-]+)\/)?([\w.-]+?)(?:@([\w.^~<>=*-]+))?$/.exec(spec);
if (!m) die(`cannot read the package name "${spec}"`, 2);
const scope = m[1] || '@fontsource-variable';
const name = m[2];
const pkg = `${scope}/${name}`;
if (scope !== '@fontsource-variable') console.warn(`add-font: ${pkg} is not a variable package; one face per weight will be copied as its index.css lists them`);

const engine = existsSync(join(dir, 'src/brand')) ? 'remotion' : existsSync(join(dir, 'index.html')) ? 'hyperframes' : null;
if (!engine) die(`${dir} is not a cinetic film (no src/brand/ and no index.html); pass --dir`);

// ---- get the files: node_modules (read-only) or npm pack into a temp folder -----------------
let root = join(dir, 'node_modules', pkg);
if (!existsSync(join(root, 'index.css')) || m[3]) {
  tmp = mkdtempSync(join(tmpdir(), 'add-font-'));
  try {
    const out = execFileSync('npm', ['pack', m[3] ? `${pkg}@${m[3]}` : pkg, '--pack-destination', tmp, '--silent'],
      { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();
    execFileSync('tar', ['-xzf', join(tmp, out), '-C', tmp]);
  } catch (e) {
    die(`npm pack ${pkg} failed: ${(e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' ')}\n` +
      '  (is the name right? the families are listed at fontsource.org; offline, copy the .woff2 files by hand: references/copy-and-type.md §6)');
  }
  root = join(tmp, 'package');
}
try {
  const meta = existsSync(join(root, 'metadata.json')) ? JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8')) : {};
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const css = readFileSync(join(root, 'index.css'), 'utf8');
  const blocks = [...css.matchAll(/(\/\*[^*]*\*\/\s*)?@font-face\s*\{[^}]*\}/g)].map((b) => b[0]).filter((b) => !/font-style:\s*(italic|oblique)/.test(b));
  if (!blocks.length) die(`${pkg} has no upright @font-face in index.css`);
  const family = /font-family:\s*['"]([^'"]+)['"]/.exec(blocks[0])?.[1];
  const wr = /font-weight:\s*(\d+)(?:\s+(\d+))?/.exec(blocks[0]);
  const axis = wr ? [Number(wr[1]), Number(wr[2] ?? wr[1])] : [400, 400];
  const category = meta.category || 'unknown';
  if (['serif', 'display', 'handwriting'].includes(category) && !brand)
    die(`${family} is a ${category} family: serif, display and script faces are hard bans when you invent the look ` +
      '(SKILL.md). If the user\'s brand supplies it, rerun with --brand-supplied and record it in BRIEF.md.');
  role = role || (category === 'monospace' || / Mono\b/.test(family) ? 'mono' : 'text');
  const files = [...new Set(blocks.flatMap((b) => [...b.matchAll(/url\(\s*['"]?\.\/(files\/[^'")]+)['"]?\s*\)/g)].map((u) => u[1])))];
  const missing = files.filter((f) => !existsSync(join(root, f)));
  if (missing.length) die(`${pkg} is missing ${missing.join(', ')}`);
  const lic = ['LICENSE', 'LICENSE.md', 'OFL.txt'].find((f) => existsSync(join(root, f)));
  const kb = (fs) => Math.round(fs.reduce((s, f) => s + statSync(join(root, f)).size, 0) / 1024);
  const say = (s) => console.log(`add-font: ${s}`);

  if (engine === 'hyperframes') {
    const pick = files.filter((f) => /-(latin|latin-ext)-[\w-]*normal\.woff2$/.test(f));
    const dst = join(dir, 'fonts');
    if (!dry) {
      mkdirSync(dst, { recursive: true });
      for (const f of pick) copyFileSync(join(root, f), join(dst, basename(f)));
      if (lic) copyFileSync(join(root, lic), join(dst, `${name}-LICENSE`));
    }
    say(`${family} ${version} (${category}, weight ${axis.join('-')}): ${pick.map((f) => 'fonts/' + basename(f)).join(', ')} (${kb(pick)} KB)`);
    console.log(`\npaste into index.html (and use the family name literally in font-family):\n` +
      pick.map((f) => {
        const b = blocks.find((x) => x.includes(f));
        const range = /unicode-range:\s*([^;]+);/.exec(b)?.[1];
        return `@font-face {\n  font-family: "${family}";\n  src: url("fonts/${basename(f)}") format("woff2");\n  font-weight: ${axis.join(' ')};\n  font-style: normal;${range ? `\n  unicode-range: ${range};` : ''}\n}`;
      }).join('\n'));
    cleanup();
    process.exit(0);
  }

  // ---- Remotion: vendor the CSS and its files ------------------------------------------------
  const rel = `fonts/${name}`;
  const dst = join(dir, 'src/brand', rel);
  const header = `/* ${family} ${version}, vendored from ${pkg} by scripts/add-font.mjs (upright faces only).\n` +
    `   Licence: ./LICENSE. Weight axis ${axis.join('-')}. Loaded by src/brand/fonts.ts; FontGate waits for FACES. */\n\n`;
  if (!dry) {
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(join(dst, 'files'), { recursive: true });
    for (const f of files) copyFileSync(join(root, f), join(dst, f));
    if (lic) copyFileSync(join(root, lic), join(dst, 'LICENSE'));
    writeFileSync(join(dst, 'index.css'), header + blocks.join('\n\n') + '\n');
  }
  say(`${family} ${version} (${category}, weight ${axis.join('-')}) -> src/brand/${rel}/ (${files.length} files, ${kb(files)} KB)`);

  // fonts.ts: import the vendored CSS; drop the starter's stand-in for this role and its marker
  const fontsTs = join(dir, 'src/brand/fonts.ts');
  let ft = existsSync(fontsTs) ? readFileSync(fontsTs, 'utf8') : '';
  const standIn = role === 'mono' ? /^import '@fontsource-variable\/geist-mono';\n/m : /^import '@fontsource-variable\/geist';\n/m;
  ft = ft.replace(standIn, '');
  if (role === 'text') ft = ft.replace(/^(?:\/\/\n)?\/\/ cinetic:placeholder[^\n]*\n(?:\/\/(?! cinetic:)[^\n]*\n)*/m, '');
  const imp = `import './${rel}/index.css'; // ${family} (${role}), vendored: scripts/add-font.mjs`;
  if (!ft.includes(`'./${rel}/index.css'`)) ft = ft.replace(/\s*$/, '\n') + imp + '\n';
  if (!dry) writeFileSync(fontsTs, ft);
  say(`src/brand/fonts.ts imports ./${rel}/index.css`);

  // tokens.ts: FONT.<role> and FACES follow the family; weights clamp to the axis
  const tokTs = join(dir, 'src/brand/tokens.ts');
  if (tokens && existsSync(tokTs)) {
    let tk = readFileSync(tokTs, 'utf8');
    const line = new RegExp(`^(\\s*${role}:\\s*)'([^']*)'`, 'm');
    const cur = line.exec(tk);
    if (!cur) die(`src/brand/tokens.ts has no FONT.${role} line to set (set FONT and FACES by hand)`);
    const old = /"([^"]+)"/.exec(cur[2])?.[1];
    const stack = role === 'mono' ? `"${family}", ui-monospace, monospace` : `"${family}", system-ui, sans-serif`;
    tk = tk.replace(line, `$1'${stack}'`);
    const clampW = (w) => Math.min(axis[1], Math.max(axis[0], w));
    const clamped = [];
    tk = tk.replace(/^(export const FACES\s*=\s*\[)([^\]]*)\]/m, (all, head, body) => {
      const faces = [...body.matchAll(/'([^']*)'/g)].map((x) => x[1]);
      const next = faces.map((f) => {
        const fm = /^(\d+)\s+(\S+)\s+"([^"]+)"$/.exec(f);
        if (!fm || fm[3] !== old) return f;
        const w = clampW(Number(fm[1]));
        if (w !== Number(fm[1])) clamped.push(`${fm[1]} -> ${w}`);
        return `${w} ${fm[2]} "${family}"`;
      });
      if (!next.some((f) => f.endsWith(`"${family}"`))) next.push(`400 16px "${family}"`);
      return `${head}${[...new Set(next)].map((f) => `'${f}'`).join(', ')}]`;
    });
    if (role === 'text') tk = tk.replace(/^\/\/ cinetic:placeholder - the family is[^\n]*\n(?:\/\/(?! cinetic:)[^\n]*\n)*/m, '');
    // TYPE weights outside the axis would silently fall back to the nearest one: say so
    const outside = [...tk.matchAll(/weight:\s*(\d+)/g)].map((x) => Number(x[1])).filter((w) => w < axis[0] || w > axis[1]);
    if (!dry) writeFileSync(tokTs, tk);
    say(`src/brand/tokens.ts: FONT.${role} = '${stack}'${old ? ` (was "${old}")` : ''}; FACES follow it` +
      (clamped.length ? ` (weights clamped to the axis: ${clamped.join(', ')})` : ''));
    if (role === 'text' && outside.length) console.warn(`add-font: TYPE uses weight ${[...new Set(outside)].join(', ')}, outside ${family}'s axis ${axis.join('-')}: pick weights inside it`);
  }

  // package.json: the starter's stand-in dependency for this role is no longer used
  const pj = join(dir, 'package.json');
  const standPkg = role === 'mono' ? '@fontsource-variable/geist-mono' : '@fontsource-variable/geist';
  if (existsSync(pj) && !dry) {
    const p = JSON.parse(readFileSync(pj, 'utf8'));
    const stillUsed = readdirSync(join(dir, 'src'), { recursive: true }).some((f) => /\.(tsx?|css)$/.test(f) &&
      readFileSync(join(dir, 'src', f), 'utf8').includes(`'${standPkg}'`));
    if (p.dependencies?.[standPkg] && !stillUsed) {
      delete p.dependencies[standPkg];
      writeFileSync(pj, JSON.stringify(p, null, 2) + '\n');
      say(`package.json: dropped ${standPkg} (the stand-in)`);
    }
  }
  console.log(`next: choose the weights and tracking in TYPE for this family (references/copy-and-type.md §6), then npm run check && npm run stills`);
} finally {
  cleanup();
}
