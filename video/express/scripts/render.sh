#!/usr/bin/env bash
# render.sh: picture from Remotion (always muted), soundtrack muxed by ffmpeg, then sync + spec gates.
#
# Usage:
#   bash scripts/render.sh <Comp> <out.mp4> [--preview | --blur] [options] [-- extra remotion args]
#
#   bash scripts/render.sh Film out/preview.mp4 --preview      # fast check render (CRF 20, veryfast)
#   bash scripts/render.sh Film out/film.mp4                   # sharp master (CRF 14, x264 slow)
#   bash scripts/render.sh Film out/film.mp4 --blur            # motion-blurred master
#   bash scripts/render.sh Film out/act3.mp4 --blur --frames 600-839   # one act, for a splice
#
# Modes:
#   (default)  sharp master: one Remotion encode at CRF 14, BT.709 tagged (--color-space=bt709).
#   --preview  same pipeline, CRF 20 on x264 veryfast (about 3x faster to encode). Same tags as the
#              master, so colour and banding judgements carry over.
#   --blur     true motion blur: sharp render -> measure-speed.py writes out/samples.json (samples
#              per frame from optical flow) -> the sub-frame composition (<Comp>Sub, e.g. FilmSub)
#              renders every sub-frame with --props=out/samples.json -> accumulate.py averages
#              them in float, quantizes once (flat fields exact, dither only in smooth ramps) and
#              encodes BT.709 CRF 14. Before the sub-frame pass it prints the
#              sub-frame multiple and an estimate in minutes from the sharp pass's measured speed,
#              and it warns about moves too fast for clean blur. Typical films cost 3-8x a sharp
#              render; cap it with --budget. Render the blurred master once, after the last review.
#
# The source is bundled once at the start and every pass renders from that frozen bundle, so edits
# to src/ during a render are not in it; render.sh warns at the end if src/ changed meanwhile.
#
# Every mode then muxes the WAV with ffmpeg (AAC 320k, 48 kHz, +faststart; the audio is padded or
# trimmed to the picture) because Remotion's own AAC mux leaves ~2048 samples of encoder priming,
# i.e. audio 2-3 frames late. Then check-sync.py (lag <= 48 samples, true peak <= -1 dBTP after
# decode) and probe.py (size, fps, frame count, yuv420p, BT.709 tags, AAC 48 kHz) gate the file;
# reports go to out/qa/. Exit 0 = rendered and every gate passed, 1 = a step or gate failed.
#
# Options:
#   --audio FILE        soundtrack (default public/audio/soundtrack.wav)
#   --no-audio          silent deliverable (loops): no mux, no sync check, probe expects no audio
#   --loop              a seamless loop: every pass renders lossless PNG intermediates, because JPEG
#                       noise is smoothed by x264 between neighbours but not between the last frame
#                       and the first, which pushes the loop seam over its gate; check the seam with
#                       forensics.py --loop or deliver.sh --loop
#   --audio-offset F    film frame at which this composition starts (default: the --frames start;
#                       set it when rendering a per-act composition with sound)
#   --build-audio       first run scripts/export-cues.ts and scripts/audio/score.py to rebuild the WAV
#   --entry FILE        Remotion entry point (default src/index.ts)
#   --sub ID            sub-frame composition for --blur (default <Comp>Sub)
#   --frames A-B        render only film frames A..B (inclusive); audio is taken from the same range
#   --crf N             override the final CRF (preview 20, master 14, blur 14)
#   --10bit             (--blur) encode the master as yuv420p10le, High 10: the cleanest gradients and
#                       the smallest file, for masters that will be graded or re-encoded; ship 8-bit
#                       to the web, because many browsers and phones do not decode High 10
#   --concurrency N     Remotion concurrency (default: remotion.config.ts / Remotion default)
#   --samples FILE      where --blur writes the samples JSON (default out/samples.json)
#   --samples-from FILE reuse an existing samples JSON (skips the sharp render + measurement), e.g.
#                       the master's for a variant with identical timing
#   --budget X          cap the blur pass at X times the frame count (e.g. 6): the fastest frames get
#                       fewer samples and a shorter shutter; the capped frames are listed
#   --floor A-B:N       minimum samples over film frames A..B (repeatable; passed to measure-speed.py)
#   --accept-fast A-B   (--blur) frames A..B may exceed the speed ceiling (repeatable): only for frame-
#                       filling edges (a wipe, a flood, an iris, a zoom-through) checked at full size.
#                       Without it, moves listed as too fast for clean blur stop the render before the
#                       sub-frame pass: redesign them (a cut on the beat, a match cut, a shorter move)
#   --accept-cut A-B    (--blur) frames A..B may hold an unexplained full-frame change away from an act
#                       boundary (repeatable): a flood, a flash or a zoom-through you checked at full
#                       size. Without it, such a change stops the render before the sub-frame pass,
#                       because if it is a hard cut its sub-frames blend the two shots into one
#                       double-exposed frame: make the cut an ACT boundary in src/timeline.ts instead
#   --measure "ARGS"    extra measure-speed.py arguments, e.g. --measure "--max 64 --step 2"
#   --spec WxH@fps      extra expectation for probe.py (default: the composition's own size/fps)
#   --no-check          skip check-sync.py and probe.py
#   --keep              keep the work directory (bundle, sharp.mp4, sub.mp4, picture.mp4)
#   -- ARGS             passed to every `remotion render` call (e.g. -- --image-format=png --scale=0.5)
#
# Needs: node/npx with @remotion/cli, ffmpeg >= 6, python3 with numpy scipy soundfile opencv.
# Run it from the project root (the folder holding src/index.ts); the other scripts are found
# next to this one.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
die() { echo "render.sh: $*" >&2; exit 1; }
T0=$(date +%s)
step() { echo "[render $(( $(date +%s) - T0 ))s] $*" >&2; }

