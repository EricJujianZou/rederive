#!/usr/bin/env bash
# new-film.sh: start a film project from the cinetic starter.
#
# Copies assets/remotion-starter (or assets/hyperframes-starter) into <dir>, sets the frame rate,
# tempo, size and name, copies every cinetic script into <dir>/scripts so the project runs on its
# own, then installs dependencies (or symlinks an existing node_modules with --link-modules).
#
# Usage:
#   bash scripts/new-film.sh <dir> [--engine remotion|hyperframes] [--fps 60] [--bpm 120]
#                            [--size 1920x1080] [--name my-film] [--link-modules <node_modules>]
#                            [--font <name>]... [--browser <chromium path>] [--no-install] [--force]
#
#   --fps, --bpm   one beat must be a whole number of frames (60*fps/bpm). At 60 fps:
#                  90 -> 40 f, 100 -> 36, 120 -> 30, 144 -> 25, 150 -> 24.
#   --size         WxH, e.g. 1920x1080, 1080x1920 (9:16), 1080x1080. The demo lays out from the short side.
#   --engine       remotion (default): sets FPS/BPM/W/H in src/timeline.ts. hyperframes: sets them in
#                  motion.js and rewrites index.html's root data-fps/-width/-height/-duration (TOTAL/FPS),
#                  viewport and html/body size to match. Either way the starter's brand (palette,
#                  typeface, mark, name) is marked cinetic:placeholder and lint-film.mjs fails
#                  until it is replaced.
#   --link-modules symlink this node_modules instead of running npm install (offline sandboxes).
#   --font         vendor a @fontsource-variable/<name> family into the project (scripts/add-font.mjs:
#                  npm pack into a temp folder, never an install into a shared node_modules) and set
#                  FONT/FACES to it. Repeat for a mono. Later, run `node scripts/add-font.mjs <name>`.
#   --browser      bake a Chromium/headless-shell path into remotion.config.ts (env REMOTION_BROWSER
#                  or CHROMIUM_PATH at render time also works, and wins).
#   --force        allow a non-empty <dir> (starter files overwrite same-named files).
#
# Exit codes: 0 created, 1 bad arguments or a failed step (the message says which).
set -euo pipefail

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; }
die() { echo "new-film: $*" >&2; exit 1; }

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTS=()
DIR=""; ENGINE=remotion; FPS=60; BPM=120; SIZE=1920x1080; NAME=""; LINK=""; BROWSER="${CHROMIUM_PATH:-}"; INSTALL=1; FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --engine) ENGINE="${2:?--engine needs a value}"; shift 2 ;;
    --fps) FPS="${2:?--fps needs a value}"; shift 2 ;;
    --bpm) BPM="${2:?--bpm needs a value}"; shift 2 ;;
    --size) SIZE="${2:?--size needs a value}"; shift 2 ;;
    --name) NAME="${2:?--name needs a value}"; shift 2 ;;
    --link-modules) LINK="${2:?--link-modules needs a path}"; shift 2 ;;
    --browser) BROWSER="${2:?--browser needs a path}"; shift 2 ;;
    --font) FONTS+=("${2:?--font needs a family name or package}"); shift 2 ;;
    --no-install) INSTALL=0; shift ;;
    --force) FORCE=1; shift ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) [[ -z "$DIR" ]] || die "one target directory only (got '$DIR' and '$1')"; DIR="$1"; shift ;;
  esac
done

