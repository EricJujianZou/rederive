#!/usr/bin/env bash
# brand-kit.sh: export an invented brand as files: SVG and PNG mark and lockups, favicon sizes,
# a social avatar and, for X, a header image.
#
# Usage (from the project root):
#   bash scripts/brand-kit.sh [--out out/deliver/brand] [--x-header] [--avatar light|dark|accent]
#                             [--name TEXT] [--font FILE.woff2]
#
# It writes into --out (default out/deliver/brand/):
#   mark-light.svg, mark-dark.svg        the mark for light and dark grounds (src/brand/Mark.tsx)
#   lockup-light.svg, lockup-dark.svg    mark + name, the name outlined (scripts/brand-svg.ts); when the
#                                        mark is part of the word, export LockupSvg from src/brand/Mark.tsx
#                                        and it is written as is (and make BrandLockup draw the same)
#   lockup-light.png, lockup-dark.png    transparent, trimmed to the ink plus a small margin
#   mark-16.png, mark-32.png             favicon sizes, for light grounds
#   mark-512.png, mark-1024.png          transparent, for light grounds; -dark variants too
#   avatar.png                           400 x 400 on the brand's ground (--avatar, default light)
#   x-header.png                         --x-header: 1500 x 500
# from the Brand stills in src/Root.tsx (BrandMark, BrandLockup, BrandAvatar, BrandHeader). The film's
# own lockup geometry is used: the mark as tall as the name's ink ascent, a 0.3 gap, one baseline.
# Check the 16 px mark and the avatar's circle crop by eye before you ship.
#
# Needs: npx with @remotion/cli, python3 with numpy and opencv, and for the SVG lockups fonttools,
# brotli and uharfbuzz. Exit 0 = every file written, 1 = a step failed.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
die() { echo "brand-kit.sh: $*" >&2; exit 1; }
step() { echo "[brand-kit] $*" >&2; }

OUT=out/deliver/brand; XHEADER=0; AVATAR=light; SVGARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --out) OUT=${2:?}; shift ;;
    --x-header) XHEADER=1 ;;
    --avatar) AVATAR=${2:?}; shift ;;
    --name) SVGARGS+=(--name "${2:?}"); shift ;;
    --font) SVGARGS+=(--font "${2:?}"); shift ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
  shift
done
[[ -f src/index.ts ]] || die "run it from the project root (no src/index.ts here)"
mkdir -p "$OUT"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/cinetic-brand.XXXXXX"); trap 'rm -rf "$WORK"' EXIT

step "SVG mark and lockups"
npx tsx "$SCRIPT_DIR/brand-svg.ts" --out "$OUT" ${SVGARGS[@]+"${SVGARGS[@]}"} >&2 || die "brand-svg.ts failed (see above)"

step "bundling"
npx remotion bundle src/index.ts --out-dir "$WORK/bundle" --log=error >/dev/null || die "bundle failed"
still() { # id out props
  npx remotion still "$WORK/bundle" "$1" "$2" --image-format=png --props="$3" --log=error >/dev/null || die "still $1 failed"
}
for s in 16 32 512 1024; do still BrandMark "$OUT/mark-$s.png" "{\"size\":$s,\"ground\":\"light\"}"; done
for s in 512 1024; do still BrandMark "$OUT/mark-$s-dark.png" "{\"size\":$s,\"ground\":\"dark\"}"; done
for g in light dark; do still BrandLockup "$WORK/lockup-$g.png" "{\"ground\":\"$g\"}"; done
still BrandAvatar "$OUT/avatar.png" "{\"ground\":\"$AVATAR\"}"
[[ $XHEADER -eq 1 ]] && still BrandHeader "$OUT/x-header.png" "{\"ground\":\"$AVATAR\"}"

step "trimming the lockups"
python3 - "$WORK" "$OUT" <<'PY' || die "trimming failed"
import sys, cv2, numpy as np
work, out = sys.argv[1:3]
for g in ('light', 'dark'):
    im = cv2.imread(f'{work}/lockup-{g}.png', cv2.IMREAD_UNCHANGED)
    if im is None or im.shape[2] != 4:
        sys.exit(f'lockup-{g}.png has no alpha channel (the still must paint no background)')
    ys, xs = np.nonzero(im[..., 3] > 0)
    if not len(xs):
        sys.exit(f'lockup-{g}.png is empty')
    m = int(0.06 * (ys.max() - ys.min()))  # a small margin, proportional to the lockup
    y0, y1, x0, x1 = max(0, ys.min() - m), min(im.shape[0], ys.max() + m + 1), max(0, xs.min() - m), min(im.shape[1], xs.max() + m + 1)
    cv2.imwrite(f'{out}/lockup-{g}.png', im[y0:y1, x0:x1])
    print(f'  lockup-{g}.png {x1 - x0}x{y1 - y0}', file=sys.stderr)
PY
step "done: $(ls "$OUT" | tr '\n' ' ')"