COMP=""; OUT=""; MODE=master; AUDIO=public/audio/soundtrack.wav; NOAUDIO=0; AOFF=""; BUILD_AUDIO=0
ENTRY=src/index.ts; SUB=""; FRAMES=""; CRF=""; CONC=""; SAMPLES=out/samples.json; SAMPLES_FROM=""
SPEC=""; NOCHECK=0; KEEP=0; MS_ARGS=(); EXTRA=(); BUDGET=""; TENBIT=0; LOOP=0; ACCEPT_FAST=""; ACCEPT_CUT=""
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --preview) MODE=preview ;;
    --blur) MODE=blur ;;
    --master) MODE=master ;;
    --audio) AUDIO=${2:?--audio needs a file}; shift ;;
    --no-audio) NOAUDIO=1 ;;
    --loop) LOOP=1 ;;
    --accept-fast) ACCEPT_FAST="$ACCEPT_FAST ${2:?}"; shift ;;
    --accept-cut) ACCEPT_CUT="$ACCEPT_CUT ${2:?}"; shift ;;
    --audio-offset) AOFF=${2:?}; shift ;;
    --build-audio) BUILD_AUDIO=1 ;;
    --entry) ENTRY=${2:?}; shift ;;
    --sub) SUB=${2:?}; shift ;;
    --frames) FRAMES=${2:?}; shift ;;
    --crf) CRF=${2:?}; shift ;;
    --10bit) TENBIT=1 ;;
    --concurrency) CONC=${2:?}; shift ;;
    --samples) SAMPLES=${2:?}; shift ;;
    --samples-from) SAMPLES_FROM=${2:?}; shift ;;
    --budget) BUDGET=${2:?--budget needs a multiple, e.g. 6}; MS_ARGS+=(--budget "$BUDGET"); shift ;;
    --floor) MS_ARGS+=(--floor "${2:?}"); shift ;;
    --measure) read -r -a _m <<< "${2:?}"; MS_ARGS+=(${_m[@]+"${_m[@]}"}); shift ;;
    --spec) SPEC=${2:?}; shift ;;
    --no-check) NOCHECK=1 ;;
    --keep) KEEP=1 ;;
    --) shift; EXTRA=("$@"); break ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) POS+=("$1") ;;
  esac
  shift
