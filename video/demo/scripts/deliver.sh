#!/usr/bin/env bash
# deliver.sh: turn a finished master into its deliverables, each checked.
#
# Usage:
#   bash scripts/deliver.sh <master.mp4> [options]
#
#   bash scripts/deliver.sh out/film.mp4                                 # poster only
#   bash scripts/deliver.sh out/loop.mp4 --loop --gif --webm             # landing-page loop set
#   bash scripts/deliver.sh out/sting.mp4 --alpha StingAlpha,StingAlphaClear   # + ProRes 4444 with alpha
#   bash scripts/deliver.sh out/film.mp4 --variants Film9x16,Film1x1     # re-laid-out social cuts
#
# What it writes (into --out-dir, default out/deliver/). The top level holds only deliverables, the
# folder a client opens; every report goes in its qa/ subfolder:
#   poster.png / poster.jpg   the final frame (the final frame is the poster), or --poster-frame N,
#                             taken from a clean source, not decoded from the lossy master (an H.264
#                             frame bakes 4:2:0 chroma and block smear into the still): --poster-from
#                             PNG, else a Remotion still of --comp (npx remotion still, same frame),
#                             else the lossless last frame hf-finish.sh keeps (qa/<name>-last-frame.png
#                             next to the master); the source must match the master's frame. Only if
#                             none does is the master's frame used, with a warning
#   <name>-loop.mp4           --loop: muted, faststart copy, plus a loop-seam check: the step from
#                             the last frame back to frame 0 must look like the steps around it
#                             (seam MAD <= max(0.4, 1.5x the median of the 8 steps at each end);
#                             the report is qa/loop-seam.json)
#   <name>.gif                --gif: two-pass palettegen/paletteuse (25 fps, 960 px wide by default)
#   <name>.webm               --webm: VP9 CRF 32, or 26 with --loop so the seam survives (Opus audio unless --loop), BT.709 tagged
#   <Comp>.mov                --alpha Comp[,Comp2]: Remotion ProRes 4444, yuva444p10le, PNG frames, BT.709
#                             (a sting ships two: one that ends on the lockup, one that clears)
#   <Comp>-alpha.webm         --alpha-webm: VP9 with alpha (yuva420p) of the same composition
#   <Comp>.mp4                --variants A,B: each composition through render.sh (sharp master, or
#                             blurred with --variant-samples)
#   qa/manifest.json          every file with its probe facts and check results
#
# Options:
#   --out-dir DIR        output folder (default out/deliver)
#   --poster-frame N     poster from frame N instead of the last frame
#   --poster-from PNG    the poster's clean source, a lossless still of that frame (e.g. a kept
#                        HyperFrames frame)
#   --comp ID            the composition the master was rendered from, for the poster still
#                        (default Film)
#   --gif-fps N          GIF frame rate (default 25; GIF delays are whole 1/100 s, so 25 or 50 play
#                        at the true rate while 30 plays 11% fast)
#   --gif-width N        GIF width in px (default 960)
#   --gif-max-mb N       warn above this size (default 8)
#   --gif-dither D       paletteuse dither: sierra2_4a (default), bayer, floyd_steinberg, none
#   --webm-crf N         VP9 CRF (default 32; 26 with --loop, because CRF 32 smears the seam past its gate)
#   --alpha-frames A-B   render only this range of the alpha composition (tests)
#   --alpha-props JSON   --props for the alpha render, e.g. '{"transparent":true}'
#   --entry FILE         Remotion entry for --alpha/--variants (default src/index.ts)
#   --audio FILE         soundtrack for --variants (default public/audio/soundtrack.wav)
#   --variant-samples F  blur the variants with the master's samples JSON (render.sh --blur
#                        --samples-from F): only when their timing is identical to the master's.
#                        Without it, variants render sharp, which is right when their fastest
#                        motion is <= 12 px/f.
# Exit 0 = everything written and every check passed, 1 = a step or check failed.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
die() { echo "deliver.sh: $*" >&2; exit 1; }
step() { echo "[deliver] $*" >&2; }

