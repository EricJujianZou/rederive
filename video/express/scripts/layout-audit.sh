#!/usr/bin/env bash
# layout-audit.sh: render audit stills of a composition and check every text box.
#
# Renders the chosen frames with --props '{"audit":true}'. The starter's <Audit> (src/lib/Audit.tsx)
# measures every element tagged data-text="<id>" and logs one CINETIC_AUDIT JSON line per frame; this
# script collects them and fails on text outside the safe zone, text boxes that overlap, readable
# text under 22 px (at 1080p; 32 px in a 9:16 frame), text covered by a moving element tagged
# data-mover (sampled with elementsFromPoint, so z-order counts) and, with --speed, readable text
# travelling faster than 20 px/f (motion blur turns it into a double image). The audit stills
# (boxes drawn, safe zone dashed) are kept.
#
# Usage (from the project root):
#   bash scripts/layout-audit.sh <Comp> [--frames 120,240 | --cues | --copy] [--props '{"k":1}']
#                                [--speed | --no-speed] [--max-text-speed 20]
#                                [--safe feed9x16 | --safe 270,120,420,64 | --safe 96,64]
#                                [--entry src/index.ts] [--json out/qa/layout-<Comp>.json]
#                                [--out out/qa/layout-<Comp>] [--concurrency 2]
#   frames   --copy (default): each COPY entry's resolved frame, mid-hold and last frame before it leaves
#            --cues: every CUE frame plus each COPY resolved frame
#            --frames: an explicit comma list
#   Comp ActN reads frames relative to the Nth entry of ACT; any other composition (Film,
#   Film9x16, ...) uses absolute timeline frames. The composition must accept an `audit` prop
#   (and a `safe` prop it hands to <Audit>, as the starter's Film and acts do).
#   speed    also renders f+1 for each audited frame f (except the composition's last) and fails a
#            readable text box (effective opacity >= 0.5, at least the minimum size) whose centre
#            moves more than --max-text-speed px/f (default 20, in px of a 1080 px tall frame, so
#            9:16 and 1:1 compare fairly). Boxes match by data-text id: give each line its own.
#            On by default with --cues (--no-speed turns it off); opt in with --copy or --frames,
#            where it doubles the stills. The composition's length comes from src/timeline.ts.
#   safe     a preset from src/lib/safe.ts (feed9x16, feed9x16Strict, square1x1, portrait4x5,
#            wide16x9, title), insets top,right,bottom,left in px, the older symmetric x,y, or a
#            JSON object. Default: the composition's own `safe` prop, else the preset for its
#            aspect (9:16 -> feed9x16). The audit also fails text painted under a data-mover.
# Exit codes: 0 no issues, 1 issues found or the audit did not run, 2 bad arguments.
set -euo pipefail

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }
die() { echo "layout-audit: $*" >&2; exit 2; }

COMP=""; MODE=copy; FRAMES=""; PROPS="{}"; SAFE=""; ENTRY=src/index.ts; JSON=""; OUTDIR=""; CONC="${CONCURRENCY:-2}"
SPEED=""; MAXV=20
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --frames) MODE=frames; FRAMES="${2:?--frames needs a list}"; shift 2 ;;
    --cues) MODE=cues; shift ;;
    --copy) MODE=copy; shift ;;
    --speed) SPEED=1; shift ;;
    --no-speed) SPEED=0; shift ;;
    --max-text-speed) MAXV="${2:?--max-text-speed needs px/f}"; SPEED="${SPEED:-1}"; shift 2 ;;
    --props) PROPS="${2:?--props needs JSON}"; shift 2 ;;
    --safe) SAFE="${2:?--safe needs a preset, insets or JSON}"; shift 2 ;;
    --entry) ENTRY="${2:?}"; shift 2 ;;
    --json) JSON="${2:?}"; shift 2 ;;
    --out) OUTDIR="${2:?}"; shift 2 ;;
    --concurrency) CONC="${2:?}"; shift 2 ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) [[ -z "$COMP" ]] || die "one composition only"; COMP="$1"; shift ;;
  esac
done
[[ -n "$COMP" ]] || { usage; die "missing <Comp>"; }
node -e "process.exit(Number(process.argv[1]) > 0 ? 0 : 1)" "$MAXV" || die "--max-text-speed must be a positive number of px/f"
[[ -n "$SPEED" ]] || { [[ "$MODE" == cues ]] && SPEED=1 || SPEED=0; }