done
[[ ${#POS[@]} -eq 2 ]] || usage 1
[[ $TENBIT -eq 0 || $MODE == blur ]] || die "--10bit applies to --blur masters (accumulate.py encodes them)"
COMP=${POS[0]}; OUT=${POS[1]}

# project root: the current folder if it has the entry, else the folder above this script
if [[ ! -f "$ENTRY" ]]; then
  if [[ -f "$SCRIPT_DIR/../$ENTRY" ]]; then cd "$SCRIPT_DIR/.."; else die "no $ENTRY here; run from the project root or pass --entry"; fi
fi
ROOT=$(pwd)
for tool in npx ffmpeg ffprobe python3; do command -v "$tool" >/dev/null || die "$tool not found on PATH"; done
mkdir -p "$(dirname "$OUT")" out/qa
OUT_ABS=$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")
NAME=$(basename "${OUT%.*}")

if [[ $BUILD_AUDIO -eq 1 && $NOAUDIO -eq 0 ]]; then
  [[ -f "$SCRIPT_DIR/export-cues.ts" && -f "$SCRIPT_DIR/audio/score.py" ]] || die "--build-audio needs scripts/export-cues.ts and scripts/audio/score.py"
  step "rebuilding cues and soundtrack"
  npx tsx "$SCRIPT_DIR/export-cues.ts" >&2
  python3 "$SCRIPT_DIR/audio/score.py" --cues out/cues.json --score audio/score.json --out "$AUDIO" --stems out/stems --json out/qa/score.json >&2
fi
if [[ $NOAUDIO -eq 0 ]]; then
  [[ -f "$AUDIO" ]] || die "soundtrack $AUDIO not found (build it, pass --audio FILE, or --no-audio for a silent film)"
  newer=$(find src -type f -newer "$AUDIO" 2>/dev/null | head -1 || true)
  [[ -z "$newer" ]] || echo "render.sh: warning: $newer is newer than $AUDIO; if timing changed, rerun cues + audio (or pass --build-audio)" >&2
fi

WORK=$(mktemp -d "${TMPDIR:-/tmp}/cinetic-render.XXXXXX")
if [[ $KEEP -eq 1 ]]; then echo "render.sh: keeping work files in $WORK" >&2; else trap 'rm -rf "$WORK"' EXIT; fi

step "bundling $ENTRY"
touch "$WORK/.bundled"
npx remotion bundle "$ENTRY" --out-dir "$WORK/bundle" --log=error >/dev/null || die "bundle failed"
B="$WORK/bundle"
step "frozen bundle: $B (every pass renders from it; edits to src/ from now on are not in this render)"
LIST=$(npx remotion compositions "$B" 2>/dev/null) || die "could not list compositions"
meta() { awk -v id="$1" '$1 == id && $2 ~ /^[0-9.]+$/ && $3 ~ /^[0-9]+x[0-9]+$/ { print $2, $3, $4; exit }' <<< "$LIST"; }
read -r FPS SIZE TOTAL <<< "$(meta "$COMP")" || true
if [[ -z "${FPS:-}" ]]; then
  ids=$(awk '$2 ~ /^[0-9.]+$/ && $3 ~ /x/ {printf "%s ", $1}' <<< "$LIST")
  die "no video composition '$COMP' (stills render with 'npx remotion still'). Available: $ids"
fi

FROM=0; TO=$((TOTAL - 1)); RANGE=()
if [[ -n "$FRAMES" ]]; then
  [[ "$FRAMES" =~ ^([0-9]+)-([0-9]+)$ ]] || die "--frames wants A-B, e.g. 600-839"
  FROM=${BASH_REMATCH[1]}; TO=${BASH_REMATCH[2]}
  (( FROM <= TO && TO < TOTAL )) || die "--frames $FRAMES outside $COMP (0-$((TOTAL - 1)))"
  RANGE=(--frames="$FROM-$TO")
fi
N=$((TO - FROM + 1))
DUR=$(python3 -c "print(f'{$N/$FPS:.3f}')")
AOFF=${AOFF:-$FROM}
AOFF_S=$(python3 -c "print(f'{$AOFF/$FPS:.6f}')")
RARGS=(--muted --log=error)
[[ -n "$CONC" ]] && RARGS+=(--concurrency="$CONC")
[[ $LOOP == 1 ]] && RARGS+=(--image-format=png)
RARGS+=(${EXTRA[@]+"${EXTRA[@]}"})
PIC="$WORK/picture.mp4"
step "$COMP: ${SIZE}@${FPS}, frames $FROM-$TO ($N f, ${DUR}s), mode $MODE"

case "$MODE" in
  preview|master)
    if [[ $MODE == preview ]]; then Q=(--crf="${CRF:-20}" --x264-preset=veryfast); else Q=(--crf="${CRF:-14}" --x264-preset=slow); fi
    step "rendering $COMP ($MODE)"
    npx remotion render "$B" "$COMP" "$PIC" ${RANGE[@]+"${RANGE[@]}"} ${Q[@]+"${Q[@]}"} --pixel-format=yuv420p --color-space=bt709 ${RARGS[@]+"${RARGS[@]}"} \
      || die "remotion render failed"
    ;;
  blur)
    SUB=${SUB:-${COMP}Sub}
    [[ -n "$(meta "$SUB")" ]] || die "--blur needs the sub-frame composition '$SUB' (register it in Root.tsx, pass --sub ID, or blur one act with: render.sh Film out.mp4 --blur --frames A-B)"
    mkdir -p "$(dirname "$SAMPLES")"
    if [[ -n "$SAMPLES_FROM" ]]; then
      [[ -f "$SAMPLES_FROM" ]] || die "--samples-from $SAMPLES_FROM not found"
      if [[ -n "$BUDGET" ]]; then  # re-decide the groups from the saved speed track under the budget
        python3 "$SCRIPT_DIR/measure-speed.py" "$SAMPLES_FROM" "$WORK/samples.json" ${MS_ARGS[@]+"${MS_ARGS[@]}"} >/dev/null || die "measure-speed.py failed"
        cp "$WORK/samples.json" "$SAMPLES"
      else
        [[ "$(cd "$(dirname "$SAMPLES_FROM")" && pwd)/$(basename "$SAMPLES_FROM")" == "$(cd "$(dirname "$SAMPLES")" && pwd)/$(basename "$SAMPLES")" ]] || cp "$SAMPLES_FROM" "$SAMPLES"
      fi
      step "reusing samples from $SAMPLES_FROM"
    else
      step "rendering sharp pass for speed measurement"
      # intermediates keep Chromium's native full-range JPEG colour (--color-space=default): no
      # matrix conversion before accumulate.py, which decodes with the file's own tags
      TS=$(python3 -c 'import time; print(time.time())')
      npx remotion render "$B" "$COMP" "$WORK/sharp.mp4" ${RANGE[@]+"${RANGE[@]}"} --crf=12 --x264-preset=veryfast --color-space=default ${RARGS[@]+"${RARGS[@]}"} \
        || die "sharp render failed"
      SPF=$(python3 -c "import time; print(round((time.time() - $TS) / $N, 4))")
      step "measuring on-screen speed -> $SAMPLES"
      CUES=(); [[ -f out/cues.json ]] && CUES=(--cues out/cues.json)
      python3 "$SCRIPT_DIR/measure-speed.py" "$WORK/sharp.mp4" "$SAMPLES" --offset "$FROM" ${CUES[@]+"${CUES[@]}"} ${MS_ARGS[@]+"${MS_ARGS[@]}"} >/dev/null \
        || die "measure-speed.py failed"
      # remember the measured throughput, so a later --samples-from run can estimate too
      python3 - "$SAMPLES" "$SPF" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d['sharp_s_per_frame'] = float(sys.argv[2]); json.dump(d, open(sys.argv[1], 'w'))
PY
    fi
    read -r SA SB <<< "$(python3 - "$SAMPLES" "$FROM" "$TO" <<'PY'
import json, sys
g = [max(1, int(x)) for x in json.load(open(sys.argv[1]))['groups']]
a, b = int(sys.argv[2]), int(sys.argv[3])
g += [1] * max(0, b + 1 - len(g))  # FilmSub renders missing entries once
before = sum(g[:a])
print(before, before + sum(g[a:b + 1]) - 1)
PY
)"
    # The estimate, measured on the starter (4 CPUs): a sub-frame renders in about the time of a
    # sharp frame, and the float accumulation costs about 0.75 of that again per sub-frame.
    FASTRC=0
    python3 - "$SAMPLES" "$FROM" "$TO" "$((SB - SA + 1))" "$ACCEPT_FAST" "$ACCEPT_CUT" <<'PY' >&2 || FASTRC=$?