OUTDIR=out/deliver; POSTER_FRAME=""; LOOP=0; GIF=0; WEBM=0; ALPHA=""; ALPHA_WEBM=0; VARIANTS=""
GIF_FPS=25; GIF_W=960; GIF_MAX=8; GIF_DITHER=sierra2_4a; WEBM_CRF=""; ALPHA_FRAMES=""; ALPHA_PROPS=""
ENTRY=src/index.ts; AUDIO=public/audio/soundtrack.wav; VSAMPLES=""; POS=(); POSTER_FROM=""; COMP=Film
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --out-dir) OUTDIR=${2:?}; shift ;;
    --poster-frame) POSTER_FRAME=${2:?}; shift ;;
    --poster-from) POSTER_FROM=${2:?}; shift ;;
    --comp) COMP=${2:?}; shift ;;
    --loop) LOOP=1 ;;
    --gif) GIF=1 ;;
    --webm) WEBM=1 ;;
    --alpha) ALPHA=${2:?}; shift ;;
    --alpha-webm) ALPHA_WEBM=1 ;;
    --alpha-frames) ALPHA_FRAMES=${2:?}; shift ;;
    --alpha-props) ALPHA_PROPS=${2:?}; shift ;;
    --variants) VARIANTS=${2:?}; shift ;;
    --gif-fps) GIF_FPS=${2:?}; shift ;;
    --gif-width) GIF_W=${2:?}; shift ;;
    --gif-max-mb) GIF_MAX=${2:?}; shift ;;
    --gif-dither) GIF_DITHER=${2:?}; shift ;;
    --webm-crf) WEBM_CRF=${2:?}; shift ;;
    --entry) ENTRY=${2:?}; shift ;;
    --audio) AUDIO=${2:?}; shift ;;
    --variant-samples) VSAMPLES=${2:?}; shift ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) POS+=("$1") ;;
  esac
  shift
done
[[ ${#POS[@]} -eq 1 ]] || usage 1
MASTER=${POS[0]}
[[ -f "$MASTER" ]] || die "master $MASTER not found"
command -v ffmpeg >/dev/null || die "ffmpeg not found"
mkdir -p "$OUTDIR/qa"
QA="$OUTDIR/qa"
NAME=$(basename "${MASTER%.*}")
STATUS=0
CHECKS="$QA/.checks.jsonl"; : > "$CHECKS"
note() { printf '%s\n' "$1" >> "$CHECKS"; }

read -r W H FPS N HAS_AUDIO <<< "$(python3 - "$MASTER" <<'PY'
import json, subprocess, sys
from fractions import Fraction
d = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-show_streams', '-of', 'json', sys.argv[1]],
                              capture_output=True, text=True, check=True).stdout)
v = next(s for s in d['streams'] if s['codec_type'] == 'video')
a = any(s['codec_type'] == 'audio' for s in d['streams'])
print(v['width'], v['height'], float(Fraction(v['avg_frame_rate'])), v['nb_read_packets'], int(a))
PY
)"
step "$MASTER: ${W}x${H}@${FPS}, $N frames, audio $([[ $HAS_AUDIO -eq 1 ]] && echo yes || echo no)"
TO_RGB="scale=in_color_matrix=auto:in_range=auto:flags=accurate_rnd+full_chroma_int,format=rgb24"

# poster: the master's own frame first (the reference, and the fallback), then a clean source
if [[ -n "$POSTER_FRAME" ]]; then
  [[ "$POSTER_FRAME" =~ ^[0-9]+$ && "$POSTER_FRAME" -lt "$N" ]] || die "--poster-frame $POSTER_FRAME outside 0-$((N - 1))"
  ffmpeg -v error -y -i "$MASTER" -vf "select=eq(n\,$POSTER_FRAME),$TO_RGB" -vsync 0 -frames:v 1 "$QA/.poster-master.png"