# Run from the project root: the current directory if it holds the entry, else this script's parent.
if [[ ! -f "$ENTRY" ]]; then cd "$(dirname "${BASH_SOURCE[0]}")/.."; fi
[[ -f "$ENTRY" ]] || die "entry $ENTRY not found (run from the project root or pass --entry)"
JSON="${JSON:-out/qa/layout-$COMP.json}"
OUTDIR="${OUTDIR:-out/qa/layout-$COMP}"
mkdir -p "$(dirname "$JSON")"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/layout-audit-XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# Frame list and the composition's length from the timeline (tsx loads src/timeline.ts directly).
if [[ "$MODE" != frames || "$SPEED" == 1 ]]; then
  TL="$(dirname "$ENTRY")/timeline.ts"
  [[ -f "$TL" ]] || die "$TL not found; pass --frames (and --no-speed: --speed reads the composition's length from it)"
  cat > "$TMP/frames.ts" <<EOF
import * as T from '$(cd "$(dirname "$TL")" && pwd)/timeline.ts';
const mode = '$MODE';
const comp = '$COMP';
const acts = Object.values(T.ACT as Record<string, { from: number; dur: number }>);
const m = /^Act(\d+)$/.exec(comp);
const act = m ? acts[Number(m[1]) - 1] : null;
if (m && !act) { console.error('no ACT entry #' + m[1]); process.exit(3); }
const [lo, hi] = act ? [act.from, act.from + act.dur] : [0, T.TOTAL as number];
const out = new Set<number>();
const copy = (T.COPY ?? []) as { resolved: number; out?: number }[];
for (const c of copy) {
  const end = Math.min(c.out ?? T.TOTAL, T.TOTAL) - 1;
  out.add(c.resolved);
  if (mode === 'copy') { out.add(Math.floor((c.resolved + end) / 2)); out.add(end); }
}
if (mode === 'cues') for (const v of Object.values(T.CUE as Record<string, number | number[]>)) for (const f of [v].flat()) out.add(f);
const frames = [...out].filter((f) => f >= lo && f < hi).map((f) => Math.round(f - lo)).sort((a, b) => a - b);
console.log([...new Set(frames)].join(','));
console.log(hi - lo);
EOF
  LIST=$(npx tsx "$TMP/frames.ts") || die "could not read frames from $TL"
  LEN=$(tail -n 1 <<< "$LIST")
  if [[ "$MODE" != frames ]]; then
    FRAMES=$(head -n 1 <<< "$LIST")
    [[ -n "$FRAMES" ]] || die "no COPY/CUE frames fall inside $COMP; pass --frames"
  fi
