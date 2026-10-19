/**
 * export-cues.ts: writes out/cues.json, the contract between the picture and the soundtrack.
 *
 * It imports the project's timeline (FPS, BPM, TOTAL, ACT, CUE) and the default export of
 * src/sync.ts: a function cues() that returns sound events computed from the same constants,
 * springs and easings the acts animate with. Sync points are computed, never typed.
 *
 * Usage (from the project root):
 *   npx tsx scripts/export-cues.ts [--sync src/sync.ts] [--timeline src/timeline.ts]
 *                                  [--out out/cues.json] [--allow-unknown] [--quiet]
 *
 * Output schema:
 *   { fps, bpm, total, acts: {name: {from, dur}}, cue: {name: frame},
 *     events: [{ f, kind, weight, pan, pitch?, apexFrac?, dur?, variant?, id? }] }
 * f is the absolute frame the sound belongs on (fractional allowed), weight 0..2 (1 = normal),
 * pan -1..1, pitch a MIDI number or a note name such as "Eb6", apexFrac (whoosh, suck) the point
 * of the sound that lands on f, dur a length in frames. See references/sound.md.
 *
 * Exit codes: 0 written, 1 import failure or invalid events (nothing is written).
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const KINDS = [
  'tick', 'tock', 'hit', 'land', 'pop', 'whoosh', 'riser', 'drop',
  'key', 'click', 'snap', 'swell', 'bell', 'suck',
] as const;
export type Kind = (typeof KINDS)[number];

export type SoundEvent = {
  f: number;
  kind: Kind | string;
  weight?: number;
  pan?: number;
  pitch?: number | string;
  apexFrac?: number;
  dur?: number;
  variant?: string;
  id?: string;
};

const FIELDS = new Set(['f', 'kind', 'weight', 'pan', 'pitch', 'apexFrac', 'dur', 'variant', 'id']);
const NOTE = /^[A-Ga-g][#b]{0,2}-?\d$/;

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name: string) => process.argv.includes(name);

const fail = (msg: string): never => {
  console.error(`export-cues: ${msg}`);
  process.exit(1);
};

async function load(path: string) {
  if (!existsSync(path)) fail(`cannot find ${path}`);
  try {
    return await import(pathToFileURL(resolve(path)).href);
  } catch (e) {
    return fail(`importing ${path} failed:\n${(e as Error).stack ?? e}`);
  }
}

async function main() {
  if (flag('--help') || flag('-h')) {
    console.log('npx tsx scripts/export-cues.ts [--sync src/sync.ts] [--timeline src/timeline.ts] [--out out/cues.json] [--allow-unknown] [--quiet]');
    return;
  }
  const syncPath = arg('--sync', 'src/sync.ts')!;
  const tlPath = arg('--timeline', resolve(dirname(syncPath), 'timeline.ts'))!;
  const outPath = arg('--out', 'out/cues.json')!;
  const quiet = flag('--quiet');

  const tl = await load(tlPath);
  const T = tl.default && tl.FPS === undefined ? tl.default : tl;
  const { FPS, BPM, TOTAL, ACT, CUE } = T;
  for (const [k, v] of Object.entries({ FPS, BPM, TOTAL })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(`${tlPath} must export a positive number ${k}`);
  }
  if (!ACT || typeof ACT !== 'object') fail(`${tlPath} must export ACT ({name: {from, dur}})`);
  if (!CUE || typeof CUE !== 'object') fail(`${tlPath} must export CUE ({name: frame})`);

  const mod = await load(syncPath);
  const exp = mod.default?.default ?? mod.default ?? mod.cues;
  const raw: unknown = typeof exp === 'function' ? await exp() : exp;
  const list = Array.isArray(raw) ? raw : (raw as { events?: unknown[] })?.events;
  if (!Array.isArray(list)) fail(`${syncPath}: default export cues() must return an array of events`);

  const errors: string[] = [];
  const warnings: string[] = [];
  const events = (list as SoundEvent[]).map((e, i) => {
    const where = `event ${i}${e?.id ? ` (${e.id})` : ''}`;
    if (!e || typeof e !== 'object') {
      errors.push(`${where}: not an object`);
      return null;
    }
    for (const k of Object.keys(e)) if (!FIELDS.has(k)) warnings.push(`${where}: unknown field "${k}" dropped`);
    const f = Number(e.f);
    if (!Number.isFinite(f)) errors.push(`${where}: f must be a frame number, got ${e.f}`);
    else if (f < 0 || f >= TOTAL) errors.push(`${where}: f=${f} is outside the film (0..${TOTAL - 1})`);
    else if (f > TOTAL - 30 && ['hit', 'drop', 'swell', 'bell', 'snap'].includes(e.kind))
      warnings.push(`${where}: ${e.kind} at f=${f} has under 30 f to ring out before the end`);
    if (!KINDS.includes(e.kind as Kind)) {
      if (flag('--allow-unknown')) warnings.push(`${where}: unknown kind "${e.kind}" (score.py will skip it)`);
      else errors.push(`${where}: unknown kind "${e.kind}"; use one of ${KINDS.join(', ')}`);
    }
    const weight = e.weight ?? 1;
    if (!(Number.isFinite(weight) && weight > 0 && weight <= 2)) errors.push(`${where}: weight must be in (0, 2], got ${e.weight}`);
    const pan = e.pan ?? 0;
    if (!(Number.isFinite(pan) && pan >= -1 && pan <= 1)) errors.push(`${where}: pan must be in [-1, 1], got ${e.pan}`);
    if (e.pitch !== undefined && !(typeof e.pitch === 'number' ? Number.isFinite(e.pitch) : NOTE.test(String(e.pitch))))
      errors.push(`${where}: pitch must be a MIDI number or a note like "Eb6", got ${e.pitch}`);
    if (e.apexFrac !== undefined && !(e.apexFrac > 0 && e.apexFrac < 1)) errors.push(`${where}: apexFrac must be in (0, 1)`);
    if (e.dur !== undefined && !(Number.isFinite(e.dur) && e.dur > 0)) errors.push(`${where}: dur must be > 0 frames`);
    const out: SoundEvent = { f: Math.round(f * 1000) / 1000, kind: e.kind, weight: +(+weight).toFixed(3), pan: +(+pan).toFixed(3) };
    if (e.pitch !== undefined) out.pitch = e.pitch;
    if (e.kind === 'whoosh' || e.kind === 'suck' || e.apexFrac !== undefined)
      out.apexFrac = +(e.apexFrac ?? (e.kind === 'suck' ? 0.85 : 0.5)).toFixed(3);
    if (e.dur !== undefined) out.dur = e.dur;
    if (e.variant !== undefined) out.variant = String(e.variant);
    if (e.id !== undefined) out.id = String(e.id);
    return out;
  });
  if (errors.length) fail(`${errors.length} invalid event(s):\n  ${errors.join('\n  ')}`);

  const sorted = (events as SoundEvent[]).sort((a, b) => a.f - b.f || String(a.kind).localeCompare(String(b.kind)));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.kind === b.kind && a.kind !== 'key' && Math.abs(a.f - b.f) < 0.5)
      warnings.push(`two ${a.kind} events on frame ${b.f}: one sound per visible event`);
  }

  const acts: Record<string, { from: number; dur: number }> = {};
  for (const [k, v] of Object.entries(ACT as Record<string, { from: number; dur: number }>)) acts[k] = { from: v.from, dur: v.dur };
  const cue: Record<string, number> = {};
  for (const [k, v] of Object.entries(CUE as Record<string, unknown>)) if (typeof v === 'number') cue[k] = v;

  const doc = { fps: FPS, bpm: BPM, total: TOTAL, acts, cue, events: sorted };
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(doc, null, 1) + '\n');

  if (!quiet) {
    for (const w of warnings) console.warn(`warning: ${w}`);
    const byKind: Record<string, number> = {};
    for (const e of sorted) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    console.log(
      `wrote ${relative(process.cwd(), resolve(outPath))}: ${sorted.length} events ` +
        `(${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', ')}), ` +
        `${Object.keys(cue).length} cues, ${(TOTAL / FPS).toFixed(2)} s at ${FPS} fps, ${BPM} BPM`,
    );
  }
}

main();