else  # the last frame (decode only the last second)
  ffmpeg -v error -y -sseof -1 -i "$MASTER" -vf "$TO_RGB" -update 1 "$QA/.poster-master.png"
fi
[[ -s "$QA/.poster-master.png" ]] || die "poster extraction failed"
PF=${POSTER_FRAME:-$((N - 1))}
CLEAN="$QA/.poster-clean.png"; rm -f "$CLEAN"; PSRC=""; WHY=()
HF_LAST="$(dirname "$MASTER")/qa/$NAME-last-frame.png"
if [[ -n "$POSTER_FROM" ]]; then
  [[ -f "$POSTER_FROM" ]] || die "--poster-from $POSTER_FROM not found"
  ffmpeg -v error -y -i "$POSTER_FROM" -vf format=rgb24 -frames:v 1 "$CLEAN" && PSRC="$POSTER_FROM"
elif [[ -f "$ENTRY" ]] && command -v npx >/dev/null; then
  PW=$(mktemp -d "${TMPDIR:-/tmp}/cinetic-poster.XXXXXX")
  if npx remotion bundle "$ENTRY" --out-dir "$PW/bundle" --log=error >/dev/null 2>&1; then
    CM=$(npx remotion compositions "$PW/bundle" 2>/dev/null \
      | awk -v id="$COMP" '$1 == id && $2 ~ /^[0-9.]+$/ && $3 ~ /^[0-9]+x[0-9]+$/ { print $3, $4; exit }' || true)
    if [[ "$CM" != "${W}x${H} $N" ]]; then
      WHY+=("composition $COMP is ${CM:-not in $ENTRY}, the master ${W}x${H} $N frames (pass --comp)")
    elif npx remotion still "$PW/bundle" "$COMP" "$CLEAN" --frame="$PF" --image-format=png --log=error >/dev/null 2>&1; then
      PSRC="npx remotion still $COMP --frame=$PF"
    else
      WHY+=("npx remotion still $COMP failed")
    fi
  else
    WHY+=("could not bundle $ENTRY")
  fi
  rm -rf "$PW"
elif [[ -f "$HF_LAST" && "$PF" -eq $((N - 1)) ]]; then
  ffmpeg -v error -y -i "$HF_LAST" -vf format=rgb24 -frames:v 1 "$CLEAN" && PSRC="$HF_LAST"
elif [[ -f "$HF_LAST" ]]; then
  WHY+=("$HF_LAST holds the last frame, not frame $PF; pass --poster-from PNG")
else
  WHY+=("no $ENTRY (Remotion) and no $HF_LAST (hf-finish.sh); pass --poster-from PNG")
fi
if [[ -n "$PSRC" ]]; then  # the clean still must show the master's frame: same size, same picture
  if ! MATCH=$(python3 - "$CLEAN" "$QA/.poster-master.png" <<'PY'
import subprocess, sys
import numpy as np
def rgb(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                        '-of', 'csv=p=0', p], capture_output=True, text=True, check=True).stdout.split(',')
    w, h = int(r[0]), int(r[1])
    b = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-vf', 'format=rgb24', '-f', 'rawvideo', '-'],
                       capture_output=True, check=True).stdout
    return np.frombuffer(b, np.uint8).reshape(h, w, 3).astype(np.int16)
a, b = rgb(sys.argv[1]), rgb(sys.argv[2])
if a.shape != b.shape:
    print(f'it is {a.shape[1]}x{a.shape[0]}, the master {b.shape[1]}x{b.shape[0]}'); sys.exit(1)