import json, sys
d = json.load(open(sys.argv[1])); a, b, sub = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
rng_of = lambda r: tuple(int(v) for v in (r.split('-') if '-' in r else (r, r)))
acc = [rng_of(r) for r in sys.argv[5].split()]
acc_cut = [rng_of(r) for r in sys.argv[6].split()]
n = b - a + 1
spf = d.get('sharp_s_per_frame')
est = f', about {max(1, round(sub * spf * 1.75 / 60))} min at {spf:.3f} s per sharp frame' if spf else ''
print(f'render.sh: blur pass: {n} frames -> {sub} sub-frames ({sub / n:.1f}x){est}')
tf = [r for r in d.get('too_fast', []) if r[1] >= a and r[0] <= b]
left = [(x, y) for x, y in tf if not any(p <= x and y <= q for p, q in acc)]
if sub / n > 8 and not d.get('budget'):
    print('render.sh: note: over 8x; pass --budget 6 to cap it, or slow the fastest moves')
if left:
    rng = ', '.join(f'{x}-{y}' for x, y in left[:6])
    print(f'render.sh: too fast for clean blur at frames {rng} (> {d.get("too_fast_px_f", 80):g} px/f, peak '
          f'{d.get("peak")} px/f): blur will show stepped copies there. Redesign those moves (a cut on the beat, a match '
          f'cut, a mask wipe, a shorter distance), or, for a frame-filling edge you checked at full size, pass --accept-fast A-B.')
    sys.exit(3)
