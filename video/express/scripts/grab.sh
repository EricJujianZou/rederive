#!/usr/bin/env bash
# grab.sh - exact frame grabs from a video, by frame number (frame = t * fps, 0-based).
#
# Usage:
#   bash scripts/grab.sh out/film.mp4 405 1796 1790-1800 [--out out/qa/frames] [--width 960] [--crop w:h:x:y]
#
# Each frame f is sought with -ss (f - 0.5)/fps, so ffmpeg's accurate seek returns frame f itself
# (seeking to f/fps lands a frame early or late on some files), and -fps_mode passthrough stops
# ffmpeg from duplicating the first frame of a range. A range a-b is decoded in one pass.
# Files are written as <out>/f<frame, 5 digits>.png (full resolution unless --width/--crop).
# Prints one written path per line. Exit: 0 ok, 1 a grab failed, 2 usage error.
set -euo pipefail

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-2}"; }
case "${1:-}" in -h|--help) usage 0 ;; esac
[ $# -lt 2 ] && usage

VIDEO=$1; shift
[ -f "$VIDEO" ] || { echo "grab.sh: no such file: $VIDEO" >&2; exit 2; }
OUT=out/qa/frames; WIDTH=""; CROP=""; FRAMES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT=$2; shift 2 ;;
    --width) WIDTH=$2; shift 2 ;;
    --crop) CROP=$2; shift 2 ;;
    -h|--help) usage 0 ;;
    *) FRAMES+=("$1"); shift ;;
  esac
done
[ ${#FRAMES[@]} -gt 0 ] || usage
mkdir -p "$OUT"

RATE=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$VIDEO")
[ -n "$RATE" ] || { echo "grab.sh: $VIDEO has no video stream" >&2; exit 2; }
NUM=${RATE%/*}; DEN=${RATE#*/}; [ "$DEN" = "$RATE" ] && DEN=1

VF=()
FILTER=""
[ -n "$CROP" ] && FILTER="crop=$CROP"
[ -n "$WIDTH" ] && FILTER="${FILTER:+$FILTER,}scale=$WIDTH:-2:flags=lanczos"
[ -n "$FILTER" ] && VF=(-vf "$FILTER")

status=0
for spec in ${FRAMES[@]+"${FRAMES[@]}"}; do
  if [[ "$spec" =~ ^([0-9]+)-([0-9]+)$ ]]; then A=${BASH_REMATCH[1]}; B=${BASH_REMATCH[2]}
  elif [[ "$spec" =~ ^[0-9]+$ ]]; then A=$spec; B=$spec
  else echo "grab.sh: not a frame or range: $spec" >&2; exit 2; fi
  [ "$B" -ge "$A" ] || { echo "grab.sh: empty range $spec" >&2; exit 2; }
  N=$((B - A + 1))
  for ((f = A; f <= B; f++)); do rm -f "$(printf '%s/f%05d.png' "$OUT" "$f")"; done
  SS=$(awk -v f="$A" -v n="$NUM" -v d="$DEN" 'BEGIN { t = (f - 0.5) * d / n; if (t < 0) t = 0; printf "%.6f", t }')
  if ffmpeg -v error -nostdin -y -ss "$SS" -i "$VIDEO" -map 0:v:0 -frames:v "$N" ${VF[@]+"${VF[@]}"} \
       -fps_mode passthrough -start_number "$A" "$OUT/f%05d.png"; then
    for ((f = A; f <= B; f++)); do
      p=$(printf '%s/f%05d.png' "$OUT" "$f")
      if [ -f "$p" ]; then echo "$p"; else echo "grab.sh: frame $f is past the end" >&2; status=1; fi
    done
  else
    echo "grab.sh: ffmpeg failed on $spec" >&2; status=1
  fi
done
exit $status