d = np.abs(a - b)
mad, far = float(d.mean()), float((d.max(axis=2) > 32).mean())
# the same frame measures MAD < 1 and < 0.1% of pixels off by > 32 (4:2:0 edges, blur); a neighbouring frame 0.4%
print(f'MAD {mad:.2f}, {100 * far:.2f}% of pixels off by > 32 levels')
sys.exit(0 if mad <= 2.0 and far <= 0.0025 else 1)
PY
  ); then
    WHY+=("$PSRC does not match the master's frame $PF ($MATCH): a stale render, the wrong --comp or frame")
    PSRC=""
  fi
fi
if [[ -n "$PSRC" ]]; then
  mv -f "$CLEAN" "$OUTDIR/poster.png"; rm -f "$QA/.poster-master.png"
  step "poster.png / poster.jpg (frame $PF, from $PSRC; $MATCH against the master)"
  note '{"file":"poster.png","check":"poster_source","pass":true,"source":"clean","frame":'"$PF"'}'
else
  mv -f "$QA/.poster-master.png" "$OUTDIR/poster.png"; rm -f "$CLEAN"
  echo "deliver.sh: warning: poster.png is frame $PF decoded from the lossy master, so it carries 4:2:0 chroma and any" \
       "block smear on flat fields: ${WHY[*]:-no clean source}" >&2
  step "poster.png / poster.jpg (frame $PF, from the master)"
  note '{"file":"poster.png","check":"poster_source","pass":true,"source":"master","frame":'"$PF"'}'
fi
ffmpeg -v error -y -i "$OUTDIR/poster.png" -q:v 2 "$OUTDIR/poster.jpg"

if [[ $LOOP -eq 1 ]]; then
  ffmpeg -v error -y -i "$MASTER" -map 0:v:0 -c copy -an -movflags +faststart "$OUTDIR/$NAME-loop.mp4"
  if python3 - "$MASTER" "$QA/loop-seam.json" <<'PY' >&2
import json, subprocess, sys
import numpy as np
src, out = sys.argv[1:3]
W, H = 480, 270
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'scale={W}:{H}:flags=area,format=rgb24', '-f', 'rawvideo', '-'],
                     capture_output=True, check=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.int16)
d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2, 3))            # step i -> i+1
seam = float(np.abs(fr[0] - fr[-1]).mean())                      # last frame -> frame 0
ends = np.concatenate([d[:8], d[-8:]])                            # the steps around the wrap
local = float(np.median(ends)) if len(ends) else 0.0
limit = max(0.4, 1.5 * local)                                     # same rule as forensics.py --loop
ok = seam <= limit
res = {'check': 'loop_seam', 'pass': bool(ok), 'seam_mad': round(seam, 3), 'median_step_at_ends': round(local, 3),
       'limit': round(limit, 3), 'median_step': round(float(np.median(d)), 3) if len(d) else None,
       'rule': 'seam <= max(0.4, 1.5 x median of the 8 steps at each end)'}
json.dump(res, open(out, 'w'), indent=1)
print(f"  loop seam MAD {seam:.3f}, limit {limit:.3f} (median step at the ends {local:.3f}): "
      + ('OK' if ok else 'FAIL: the last frame does not flow into frame 0 (match state and velocity; whole bars)'))
sys.exit(0 if ok else 1)
PY
  then note '{"file":"'"$NAME-loop.mp4"'","check":"loop_seam","pass":true}'
  else note '{"file":"'"$NAME-loop.mp4"'","check":"loop_seam","pass":false}'; STATUS=1; fi
  step "$NAME-loop.mp4 (muted)"
fi

