/**
 * grid-check.ts: checks a film's timeline against the timing rules before anything renders.
 *
 * Imports the project's src/timeline.ts (FPS, BPM, TOTAL, ACT, CUE, COPY; optional BEAT, BAR, TAIL)
 * and checks, with the 60 fps numbers scaled to the film's fps:
 *   beat-whole     one beat is a whole number of frames (60*FPS/BPM)
 *   acts           acts are contiguous from 0 to TOTAL with positive lengths
 *   acts-on-bar    every act starts on a bar line (warning)
 *   cue-grid       every CUE is a frame in [0, TOTAL) on the 16th grid, or its line carries a
 *                  trailing `// offgrid: <reason>` comment (or an entry in an exported OFFGRID map)
 *   copy           every COPY entry has in <= resolved <= out inside the film
 *   text-hold      resolved text holds >= 36 f + 6 f per word (0.6 s + 0.1 s/word) before it leaves
 *   copy-lines     <= 5 words per line, <= 2 lines per entry (warning)
 *   word-total     on-screen words <= --max-words (default 35); entries with kind: 'ui' (terminal
 *                  commands, code, URLs, app labels the product shows) are counted apart, not budgeted
 *   event-gap      no stretch without an event (cue, copy change, act change, or a cues.json event
 *                  with --cues) longer than --max-gap frames (default 48 f at 60 fps), tail excluded;
 *                  one designed near-still hold may be declared with `export const HOLD = {from, to}`
 *                  (60-96 f at 60 fps, on the key claim under a music dropout), and gaps inside it pass
 *   tail           >= 1 s after the last cue so the audio can decay (warning)
 *   whole-bars     the body (TOTAL - TAIL) is whole bars; loops need it (warning)
 *
 * Usage:
 *   npx tsx scripts/grid-check.ts [src/timeline.ts] [--strict] [--json] [--max-words 35]
 *                                 [--max-gap 48] [--cues out/cues.json]
 *   --strict  warnings fail too.   --json  machine-readable report on stdout.
 * Exit codes: 0 pass, 1 a check failed (or a warning with --strict), 2 bad arguments / import error.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Act = { from: number; dur: number };
type Copy = { id: string; text: string; in: number; resolved: number; out?: number | null };
type Finding = { check: string; severity: 'error' | 'warn'; message: string };

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (has('-h') || has('--help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}
const valued = new Set(['--max-words', '--max-gap', '--cues']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
const tlPath = resolve(positional[0] ?? 'src/timeline.ts');
const json = has('--json');
const strict = has('--strict');

const die = (msg: string): never => {
  if (json) console.log(JSON.stringify({ tool: 'grid-check', pass: false, fatal: msg }));
  else console.error(`grid-check: ${msg}`);
  process.exit(2);
};

async function main() {
  if (!existsSync(tlPath)) die(`${tlPath} not found`);
  let T: Record<string, unknown>;
  try {
    T = await import(pathToFileURL(tlPath).href);
  } catch (e) {
    return die(`importing ${tlPath} failed (keep timeline.ts free of React/CSS imports): ${(e as Error).message}`);
  }
  const src = readFileSync(tlPath, 'utf8');
  const FPS = Number(T.FPS);
  const BPM = Number(T.BPM);
  const TOTAL = Number(T.TOTAL);
  const ACT = T.ACT as Record<string, Act> | undefined;
  const CUE = T.CUE as Record<string, number | number[]> | undefined;
  const COPY = (T.COPY as Copy[] | undefined) ?? [];
  for (const [k, v] of Object.entries({ FPS, BPM, TOTAL })) if (!(v > 0)) die(`timeline must export a positive number ${k}`);
  if (!ACT || typeof ACT !== 'object') die('timeline must export ACT ({name: {from, dur}})');
  if (!CUE || typeof CUE !== 'object') die('timeline must export CUE ({name: frame})');
  if (!Array.isArray(COPY)) die('COPY must be an array of {id, text, in, resolved, out}');

  const s = FPS / 60; // the 60 fps rules, scaled to this film
  const maxWords = Number(val('--max-words') ?? 35);
  const maxGap = Number(val('--max-gap') ?? Math.round(48 * s));
  const BEAT = (60 / BPM) * FPS;
  const BAR = BEAT * 4;
  const S16 = BEAT / 4;
  const TAIL = T.TAIL !== undefined ? Number(T.TAIL) : 0;
  const out: Finding[] = [];
  const err = (check: string, message: string) => out.push({ check, severity: 'error', message });
  const warn = (check: string, message: string) => out.push({ check, severity: 'warn', message });

  // Off-grid reasons: `name: value, // offgrid: why` on the declaring line, or export OFFGRID = {name: 'why'}.
  const offgrid = new Map<string, string>();
  for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:.*\/\/.*\boffgrid:\s*(.+)$/gm)) offgrid.set(m[1], m[2].trim());
  for (const [k, v] of Object.entries((T.OFFGRID as Record<string, string>) ?? {})) offgrid.set(k, String(v));

  // --- beat
  if (Math.abs(BEAT - Math.round(BEAT)) > 1e-9) {
    const ok = [];
    for (let b = 60; b <= 200; b++) if (Number.isInteger((60 / b) * FPS)) ok.push(b);
    err('beat-whole', `a beat is ${BEAT.toFixed(3)} f at ${BPM} BPM / ${FPS} fps; use a BPM with whole beats: ${ok.join(', ')}`);
  }
  if (T.BEAT !== undefined && Math.abs(Number(T.BEAT) - BEAT) > 1e-9) err('beat-whole', `exported BEAT ${T.BEAT} != 60/BPM*FPS = ${BEAT}`);
  if (T.BAR !== undefined && Math.abs(Number(T.BAR) - BAR) > 1e-9) err('beat-whole', `exported BAR ${T.BAR} != 4 beats = ${BAR}`);

  // --- acts
  const acts = Object.entries(ACT!).sort((a, b) => a[1].from - b[1].from);
  let at = 0;
  for (const [name, a] of acts) {
    if (!(a.dur > 0)) err('acts', `ACT.${name} has dur ${a.dur}`);
    if (a.from !== at) err('acts', `ACT.${name} starts at ${a.from}, expected ${at} (${a.from > at ? 'gap' : 'overlap'} of ${Math.abs(a.from - at)} f)`);
    const off = Math.abs(a.from - Math.round(a.from / BAR) * BAR);
    if (off > 0.5 && !offgrid.has(name)) warn('acts-on-bar', `ACT.${name} starts at ${a.from}, ${off.toFixed(1)} f off a bar line`);
    at = a.from + a.dur;
  }
  if (acts.length && at !== TOTAL) err('acts', `acts end at ${at} but TOTAL is ${TOTAL}`);

  // --- cues
  const cueFrames: { name: string; f: number }[] = [];
  for (const [name, v] of Object.entries(CUE!)) {
    const list = Array.isArray(v) ? v : [v];
    list.forEach((f, i) => {
      const label = Array.isArray(v) ? `${name}[${i}]` : name;
      if (typeof f !== 'number' || !Number.isFinite(f)) return err('cue-grid', `CUE.${label} is not a frame number (${f})`);
      if (!Number.isInteger(f)) err('cue-grid', `CUE.${label} = ${f} is fractional; cues are whole frames`);
      if (f < 0 || f >= TOTAL) err('cue-grid', `CUE.${label} = ${f} is outside the film [0, ${TOTAL})`);
      const off = Math.abs(f - Math.round(f / S16) * S16);
      if (off > 0.5 + 1e-9 && !offgrid.has(name))
        err('cue-grid', `CUE.${label} = ${f} is ${off.toFixed(2)} f off the 16th grid (${S16} f); snap it with b() or add "// offgrid: <reason>"`);
      cueFrames.push({ name: label, f });
    });
  }

  // --- copy
  let words = 0;
  let uiWords = 0;
  const holdNeed = (n: number) => Math.round((36 + 6 * n) * s);
  for (const c of COPY) {
    const id = c.id ?? '?';
    const n = String(c.text ?? '').split(/\s+/).filter(Boolean).length;
    const ui = (c as { kind?: string }).kind === 'ui'; // product strings: a typed command, code, a URL, an app label
    if (ui) uiWords += n;
    else words += n;
    const o = c.out ?? TOTAL;
    if (![c.in, c.resolved, o].every(Number.isFinite)) {
      err('copy', `COPY ${id}: in/resolved/out must be frames`);
      continue;
    }
    if (!(c.in <= c.resolved && c.resolved <= o)) err('copy', `COPY ${id}: needs in <= resolved <= out (got ${c.in}, ${c.resolved}, ${o}); unresolved text never exits`);
    if (c.in < 0 || o > TOTAL) err('copy', `COPY ${id}: [${c.in}, ${o}] is outside the film [0, ${TOTAL}]`);
    const hold = o - c.resolved;
    if (hold < holdNeed(n) && ui) warn('text-hold', `COPY ${id} (ui) "${c.text}" holds ${hold} f resolved; ${n} word(s) want >= ${holdNeed(n)} f if it must be read`);
    else if (hold < holdNeed(n)) err('text-hold', `COPY ${id} "${c.text}" holds ${hold} f resolved; ${n} word(s) need >= ${holdNeed(n)} f`);
    if (ui) continue; // UI strings keep the product's own layout
    const lines = String(c.text).split('\n');
    if (lines.length > 2) warn('copy-lines', `COPY ${id}: ${lines.length} lines on screen at once (keep <= 2)`);
    for (const l of lines) {
      const lw = l.split(/\s+/).filter(Boolean).length;
      if (lw > 5) warn('copy-lines', `COPY ${id}: "${l}" has ${lw} words on one line (keep <= 5)`);
    }
  }
  if (words > maxWords) err('word-total', `${words} on-screen words; the budget is ${maxWords} (--max-words). Typed commands, code, URLs and app labels belong in COPY with kind: 'ui' and are not budgeted`);

  // --- event gaps (the tail is for the audio to decay, so it is excluded)
  const bodyEnd = TOTAL - TAIL;
  const events = new Set<number>([0, bodyEnd]);
  // One designed near-still hold per film (the key claim, under a music dropout) may run past the gap limit.
  const HOLD = T.HOLD as { from: number; to: number } | undefined;
  const holdMax = Math.round(96 * s);
  let hold: { from: number; to: number } | null = null;
  if (HOLD !== undefined) {
    if (!HOLD || !Number.isFinite(HOLD.from) || !Number.isFinite(HOLD.to) || HOLD.to <= HOLD.from) {
      err('hold', 'HOLD must be {from, to} frames with to > from');
    } else if (HOLD.to - HOLD.from > holdMax) {
      err('hold', `HOLD runs ${HOLD.to - HOLD.from} f; a designed hold is at most ${holdMax} f (96 f at 60 fps)`);
    } else {
      hold = HOLD;
      events.add(HOLD.from);
      events.add(HOLD.to);
    }
  }
  for (const c of cueFrames) events.add(c.f);
  for (const [, a] of acts) events.add(a.from);
  for (const c of COPY) for (const f of [c.in, c.resolved, c.out ?? TOTAL]) if (Number.isFinite(f)) events.add(f);
  const cuesPath = val('--cues');
  if (cuesPath) {
    if (!existsSync(cuesPath)) die(`--cues ${cuesPath} not found (run npx tsx scripts/export-cues.ts)`);
    const doc = JSON.parse(readFileSync(cuesPath, 'utf8'));
    for (const e of doc.events ?? []) if (Number.isFinite(e.f)) events.add(Math.round(e.f));
  }
  const ev = [...events].filter((f) => f >= 0 && f <= bodyEnd).sort((a, b) => a - b);
  for (let i = 1; i < ev.length; i++) {
    const gap = ev[i] - ev[i - 1];
    if (hold && ev[i - 1] >= hold.from && ev[i] <= hold.to) continue; // the declared hold
    if (gap > maxGap) {
      const near = cueFrames.filter((c) => c.f === ev[i - 1] || c.f === ev[i]).map((c) => c.name);
      err('event-gap', `${gap} f without an event between f${ev[i - 1]} and f${ev[i]}${near.length ? ` (${near.join(', ')})` : ''}; add the beat that keeps it alive (a tick, a peak, a breath) or --max-gap`);
    }
  }

  // --- tail and bars
  const lastCue = cueFrames.reduce((m, c) => Math.max(m, c.f), 0);
  if (TOTAL - lastCue < FPS) warn('tail', `only ${TOTAL - lastCue} f after the last cue; leave >= ${FPS} f (1 s) for the audio to decay`);
  if (T.TAIL !== undefined && TAIL < FPS) warn('tail', `TAIL is ${TAIL} f; use >= ${FPS} f (1 s)`);
  if (Math.abs(bodyEnd / BAR - Math.round(bodyEnd / BAR)) > 1e-6) warn('whole-bars', `the body (TOTAL - TAIL = ${bodyEnd} f) is ${(bodyEnd / BAR).toFixed(2)} bars; whole bars loop and end cleanly`);

  // --- report
  const errors = out.filter((x) => x.severity === 'error').length;
  const warnings = out.length - errors;
  const pass = errors === 0 && !(strict && warnings > 0);
  const summary = {
    fps: FPS,
    bpm: BPM,
    beat: BEAT,
    bar: BAR,
    total: TOTAL,
    seconds: +(TOTAL / FPS).toFixed(3),
    acts: acts.length,
    cues: cueFrames.length,
    words,
    uiWords,
    maxWords,
    maxGap,
    longestGap: ev.slice(1).reduce((m, f, i) => Math.max(m, f - ev[i]), 0),
  };
  if (json) console.log(JSON.stringify({ tool: 'grid-check', timeline: tlPath, pass, errors, warnings, summary, findings: out }, null, 1));
  else {
    for (const f of out) console.log(`${f.severity === 'error' ? 'FAIL' : 'warn'}  ${f.check}  ${f.message}`);
    console.log(
      `grid-check: ${summary.seconds} s, ${BPM} BPM @ ${FPS} fps (beat ${BEAT} f, bar ${BAR} f), ${summary.acts} acts, ${summary.cues} cues, ` +
        `${words}/${maxWords} words${uiWords ? ` (+${uiWords} ui)` : ''}, longest gap ${summary.longestGap}/${maxGap} f -> ${pass ? 'pass' : 'FAIL'} (${errors} errors, ${warnings} warnings)`,
    );
  }
  process.exit(pass ? 0 : 1);
}

main();