fi
FRAMES=$(node -e "const f=[...new Set(process.argv[1].split(',').map(Number))].filter(Number.isInteger).sort((a,b)=>a-b);if(!f.length)process.exit(1);console.log(f.join(','))" "$FRAMES") || die "bad --frames list"
ALLPROPS=$(node -e "try{const p=JSON.parse(process.argv[1]);p.audit=true;console.log(JSON.stringify(p))}catch(e){process.exit(1)}" "$PROPS") || die "--props is not valid JSON"
if [[ -n "$SAFE" ]]; then
  # preset name | t,r,b,l | x,y | JSON  ->  props.safe (validated again by src/lib/safe.ts at render)
  ALLPROPS=$(node -e '
    const [props, s] = process.argv.slice(1); const p = JSON.parse(props); let v;
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(s)) v = s;
    else if (/^\s*\{/.test(s)) v = JSON.parse(s);
    else { const n = s.split(",").map(Number); if (n.some((x) => !(x >= 0))) process.exit(1);
      if (n.length === 4) v = { top: n[0], right: n[1], bottom: n[2], left: n[3] };
      else if (n.length === 2) v = { x: n[0], y: n[1] }; else process.exit(1); }
    p.safe = v; console.log(JSON.stringify(p));' "$ALLPROPS" "$SAFE") || die "--safe must be a preset name, top,right,bottom,left, x,y or a JSON object"
fi

# --speed: render f+1 beside each audited frame f (none past the composition's last frame).
RENDER="$FRAMES"; SPEEDMAX=0
if [[ "$SPEED" == 1 ]]; then
  RENDER=$(node -e "const n=Number(process.argv[2]);console.log([...new Set(process.argv[1].split(',').map(Number).flatMap((f)=>f+1<n?[f,f+1]:[f]))].sort((a,b)=>a-b).join(','))" "$FRAMES" "$LEN")
  SPEEDMAX="$MAXV"
fi

echo "layout-audit: $COMP frames $FRAMES$([[ "$SPEED" == 1 ]] && echo " (+ f+1 of each for text speed, max $MAXV px/f)")"
rm -rf "$OUTDIR"; mkdir -p "$OUTDIR"
if ! npx remotion render "$ENTRY" "$COMP" "$OUTDIR" --sequence --frames="$RENDER" --props="$ALLPROPS" \
     --image-format=jpeg --concurrency="$CONC" --log=verbose > "$TMP/render.log" 2>&1; then
  grep -m1 -E "safe: (unknown preset|[a-z]+ must be)" "$TMP/render.log" >&2 || tail -30 "$TMP/render.log" >&2
  echo "layout-audit: render failed" >&2; exit 1
fi

node - "$TMP/render.log" "$JSON" "$COMP" "$FRAMES" "$OUTDIR" "$SPEEDMAX" "${LEN:-0}" <<'EOF'
const fs = require('fs');
const [log, jsonPath, comp, framesArg, outDir, maxArg, lenArg] = process.argv.slice(2);
const want = framesArg.split(',').map(Number);
const maxV = Number(maxArg); // text-speed limit, px/f in a 1080 px tall frame; 0: the check is off
const pairs = maxV > 0 ? want.filter((f) => f + 1 < Number(lenArg)) : []; // f -> f+1
const byFrame = new Map();
for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
  const TAG = 'CINETIC_AUDIT ';
  const i = line.indexOf(TAG);
  if (i < 0) continue;
  try { const d = JSON.parse(line.slice(i + TAG.length)); byFrame.set(d.frame, d); } catch { /* truncated line */ }
}
const missing = [...new Set([...want, ...pairs.map((f) => f + 1)])].filter((f) => !byFrame.has(f));
const audited = want.filter((f) => byFrame.has(f)).map((f) => byFrame.get(f)); // f+1 frames only feed the speed
const issues = [];
for (const d of audited) for (const x of d.issues) issues.push({ frame: d.frame, ...x });
// Text speed: each box's centre from f to the nearest box with its id on f+1, in px of a 1080 px
// tall frame. Readable: effective opacity >= 0.5 and at least the minimum size.
let fastest = null;
for (const f of pairs) {
  const a = byFrame.get(f), b = byFrame.get(f + 1);
  if (!a || !b) continue;
  const k = 1080 / a.height;
  for (const box of a.boxes) {
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const d = Math.min(...b.boxes.filter((n) => n.id === box.id).map((n) => Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy)));
    if (!Number.isFinite(d)) continue; // gone (or faded out) on f+1
    box.speed = Math.round(d * k * 10) / 10;
    if (box.opacity < 0.5 || box.px < (a.minPx ?? 0)) continue;
    if (!fastest || box.speed > fastest.speed) fastest = { frame: f, id: box.id, speed: box.speed };
    if (box.speed <= maxV) continue;
    const at = k === 1 ? '' : ` (${Math.round(d * 10) / 10} px/f in ${a.width}x${a.height}, scaled to 1080 px tall)`;
    issues.push({ frame: f, kind: 'text-speed', id: box.id,
      detail: `${box.speed} px/f > ${maxV}${at}: slow it under ${maxV} px/f, or fade its text out for the flight and resolve it on landing`, speed: box.speed });
  }
}
issues.sort((p, q) => p.frame - q.frame);
const report = {
  tool: 'layout-audit', comp, frames: want, audited: audited.length, missing, stills: outDir,
  pass: issues.length === 0 && missing.length === 0 && audited.length > 0,
  issues,
  speed: maxV > 0 ? { max: maxV, pairs: pairs.length, fastest } : null,
  zone: audited[0]?.zone, safe: audited[0]?.safe,
  boxes: audited.map((d) => ({ frame: d.frame, safe: d.safe, boxes: d.boxes })),
};
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 1) + '\n');
for (const x of issues) console.log(`  f${x.frame}  ${x.kind}  ${x.id}  ${x.detail}`);
if (!byFrame.size) console.log(`  no CINETIC_AUDIT output: does ${comp} accept the audit prop and render <Audit/> inside <FontGate>?`);
else if (missing.length) console.log(`  no audit line for frames ${missing.join(',')}`);
const n = audited.reduce((s, d) => s + d.boxes.length, 0);
const z = report.safe ? ` in ${report.zone} (top ${report.safe.top}, right ${report.safe.right}, bottom ${report.safe.bottom}, left ${report.safe.left})` : '';
const v = maxV > 0 ? `, fastest readable text ${fastest ? `${fastest.speed} px/f (${fastest.id} f${fastest.frame})` : 'not measured'}` : '';
console.log(`layout-audit: ${audited.length}/${want.length} frames, ${n} text boxes${z}${v}, ${issues.length} issues -> ${report.pass ? 'pass' : 'FAIL'} (${jsonPath}, stills in ${outDir})`);
process.exit(report.pass ? 0 : 1);
EOF
