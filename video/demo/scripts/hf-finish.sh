#!/usr/bin/env bash
# hf-finish.sh: render and finish a HyperFrames film the cinetic way.
#
#   preflight -> lint (0 errors) -> check -> PNG-sequence render -> one BT.709 encode
#   -> mux the mastered WAV -> check-sync.py -> probe.py
#
# Why not `hyperframes render` straight to MP4: that path captures JPEG q95 and then encodes
# again (two lossy steps, visible on dark gradients), defaults to CRF 16 and AAC 192k, and has
# no loudness stage and no motion blur in the CLI. Rendering PNGs and encoding once here fixes
# the picture; the soundtrack comes in already mastered from scripts/audio/ and is muxed here.
# --blur K renders at fps*K and averages the sub-frames with accumulate.py --uniform K.
#
# Usage:
#   bash scripts/hf-finish.sh <project> <out.mp4> [--audio wav] [--fps 60] [--blur K]
#        [--shutter 240] [--crf 14] [--preview] [--composition file.html] [--workers 2]
#        [--skip-check] [--keep] [--allow-transparent] [--variables JSON] [--json report.json]
#   bash scripts/hf-finish.sh <project> --export-cues out/cues.json
#
#   --audio WAV        mastered soundtrack to mux (AAC 320k, 48 kHz); checked with check-sync.py
#   --fps N            output fps (default: root data-fps, else motion.js FPS)
#   --blur K           render at fps*K (<= 240) and accumulate K sub-frames per frame
#   --shutter DEG      shutter for --blur (default 240; accumulate.py centres the samples)
#   --crf N            x264 CRF (default 14; --preview uses 20 and preset veryfast)
#   --preview          fast iteration: skips check, no blur, CRF 20
#   --composition F    render this file instead of index.html (passed to render -c)
#   --workers N        HyperFrames capture workers (default 2; each is a Chromium process)
#   --skip-check       skip `hyperframes check` (lint still runs)
#   --keep             keep the PNG frames in <out dir>/.hf-finish-<name>/ (the last one is always
#                      kept as <out dir>/qa/<name>-last-frame.png, deliver.sh's clean poster source)
#   --allow-transparent  accept transparent pixels (they encode as black); default is to fail
#   --variables JSON   variable values for this render (one row of a --batch, finished properly)
#   --json FILE        also write the run report there (it is always printed on stdout)
#   --export-cues F    write FILM.cues() from motion.js + timeline.js to F and exit
#
# Env: HF_CLI (default "npx -y hyperframes@0.8.79"). Browser: HYPERFRAMES_BROWSER_PATH, else
# CHROMIUM_PATH or REMOTION_BROWSER, else a sandbox headless shell under /opt/pw-browsers, else
# HyperFrames downloads its own. Telemetry is off unless HYPERFRAMES_NO_TELEMETRY is set to 0.
# Exit: 0 every gate passed, 1 a gate failed, 2 usage error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die() { echo "hf-finish: $*" >&2; exit 1; }
usage() {  # usage [status]: help on stdout for --help (exit 0), on stderr for misuse (exit 2)
  if [ "${1:-2}" = 0 ]; then sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; fi
  sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 2
}
log() { echo "hf-finish: $*" >&2; }

[ $# -ge 1 ] || usage
case "$1" in -h|--help) usage 0 ;; esac
PROJ="$1"; shift
OUT=""; AUDIO=""; FPS=""; BLUR=1; SHUTTER=240; CRF=""; PREVIEW=0; COMP=""; WORKERS=2
SKIP_CHECK=0; KEEP=0; JSON=""; CUES_OUT=""; ALLOW_ALPHA=0; VARS=""
if [ $# -ge 1 ] && [ "${1#--}" = "$1" ]; then OUT="$1"; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --audio) AUDIO="${2:?--audio needs a file}"; shift 2 ;;
    --fps) FPS="${2:?}"; shift 2 ;;
    --blur) BLUR="${2:?}"; shift 2 ;;
    --shutter) SHUTTER="${2:?}"; shift 2 ;;
    --crf) CRF="${2:?}"; shift 2 ;;
    --preview) PREVIEW=1; shift ;;
    --composition) COMP="${2:?}"; shift 2 ;;
    --workers) WORKERS="${2:?}"; shift 2 ;;
    --skip-check) SKIP_CHECK=1; shift ;;
    --keep) KEEP=1; shift ;;
    --allow-transparent) ALLOW_ALPHA=1; shift ;;
    --variables) VARS="${2:?}"; shift 2 ;;
    --json) JSON="${2:?}"; shift 2 ;;
    --export-cues) CUES_OUT="${2:?}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "hf-finish: unknown option $1" >&2; usage ;;
  esac