# unexplained full-frame changes inside an act (hard cuts measured as such already render sharp)
hard = set(d.get('cuts', []))
odd = [c for c in d.get('cuts_inside_acts', []) if a <= c <= b and c not in hard
       and not any(p <= c <= q for p, q in acc + acc_cut)]
if odd:
    print(f'render.sh: frames {", ".join(map(str, odd[:8]))} change in a way the flow cannot explain, away from any act '
          'boundary. If one is a hard cut, its sub-frames will blend the two shots into a double-exposed frame: make it '
          'an ACT boundary in src/timeline.ts. If it is a flood, a flash or a zoom-through you checked at full size, '
          'pass --accept-cut A-B.')
    sys.exit(4)
PY
    [[ $FASTRC -eq 3 ]] && die "stopped before the sub-frame pass: moves too fast for clean blur (see above)"
    [[ $FASTRC -eq 4 ]] && die "stopped before the sub-frame pass: a possible cut inside an act (see above)"
    step "rendering $SUB sub-frames $SA-$SB ($((SB - SA + 1)) sub-frames for $N frames)"
    npx remotion render "$B" "$SUB" "$WORK/sub.mp4" --props="$(cd "$(dirname "$SAMPLES")" && pwd)/$(basename "$SAMPLES")" \
      --frames="$SA-$SB" --crf=6 --x264-preset=veryfast --pixel-format=yuv444p --color-space=default ${RARGS[@]+"${RARGS[@]}"} \
      || die "sub-frame render failed"
    step "accumulating in float -> BT.709 CRF ${CRF:-14}$([[ $TENBIT -eq 1 ]] && echo ', 10-bit')"
    ACC=(--crf "${CRF:-14}"); [[ $TENBIT -eq 1 ]] && ACC+=(--10bit)
    python3 "$SCRIPT_DIR/accumulate.py" "$WORK/sub.mp4" "$SAMPLES" "$PIC" --start "$FROM" --count "$N" ${ACC[@]+"${ACC[@]}"} --quiet >/dev/null \
      || die "accumulate.py failed"
    ;;