if [[ $GIF -eq 1 ]]; then
  F="scale=${GIF_W}:-2:flags=lanczos:in_color_matrix=auto:in_range=auto,format=rgb24,fps=${GIF_FPS}"
  ffmpeg -v error -y -i "$MASTER" -vf "$F,palettegen=max_colors=256:stats_mode=full" "$QA/.palette.png"
  ffmpeg -v error -y -i "$MASTER" -i "$QA/.palette.png" -lavfi "$F[x];[x][1:v]paletteuse=dither=${GIF_DITHER}:diff_mode=rectangle" \
    -loop 0 "$OUTDIR/$NAME.gif"
  rm -f "$QA/.palette.png"
  mb=$(python3 -c "import os;print(round(os.path.getsize('$OUTDIR/$NAME.gif')/1e6,2))")
  if python3 -c "import sys; sys.exit(0 if $mb <= $GIF_MAX else 1)"; then
    note '{"file":"'"$NAME.gif"'","check":"size","pass":true,"mb":'"$mb"'}'
  else
    note '{"file":"'"$NAME.gif"'","check":"size","pass":false,"mb":'"$mb"'}'
    echo "deliver.sh: warning: $NAME.gif is $mb MB (> $GIF_MAX): lower --gif-width/--gif-fps, shorten the loop or ship the WebM/MP4" >&2
  fi
  step "$NAME.gif (${GIF_W}px, ${GIF_FPS} fps, $mb MB)"
fi

if [[ $WEBM -eq 1 ]]; then
  [[ -z "$WEBM_CRF" ]] && { [[ $LOOP -eq 1 ]] && WEBM_CRF=26 || WEBM_CRF=32; }
  AUD=(-an); [[ $HAS_AUDIO -eq 1 && $LOOP -eq 0 ]] && AUD=(-c:a libopus -b:a 160k)
  ffmpeg -v error -y -i "$MASTER" -map 0:v:0 $([[ $HAS_AUDIO -eq 1 && $LOOP -eq 0 ]] && echo "-map 0:a:0") \
    -c:v libvpx-vp9 -crf "$WEBM_CRF" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv ${AUD[@]+"${AUD[@]}"} "$OUTDIR/$NAME.webm" \
    || die "webm encode failed"
  step "$NAME.webm (VP9 CRF $WEBM_CRF$([[ ${AUD[0]} == -an ]] && echo ', muted'))"
fi

if [[ -n "$ALPHA" ]]; then
 IFS=',' read -r -a ALPHAS <<< "$ALPHA"
 for ALPHA in ${ALPHAS[@]+"${ALPHAS[@]}"}; do
  command -v npx >/dev/null || die "--alpha needs npx/Remotion"
  [[ -f "$ENTRY" ]] || die "--alpha needs the Remotion entry $ENTRY (run from the project root)"
  RA=(--muted --log=error --image-format=png --color-space=bt709)
  [[ -n "$ALPHA_FRAMES" ]] && RA+=(--frames="$ALPHA_FRAMES")
  [[ -n "$ALPHA_PROPS" ]] && RA+=(--props="$ALPHA_PROPS")
  step "rendering $ALPHA as ProRes 4444 with alpha"
  npx remotion render "$ENTRY" "$ALPHA" "$OUTDIR/$ALPHA.mov" --codec=prores --prores-profile=4444 \
    --pixel-format=yuva444p10le ${RA[@]+"${RA[@]}"} || die "alpha render failed"
  if [[ $ALPHA_WEBM -eq 1 ]]; then
    npx remotion render "$ENTRY" "$ALPHA" "$OUTDIR/$ALPHA-alpha.webm" --codec=vp9 --pixel-format=yuva420p ${RA[@]+"${RA[@]}"} \
      || die "VP9 alpha render failed"
  fi
  if python3 - "$OUTDIR/$ALPHA.mov" <<'PY' >&2
import json, subprocess, sys
import numpy as np
f = sys.argv[1]
s = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,profile',
                               '-of', 'json', f], capture_output=True, text=True).stdout)['streams'][0]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-vf', 'scale=320:-2', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
                     capture_output=True).stdout