[[ -n "$DIR" ]] || { usage; die "missing <dir>"; }
[[ "$ENGINE" == remotion || "$ENGINE" == hyperframes ]] || die "--engine must be remotion or hyperframes"
[[ "$FPS" =~ ^[0-9]+$ && "$FPS" -gt 0 ]] || die "--fps must be a positive integer"
[[ "$BPM" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "--bpm must be a number"
[[ "$SIZE" =~ ^([0-9]+)x([0-9]+)$ ]] || die "--size must look like 1920x1080"
W="${BASH_REMATCH[1]}"; H="${BASH_REMATCH[2]}"
(( W % 2 == 0 && H % 2 == 0 )) || die "--size must be even in both dimensions (yuv420p needs it)"

# The whole system assumes a beat is a whole number of frames: cues on the grid, sound on the frame.
if ! node -e "const b=60*$FPS/$BPM; process.exit(Math.abs(b-Math.round(b))<1e-9?0:1)"; then
  OK=$(node -e "const r=[];for(let b=60;b<=200;b++){const f=60*$FPS/b;if(Number.isInteger(f))r.push(b+' ('+f+' f)')}console.log(r.join(', '))")
  die "at $FPS fps, $BPM BPM gives a beat of $(node -e "console.log((60*$FPS/$BPM).toFixed(3))") frames. Pick a BPM with a whole beat: $OK"
fi

SRC="$SKILL/assets/$ENGINE-starter"
[[ -d "$SRC" ]] || die "starter not found: $SRC"
if [[ -e "$DIR" ]]; then
  [[ -d "$DIR" ]] || die "$DIR exists and is not a directory"
  if [[ -n "$(ls -A "$DIR" 2>/dev/null)" && "$FORCE" != 1 ]]; then die "$DIR is not empty (use --force to copy into it anyway)"; fi
fi
[[ -z "$NAME" ]] && NAME="$(basename "$DIR")"
PKG=$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^[-._]+//; s/-+$//')
[[ -n "$PKG" ]] || PKG=film

mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
# Copy the starter, leaving out anything installed or rendered.
(cd "$SRC" && tar --exclude=node_modules --exclude=out --exclude=__pycache__ -cf - .) | (cd "$DIR" && tar -xf -)

# Substitute a `const NAME = value;` line; fail loudly if the starter no longer has it.
set_const() { # file name value
  local file="$1" name="$2" value="$3"
  grep -Eq "^(export )?const $name(: [^=]+)? = [^;]+;" "$file" || die "$file has no 'const $name = ...;' line to set"
  sed -i.bak -E "s|^((export )?const $name(: [^=]+)? = )[^;]+;|\1$value;|" "$file" && rm -f "$file.bak"
}

if [[ "$ENGINE" == remotion ]]; then
  TL="$DIR/src/timeline.ts"
  set_const "$TL" FPS "$FPS"; set_const "$TL" BPM "$BPM"; set_const "$TL" W "$W"; set_const "$TL" H "$H"
  sed -i.bak -E "s|\"name\": \"[^\"]*\"|\"name\": \"$PKG\"|; s|[0-9]+x[0-9]+@[0-9]+|${W}x${H}@${FPS}|g" "$DIR/package.json" && rm -f "$DIR/package.json.bak"
  if [[ -n "$BROWSER" ]]; then
    [[ -x "$BROWSER" ]] || echo "new-film: warning: --browser $BROWSER is not an executable file here" >&2
    set_const "$DIR/remotion.config.ts" PINNED_BROWSER "'$BROWSER'"
  fi
else
  # HyperFrames: the grid lives in motion.js (FPS, BPM, W, H); index.html repeats the size, fps and
  # length on the root element, the viewport meta and the html/body box. Set all of them, then
  # derive data-duration from timeline.js (TOTAL / FPS) so the render neither cuts nor freezes.
  MJ="$DIR/motion.js"
  [[ -f "$MJ" && -f "$DIR/timeline.js" && -f "$DIR/index.html" ]] || die "HyperFrames starter needs motion.js, timeline.js and index.html"
  for kv in "FPS=$FPS" "BPM=$BPM" "W=$W" "H=$H"; do
    k="${kv%%=*}"; v="${kv#*=}"
    grep -Eq "^\s*const $k = [^;]+;" "$MJ" || die "motion.js has no 'const $k = ...;' line to set"
    sed -i.bak -E "s|^([[:space:]]*const $k = )[^;]+;|\1$v;|" "$MJ" && rm -f "$MJ.bak"
  done
  DIR="$DIR" W="$W" H="$H" node - <<'JS' || die "could not update index.html from motion.js/timeline.js"
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.env.DIR, W = +process.env.W, H = +process.env.H;
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['motion.js', 'timeline.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const { FPS } = ctx.MOTION, { TOTAL } = ctx.FILM;
const dur = +(TOTAL / FPS).toFixed(6);
const file = path.join(dir, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const root = (html.match(/<[a-z][^>]*\bdata-composition-id\s*=[^>]*>/is) || [])[0];
if (!root) throw new Error('index.html: no element with data-composition-id');
const old = (root.match(/\bdata-duration\s*=\s*"([^"]*)"/) || [])[1];
const setAttr = (tag, name, v) => (new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`).test(tag) ? tag.replace(new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`), `${name}="${v}"`) : tag.replace(/\s*\/?>$/, ` ${name}="${v}">`));
let tag = root;
for (const [n, v] of [['data-fps', FPS], ['data-width', W], ['data-height', H], ['data-duration', dur]]) tag = setAttr(tag, n, v);
html = html.replace(root, tag);
// clips that ran the whole film (same data-duration as the old root) keep running the whole film
if (old !== undefined) html = html.replace(new RegExp(`(\\bdata-duration\\s*=\\s*")${old.replace('.', '\\.')}(")`, 'g'), `$1${dur}$2`);
html = html.replace(/(<meta\s+name="viewport"\s+content=")[^"]*(")/i, `$1width=${W}, height=${H}$2`);
html = html.replace(/(html,\s*body\s*\{[^}]*?\bwidth:\s*)\d+px/, `$1${W}px`).replace(/(html,\s*body\s*\{[^}]*?\bheight:\s*)\d+px/, `$1${H}px`);
fs.writeFileSync(file, html);
console.log(`new-film: index.html root ${W}x${H} @ ${FPS} fps, data-duration ${dur} s (TOTAL ${TOTAL} f)`);
JS
  [[ -f "$DIR/package.json" ]] && sed -i.bak -E "s|\"name\": \"[^\"]*\"|\"name\": \"$PKG\"|" "$DIR/package.json" && rm -f "$DIR/package.json.bak"
fi

# The project carries its own copy of every script, so npm scripts use local paths (not the
# skill's own tests in scripts/test/).
mkdir -p "$DIR/scripts"
(cd "$SKILL/scripts" && tar --exclude=__pycache__ --exclude='*.pyc' --exclude=./test -cf - .) | (cd "$DIR/scripts" && tar -xf -)
chmod +x "$DIR"/scripts/*.sh 2>/dev/null || true
# pick.py draws from the technique library; the project keeps a copy so it runs from here too
LIB="$SKILL/assets/library/techniques.json"; [[ -f "$LIB" ]] || LIB="$SKILL/scripts/library/techniques.json"
if [[ -f "$LIB" ]]; then mkdir -p "$DIR/scripts/library" && cp "$LIB" "$DIR/scripts/library/"; fi

if [[ -n "$LINK" ]]; then
  [[ -d "$LINK" ]] || die "--link-modules: $LINK is not a directory"
  rm -rf "$DIR/node_modules"
  ln -s "$(cd "$LINK" && pwd)" "$DIR/node_modules"
  echo "new-film: linked node_modules -> $LINK"
  # npm's postinstall does not run for a linked folder; run the starter's setup step directly
  if [[ -f "$DIR/setup.mjs" ]]; then
    (cd "$DIR" && node setup.mjs) || echo "new-film: warning: setup.mjs could not copy its files from the linked node_modules (npm install in $DIR fixes it)" >&2
  fi
elif [[ "$INSTALL" == 1 && -f "$DIR/package.json" ]]; then
  (cd "$DIR" && npm install --no-audit --no-fund) || die "npm install failed in $DIR (rerun it there, or use --link-modules)"
fi

for font in ${FONTS[@]+"${FONTS[@]}"}; do
  node "$DIR/scripts/add-font.mjs" "$font" --dir "$DIR" || die "--font $font: could not vendor it (see above)"
done

BEAT=$(node -e "console.log(60*$FPS/$BPM)")
echo "new-film: created $DIR ($ENGINE, ${W}x${H} @ $FPS fps, $BPM BPM = $BEAT f per beat)"
if [[ "$ENGINE" == remotion ]]; then
  cat <<EOF
next:
  cd $DIR
  npm run check             # tsc, lint-film, grid-check: fails on purpose until the placeholder brand
                            # (palette, typeface, mark and name: cinetic:placeholder in src/brand and
                            # COPY) is replaced; see brand-and-color.md
  npm run stills            # style frames in out/stills/ - look at them
  npm run studio            # iterate act by act (Acts folder)
  npm run cues && npm run audio && npm run render:preview
EOF
else
  cat <<EOF
next:
  cd $DIR
  node scripts/lint-film.mjs .   # cinetic bans; fails on purpose until the placeholder palette
                                 # and font in index.html are replaced (references/brand-and-color.md)
  npm run preview                # HyperFrames Studio
  npm run cues && npm run audio && npm run render:preview   # then: npm run render (hf-finish.sh)
EOF
fi