esac

GOT=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$PIC")
[[ "$GOT" -eq "$N" ]] || die "picture has $GOT frames, expected $N"

if [[ $NOAUDIO -eq 1 ]]; then
  step "writing $OUT (no audio)"
  ffmpeg -v error -y -i "$PIC" -map 0:v:0 -c copy -movflags +faststart "$OUT_ABS" || die "ffmpeg copy failed"
else
  ADUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO")
  python3 - "$ADUR" "$AOFF_S" "$DUR" "$FPS" "$([[ -n "$FRAMES" ]] && echo 1 || echo 0)" <<'PY' >&2 || true
import sys
adur, off, dur, fps, excerpt = map(float, sys.argv[1:])
need = off + dur
if adur < need - 1 / fps:
    print(f'render.sh: warning: soundtrack is {adur:.3f}s, picture needs {need:.3f}s; padding with silence')
elif off == 0 and not excerpt and adur > need + 1.0:
    print(f'render.sh: warning: soundtrack runs {adur - need:.2f}s past the picture; trimming it (check TOTAL / the tail)')
PY
  step "muxing $AUDIO (from ${AOFF_S}s) -> $OUT"
  ffmpeg -v error -y -i "$PIC" -ss "$AOFF_S" -i "$AUDIO" -map 0:v:0 -map 1:a:0 -c:v copy \
    -af apad -c:a aac -b:a 320k -ar 48000 -ac 2 -t "$DUR" -movflags +faststart "$OUT_ABS" || die "ffmpeg mux failed"
fi

STATUS=0
if [[ $NOCHECK -eq 0 ]]; then
  if [[ $NOAUDIO -eq 0 ]]; then
    step "check-sync"
    python3 "$SCRIPT_DIR/check-sync.py" "$OUT_ABS" "$AUDIO" --ref-offset "$AOFF_S" --json "out/qa/sync-$NAME.json" >/dev/null || STATUS=1
  fi
  step "probe"
  PARGS=(--spec "${SPEC:-${SIZE}@${FPS}}" --frames "$N" --json "out/qa/probe-$NAME.json" --no-loudness)
  [[ $NOAUDIO -eq 1 ]] && PARGS+=(--audio none)
  [[ $TENBIT -eq 1 ]] && PARGS+=(--pix-fmt yuv420p10le)
  python3 "$SCRIPT_DIR/probe.py" "$OUT_ABS" ${PARGS[@]+"${PARGS[@]}"} >/dev/null || STATUS=1
fi

SIZE_MB=$(python3 -c "import os;print(f'{os.path.getsize(\"$OUT_ABS\")/1e6:.1f}')")
changed=$(find src -type f -newer "$WORK/.bundled" 2>/dev/null | head -3 | tr '\n' ' ' || true)
[[ -z "$changed" ]] || echo "render.sh: warning: src/ changed while this rendered ($changed); $OUT shows the source as it was when bundled" >&2
if [[ $MODE == blur && -f "$SAMPLES" ]]; then
  FAST=$(python3 -c "import json;d=json.load(open('$SAMPLES'));print(' '.join(str(f - $FROM) for f in d.get('fastest_frames', [])[:4] if $FROM <= f <= $TO))" 2>/dev/null || true)
  [[ -z "$FAST" ]] || echo "render.sh: look at the fastest frames at full size for stepped copies: bash scripts/grab.sh $OUT $FAST" >&2
fi
if [[ $STATUS -eq 0 ]]; then
  step "done: $OUT (${SIZE_MB} MB, ${DUR}s, $MODE)"
else
  step "FAILED a gate: $OUT written (${SIZE_MB} MB) but see the report above and out/qa/*-$NAME.json"
fi
exit $STATUS