done
[ -d "$PROJ" ] || { echo "hf-finish: no project directory $PROJ" >&2; exit 2; }
PROJ="$(cd "$PROJ" && pwd)"
ENTRY="${COMP:-index.html}"
[ -f "$PROJ/$ENTRY" ] || { echo "hf-finish: missing $PROJ/$ENTRY" >&2; exit 2; }
command -v node >/dev/null || die "node is required"

# ---- preflight: timeline vs root, fonts and local scripts on disk, cue export -------------
PRE="$(PROJ="$PROJ" ENTRY="$ENTRY" CUES_OUT="$CUES_OUT" node - <<'JS'
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.env.PROJ, entry = process.env.ENTRY, cuesOut = process.env.CUES_OUT;
const errs = [], warn = [];
const html = fs.readFileSync(path.join(dir, entry), 'utf8');
const rootTag = (html.match(/<[a-z][^>]*\bdata-composition-id\s*=[^>]*>/is) || [''])[0];
const attr = (n) => { const m = rootTag.match(new RegExp('\\b' + n + '\\s*=\\s*["\']([^"\']*)["\']', 'i')); return m ? m[1] : ''; };
const v = { dur: attr('data-duration'), rootFps: attr('data-fps'), w: attr('data-width'), h: attr('data-height') };
if (!rootTag) errs.push(`${entry}: no element with data-composition-id`);
let film = null, motion = null;
const mj = path.join(dir, 'motion.js'), tj = path.join(dir, 'timeline.js');
if (fs.existsSync(mj) && fs.existsSync(tj)) {
  const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
  try {
    vm.runInContext(fs.readFileSync(mj, 'utf8'), ctx, { filename: mj });
    vm.runInContext(fs.readFileSync(tj, 'utf8'), ctx, { filename: tj });
    film = ctx.FILM; motion = ctx.MOTION;
  } catch (e) { errs.push(`timeline.js/motion.js failed to load: ${e.message}`); }
}
if (film && motion) {
  const want = film.TOTAL / motion.FPS;
  if (v.dur === '') errs.push(`root data-duration is missing; set it to ${want} (TOTAL ${film.TOTAL} f / ${motion.FPS} fps)`);
  else if (Math.abs(+v.dur - want) > 1e-6) errs.push(`root data-duration="${v.dur}" but TOTAL/FPS = ${want} s; the render would cut or freeze. Make them equal.`);
  if (v.rootFps && +v.rootFps !== motion.FPS) errs.push(`root data-fps="${v.rootFps}" but motion.js FPS = ${motion.FPS}`);
  if (v.w && +v.w !== motion.W || v.h && +v.h !== motion.H) warn.push(`root is ${v.w}x${v.h} but motion.js says ${motion.W}x${motion.H}`);
  if (cuesOut) {
    if (typeof film.cues !== 'function') errs.push('timeline.js has no FILM.cues()');
    else {
      fs.mkdirSync(path.dirname(path.resolve(cuesOut)), { recursive: true });
      fs.writeFileSync(path.resolve(cuesOut), JSON.stringify(film.cues(), null, 1));
    }
  }
} else if (cuesOut) errs.push('--export-cues needs motion.js and timeline.js in the project');
// every html the render mounts: the entry plus compositions/**
const files = [path.join(dir, entry)];
const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p); } };
walk(path.join(dir, 'compositions'));
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const face of src.match(/@font-face\s*\{[^}]*\}/gi) || []) {
    for (const m of face.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const u = m[1];
      if (/^(data:|https?:|local\()/i.test(u)) { if (/^https?:/i.test(u)) warn.push(`${path.relative(dir, f)}: remote font ${u} fails offline; ship a local woff2`); continue; }
      if (!fs.existsSync(path.join(dir, u.replace(/^\//, '')))) errs.push(`${path.relative(dir, f)}: font file ${u} is missing (see fonts/README.md; npm install runs setup.mjs)`);
    }
  }
  for (const m of src.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1];
    if (/^https?:|^\/\//i.test(u)) { warn.push(`${path.relative(dir, f)}: remote script ${u}; renders need network (vendor it locally)`); continue; }
    if (!fs.existsSync(path.join(dir, u.replace(/^\//, '')))) errs.push(`${path.relative(dir, f)}: script ${u} is missing (npm install runs setup.mjs)`);
  }
}
for (const w of warn) console.error('hf-finish: warning: ' + w);
for (const e of errs) console.error('hf-finish: ' + e);
const num = (x) => (x === '' || x === undefined || x === null || isNaN(+x) ? '' : String(+x));
console.log(`P_DUR=${num(v.dur)} P_ROOTFPS=${num(v.rootFps)} P_W=${num(v.w || (motion && motion.W))} P_H=${num(v.h || (motion && motion.H))} P_TLFPS=${num(motion && motion.FPS)} P_TOTAL=${num(film && film.TOTAL)} P_ERR=${errs.length}`);
JS
)" || die "preflight crashed"
eval "$PRE"
[ "$P_ERR" = 0 ] || die "preflight failed ($P_ERR problem(s) above)"
if [ -n "$CUES_OUT" ]; then log "wrote $CUES_OUT"; exit 0; fi
[ -n "$OUT" ] || usage

FPS="${FPS:-${P_ROOTFPS:-${P_TLFPS:-60}}}"
[ "$PREVIEW" = 1 ] && { BLUR=1; SKIP_CHECK=1; CRF="${CRF:-20}"; PRESET=veryfast; } || PRESET=slow
CRF="${CRF:-14}"
case "$BLUR" in ''|*[!0-9]*) die "--blur takes a whole number" ;; esac
RFPS=$((FPS * BLUR))
[ "$RFPS" -le 240 ] || die "--blur $BLUR at $FPS fps needs $RFPS fps; HyperFrames caps at 240 (use K <= $((240 / FPS)), or Remotion for faster motion)"
[ -n "$P_TLFPS" ] && [ "$FPS" != "$P_TLFPS" ] && log "warning: rendering at $FPS fps but the grid in motion.js is $P_TLFPS fps"
if [ -n "$AUDIO" ]; then [ -f "$AUDIO" ] || die "missing audio $AUDIO"; AUDIO="$(cd "$(dirname "$AUDIO")" && pwd)/$(basename "$AUDIO")"; fi
command -v ffmpeg >/dev/null || die "ffmpeg is required"

mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
NAME="$(basename "$OUT" .mp4)"
WORK="$(dirname "$OUT")/.hf-finish-$NAME"
QA="$(dirname "$OUT")/qa"
mkdir -p "$QA"
if [ -d "$WORK" ]; then rm -rf -- "$WORK"; fi
mkdir -p "$WORK"
cleanup() { if [ "$KEEP" = 0 ] && [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT

read -r -a HF <<< "${HF_CLI:-npx -y hyperframes@0.8.79}"
export HYPERFRAMES_NO_TELEMETRY="${HYPERFRAMES_NO_TELEMETRY:-1}" HYPERFRAMES_SKIP_SKILLS=1
if [ -z "${HYPERFRAMES_BROWSER_PATH:-}" ] && [ -z "${PRODUCER_HEADLESS_SHELL_PATH:-}" ]; then
  for c in "${CHROMIUM_PATH:-}" "${REMOTION_BROWSER:-}" /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell; do
    if [ -n "$c" ] && [ -x "$c" ]; then export HYPERFRAMES_BROWSER_PATH="$c"; break; fi
  done
fi
[ -n "${HYPERFRAMES_BROWSER_PATH:-}" ] && log "browser: $HYPERFRAMES_BROWSER_PATH"

STEPS=""
step() { STEPS="$STEPS\"$1\":\"$2\","; }
report() {
  local ok="$1"
  local r="{\"ok\":$ok,\"out\":\"$OUT\",\"fps\":$FPS,\"blur\":$BLUR,\"render_fps\":$RFPS,\"crf\":$CRF,\"steps\":{${STEPS%,}}}"
  echo "$r"
  if [ -n "$JSON" ]; then mkdir -p "$(dirname "$JSON")"; echo "$r" > "$JSON"; fi
}
fail_step() { step "$1" fail; report false; die "$2"; }

# ---- 1. lint: zero errors, or check's layout audit silently samples nothing ---------------
set +e
${HF[@]+"${HF[@]}"} lint "$PROJ" --json > "$QA/hf-lint.json" 2> "$QA/hf-lint.log"
set -e
LINT="$(node -e '
const s = require("fs").readFileSync(process.argv[1], "utf8");
let j; try { j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch (e) { console.log("ERR -1"); process.exit(0); }
const all = (j.results || []).flatMap((r) => (r.result && r.result.findings) || []).concat(j.findings || []);
for (const f of all) if (f.severity === "error") console.error("  lint error " + f.code + ": " + f.message);
console.log("ERR " + (j.errorCount ?? -1) + " WARN " + (j.warningCount ?? 0));
' "$QA/hf-lint.json")"
read -r _ LERR _ LWARN <<< "$LINT"
[ "$LERR" = 0 ] || { tail -n 20 "$QA/hf-lint.log" >&2; fail_step lint "lint reported ${LERR} error(s); see $QA/hf-lint.json"; }
step lint "pass (${LWARN:-0} warnings)"; log "lint: 0 errors, ${LWARN:-0} warnings"

# ---- 2. check: runtime errors, layout, contrast, in one Chromium pass ----------------------
if [ "$SKIP_CHECK" = 0 ]; then
  if ${HF[@]+"${HF[@]}"} check "$PROJ" > "$QA/hf-check.log" 2>&1; then
    step check pass; log "check: pass ($QA/hf-check.log)"
  else
    sed 's/\x1b\[[0-9;]*m//g' "$QA/hf-check.log" | tail -n 40 >&2
    fail_step check "hyperframes check failed; fix the issues above or mark intentional ones (data-layout-allow-overflow / -occlusion)"
  fi
else
  step check skipped
fi

# ---- 3. render PNG frames (lossless capture, no encoder) ----------------------------------
RARGS=(render "$PROJ" --format png-sequence --fps "$RFPS" -o "$WORK/frames" --workers "$WORKERS" --strict --quiet)
[ -n "$COMP" ] && RARGS+=(-c "$COMP")
[ -n "$VARS" ] && RARGS+=(--variables "$VARS" --strict-variables)
log "render: $RFPS fps PNG sequence ($WORKERS workers)"
if ! ${HF[@]+"${HF[@]}"} ${RARGS[@]+"${RARGS[@]}"} > "$QA/hf-render.log" 2>&1; then
  sed 's/\x1b\[[0-9;]*m//g' "$QA/hf-render.log" | tail -n 30 >&2
  fail_step render "hyperframes render failed; see $QA/hf-render.log"
fi
NF=$(find "$WORK/frames" -maxdepth 1 -name 'frame_*.png' | wc -l)
[ "$NF" -gt 0 ] || fail_step render "render wrote no frames"
if [ -n "$P_TOTAL" ] && [ -n "$P_TLFPS" ]; then
  WANT=$(( (P_TOTAL * RFPS + P_TLFPS / 2) / P_TLFPS ))
  [ "$NF" = "$WANT" ] || fail_step render "render wrote $NF frames, expected $WANT (TOTAL $P_TOTAL f at $RFPS fps)"
fi
# PNG capture keeps alpha and drops the html/body background: uncovered pixels would encode black.
for F1 in "$WORK/frames/frame_000001.png" "$WORK/frames/$(printf 'frame_%06d.png' "$NF")"; do
  [ "$(ffprobe -v error -show_entries stream=pix_fmt -of csv=p=0 "$F1")" = rgba ] || continue
  AMIN="$(ffmpeg -v error -i "$F1" -vf "alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YMIN:file=-" \
    -f null - 2>/dev/null | sed -n 's/.*YMIN=//p' | head -n 1)"
  if [ -n "$AMIN" ] && [ "$AMIN" -lt 255 ] && [ "$ALLOW_ALPHA" = 0 ]; then
    fail_step render "$(basename "$F1") has transparent pixels (alpha min $AMIN): PNG renders do not capture the html/body background. Put the fill on a full-bleed .clip layer, or pass --allow-transparent"
  fi
done
step render "pass ($NF frames at $RFPS fps)"; log "render: $NF frames"
# the lossless last frame: deliver.sh takes the poster from it, not from a decoded H.264 frame
cp "$WORK/frames/$(printf 'frame_%06d.png' "$NF")" "$QA/$NAME-last-frame.png"

# ---- 4. encode once: BT.709 limited range, tagged -----------------------------------------
PIC="$WORK/picture.mp4"
if [ "$BLUR" -gt 1 ]; then
  [ -f "$SCRIPT_DIR/accumulate.py" ] || fail_step encode "--blur needs $SCRIPT_DIR/accumulate.py"
  python3 "$SCRIPT_DIR/accumulate.py" "$WORK/frames/frame_*.png" "$PIC" --uniform "$BLUR" --in-fps "$RFPS" \
    --shutter "$SHUTTER" --crf "$CRF" --preset "$PRESET" --quiet > /dev/null || fail_step encode "accumulate.py failed"
  step encode "pass (blur K=$BLUR, shutter $SHUTTER, crf $CRF)"
else
  ffmpeg -v error -y -framerate "$FPS" -start_number 1 -i "$WORK/frames/frame_%06d.png" \
    -vf "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p" \
    -c:v libx264 -preset "$PRESET" -crf "$CRF" -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -movflags +faststart "$PIC" || fail_step encode "ffmpeg encode failed"
  step encode "pass (crf $CRF, $PRESET)"
fi
log "encode: $PIC"

# ---- 5. mux: the mastered WAV, video length wins ------------------------------------------
SIDE="$WORK/frames/audio.m4a"
SECS="$(awk -v n="$NF" -v k="$BLUR" -v f="$FPS" 'BEGIN { printf "%.6f", int(n / k) / f }')"
if [ -n "$AUDIO" ]; then
  # pad then cut the audio to the picture's exact length (AAC frames would otherwise overhang)
  ffmpeg -v error -y -i "$PIC" -i "$AUDIO" -map 0:v:0 -map 1:a:0 -c:v copy \
    -af "apad=whole_dur=$SECS" -c:a aac -b:a 320k -ar 48000 -ac 2 -t "$SECS" -movflags +faststart "$OUT" \
    || fail_step mux "ffmpeg mux failed"
  step mux "pass (aac 320k)"
elif [ -f "$SIDE" ]; then
  log "warning: no --audio; muxing HyperFrames' own mix (AAC 192k, not mastered)"
  ffmpeg -v error -y -i "$PIC" -i "$SIDE" -map 0:v:0 -map 1:a:0 -c copy -shortest -movflags +faststart "$OUT" || fail_step mux "ffmpeg mux failed"
  step mux "pass (composition audio, unmastered)"
else
  cp "$PIC" "$OUT"
  step mux "none (no audio)"
fi

# ---- 6. sync and spec gates ----------------------------------------------------------------
if [ -n "$AUDIO" ] && [ -f "$SCRIPT_DIR/check-sync.py" ]; then
  if python3 "$SCRIPT_DIR/check-sync.py" "$OUT" "$AUDIO" --json "$QA/sync.json" --quiet > /dev/null; then
    step sync pass; log "check-sync: pass ($QA/sync.json)"
  else
    fail_step sync "check-sync.py failed; see $QA/sync.json"
  fi
else
  step sync skipped
fi
if [ -f "$SCRIPT_DIR/probe.py" ] && [ -n "$P_W" ] && [ -n "$P_H" ]; then
  PDUR=()
  [ -n "$P_TOTAL" ] && [ -n "$P_TLFPS" ] && PDUR=(--frames $(( (P_TOTAL * FPS + P_TLFPS / 2) / P_TLFPS )))
  AMODE=any; [ -n "$AUDIO" ] && AMODE=required
  if python3 "$SCRIPT_DIR/probe.py" "$OUT" --spec "${P_W}x${P_H}@${FPS}" ${PDUR[@]+"${PDUR[@]}"} --audio "$AMODE" \
      --json "$QA/probe.json" --quiet > /dev/null; then
    step probe pass; log "probe: pass ($QA/probe.json)"
  else
    fail_step probe "probe.py failed; see $QA/probe.json"
  fi
else
  step probe skipped
fi

[ "$KEEP" = 1 ] && log "kept frames in $WORK/frames"
report true
log "done: $OUT"