a = np.frombuffer(raw, np.uint8)[3::4]
clear = float((a < 250).mean()) if len(a) else 0.0
# Remotion encodes yuva444p10le; ffprobe reports the ProRes decoder's format, yuva444p12le
ok = s.get('codec_name') == 'prores' and str(s.get('pix_fmt', '')).startswith('yuva444p')
print(f"  {f}: {s.get('codec_name')} {s.get('profile')} {s.get('pix_fmt')}, first frame {clear:.0%} non-opaque"
      + ('' if clear > 0 else ' (warning: fully opaque; paint no background when rendering the alpha version)'))
sys.exit(0 if ok else 1)
PY
  then note '{"file":"'"$ALPHA.mov"'","check":"prores_alpha","pass":true}'
  else note '{"file":"'"$ALPHA.mov"'","check":"prores_alpha","pass":false}'; STATUS=1; fi
 done
fi

if [[ -n "$VARIANTS" ]]; then
  IFS=',' read -r -a VS <<< "$VARIANTS"
  for V in ${VS[@]+"${VS[@]}"}; do
    step "rendering variant $V"
    VA=(); [[ $HAS_AUDIO -eq 1 ]] && VA=(--audio "$AUDIO") || VA=(--no-audio)
    [[ -n "$VSAMPLES" ]] && VA+=(--blur --samples-from "$VSAMPLES" --samples "$QA/samples-$V.json")
    if bash "$SCRIPT_DIR/render.sh" "$V" "$OUTDIR/$V.mp4" ${VA[@]+"${VA[@]}"} --entry "$ENTRY"; then
      note '{"file":"'"$V.mp4"'","check":"render","pass":true}'
    else
      note '{"file":"'"$V.mp4"'","check":"render","pass":false}'; STATUS=1
    fi
  done
fi

python3 - "$OUTDIR" "$CHECKS" "$MASTER" <<'PY'
import json, os, subprocess, sys
from fractions import Fraction
outdir, checks, master = sys.argv[1:4]
items = []
for name in sorted(os.listdir(outdir)):
    p = os.path.join(outdir, name)
    if name.startswith('.') or not os.path.isfile(p):
        continue  # the qa/ folder and hidden files are not deliverables
    e = {'file': name, 'mb': round(os.path.getsize(p) / 1e6, 3)}
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', p], capture_output=True, text=True)
    if r.returncode == 0:
        d = json.loads(r.stdout)
        v = next((s for s in d.get('streams', []) if s['codec_type'] == 'video'), None)
        if v:
            e.update(codec=v['codec_name'], size=f"{v['width']}x{v['height']}", pix_fmt=v.get('pix_fmt'))
            try:
                fr = float(Fraction(v.get('avg_frame_rate', '0/1')))
                if fr > 0 and d['format'].get('duration'):
                    e.update(fps=round(fr, 3), seconds=round(float(d['format']['duration']), 3))
            except (ValueError, ZeroDivisionError):
                pass
            e['audio'] = any(s['codec_type'] == 'audio' for s in d['streams'])
    items.append(e)
res = [json.loads(l) for l in open(checks) if l.strip()]
m = {'master': master, 'files': items, 'checks': res, 'pass': all(c.get('pass', True) for c in res)}
json.dump(m, open(os.path.join(outdir, 'qa', 'manifest.json'), 'w'), indent=1)
for e in items:
    print(f"  {e['file']:<28} {e['mb']:>8.2f} MB  {e.get('codec', '')} {e.get('size', '')} {e.get('pix_fmt', '') or ''}", file=sys.stderr)
PY
rm -f "$CHECKS"
stray=$(find "$OUTDIR" -maxdepth 1 -type f \( -name '*.json' -o -name 'sheet*' -o -name 'qa-*' -o -name '*.log' \) | head -3 | tr '\n' ' ')
[[ -z "$stray" ]] || echo "deliver.sh: warning: QA files at the top of $OUTDIR ($stray); move them into $QA, the top level is for deliverables" >&2
step "$([[ $STATUS -eq 0 ]] && echo 'done' || echo 'FAILED a check'): $QA/manifest.json"
exit $STATUS
