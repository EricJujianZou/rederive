#!/usr/bin/env python3
"""Contact sheets with frame and time labels at the real fps, from an MP4 or a Remotion composition.

Usage:
  python3 scripts/sheet.py out/film.mp4 --out out/qa/sheet.png                      # whole film, <= 48 tiles
  python3 scripts/sheet.py out/film.mp4 --chunks 4 --rate 12 --out out/qa/r1/watch.png  # 12 fps, one sheet per 4 s
  python3 scripts/sheet.py out/film.mp4 --every 30 --width 480 --out out/qa/legibility.png  # phone legibility
  python3 scripts/sheet.py out/film.mp4 --frames 358-364,1796 --diff --width 480 --out out/qa/pops.png
  python3 scripts/sheet.py --comp Act3 --every 2 --offset 600 --out out/qa/act3.png [-- --props=...]
  python3 scripts/sheet.py --images out/stills/*.png --width 480 --out out/qa/stills.png  # tile stills

Tiles are labelled "f<frame> <seconds>s" (frame = t * fps, 0-based) and, with --cues out/cues.json,
the act and any cue within half a step. --diff pairs each frame with its change from the previous
frame (x4), which is how single-frame pops and ghosts show up. With --chunks, one sheet per chunk is
written as <out stem>_<k>_f<a>-<b>.png. --json writes a manifest of the sheets.

Composition mode renders the range with `npx remotion render --sequence --every-nth-frame` into a temp
dir (run it from the project root); fps and duration are read with `npx remotion compositions` unless
--fps and --to are given. Exit: 0 ok, 1 nothing decoded or rendered, 2 usage error.
Needs ffmpeg/ffprobe, numpy and opencv-python (and Node + Remotion for --comp).
"""
import argparse
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile

import cv2
import numpy as np

sys.dont_write_bytecode = True  # no __pycache__ in the project's scripts/
from forensics import decode, label, probe, tile  # noqa: E402


def die(msg, code=2):
    print(f'sheet: {msg}', file=sys.stderr)
    sys.exit(code)


def parse_frames(text):
    out = []
    for part in filter(None, (x.strip() for x in text.split(','))):
        m = re.fullmatch(r'(\d+)(?:-(\d+))?', part)
        if not m:
            die(f'bad --frames entry: {part}')
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        out.extend(range(a, b + 1))
    return sorted(set(out))


def load_cues(path):
    if not path:
        return {}, {}
    try:
        c = json.load(open(path))
    except (OSError, json.JSONDecodeError) as e:
        die(f'cannot read --cues {path}: {e}')
    acts = {k: (int(v['from']), int(v['from']) + int(v.get('dur', 0)))
            for k, v in (c.get('acts') or {}).items() if isinstance(v, dict) and 'from' in v}
    cue = {k: int(v) for k, v in (c.get('cue') or {}).items() if isinstance(v, (int, float))}
    return acts, cue


def sublabel(f, acts, cue, half):
    act = next((k for k, (a, b) in acts.items() if a <= f < b), None)
    near = [k for k, v in cue.items() if abs(v - f) <= half]
    parts = ([act] if act else []) + near[:2]
    return ' / '.join(parts) if parts else None


def comp_meta(comp, entry):
    """(fps, durationInFrames) from `npx remotion compositions`."""
    try:
        out = subprocess.run(['npx', 'remotion', 'compositions', entry], capture_output=True, text=True, timeout=600)
    except (OSError, subprocess.TimeoutExpired) as e:
        die(f'npx remotion compositions failed: {e}')
    for line in out.stdout.splitlines():
        m = re.match(rf'^{re.escape(comp)}\s+([\d.]+)\s+\d+x\d+\s+(\d+)\s', line.strip() + ' ')
        if m:
            return float(m.group(1)), int(m.group(2))
    die(f'composition {comp} not found by `npx remotion compositions {entry}`:\n{out.stdout[-800:]}{out.stderr[-800:]}')


def render_comp(args, a, b, every):
    """Render frames a..b every N of a composition; returns {frame: bgr image}."""
    tmp = tempfile.mkdtemp(prefix='sheet_')
    cmd = ['npx', 'remotion', 'render', args.entry, args.comp, tmp, '--sequence', f'--frames={a}-{b}',
           '--image-format=jpeg', '--jpeg-quality=90', '--log=error']
    if every > 1:
        cmd.append(f'--every-nth-frame={every}')
    if args.concurrency:
        cmd.append(f'--concurrency={args.concurrency}')
    cmd += args.extra
    print('sheet: ' + ' '.join(cmd), file=sys.stderr)
    r = subprocess.run(cmd)
    files = sorted(glob.glob(os.path.join(tmp, '*.jpeg')) + glob.glob(os.path.join(tmp, '*.jpg')))
    expected = list(range(a, b + 1, every))
    if r.returncode != 0 or not files:
        shutil.rmtree(tmp, ignore_errors=True)
        die(f'remotion render failed (exit {r.returncode})', 1)
    if len(files) != len(expected):
        print(f'sheet: warning: rendered {len(files)} files for {len(expected)} frames', file=sys.stderr)
    out = {}
    for f, p in zip(expected, files):
        im = cv2.imread(p)
        out[f] = im
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def grab_video(path, info, frames, width, with_prev):
    """Decode only what is needed, in contiguous spans; returns {frame: rgb tile}, plus previous frames."""
    th = int(round(width * info['h'] / info['w'] / 2)) * 2
    need = sorted(set(frames) | ({f - 1 for f in frames if f > 0} if with_prev else set()))
    spans, cur = [], [need[0], need[0]]
    for f in need[1:]:
        if f - cur[1] <= 120:
            cur[1] = f
        else:
            spans.append(cur)
            cur = [f, f]
    spans.append(cur)
    got = {}
    want = set(need)
    for a, b in spans:
        for f, im in decode(path, info, a, b - a + 1, size=(width, th)):
            if f in want:
                got[f] = im.copy()
    return got


def diff_tile(cur, prev):
    d = np.abs(cur.astype(np.int16) - prev.astype(np.int16)).max(axis=2)
    d = np.clip(d * 4, 0, 255).astype(np.uint8)
    return cv2.applyColorMap(d, cv2.COLORMAP_INFERNO)


def build(frames, imgs, fps, args, acts, cue, half, bgr):
    tiles = []
    for f in frames:
        if f not in imgs:
            continue
        im = imgs[f]
        im = im if bgr else cv2.cvtColor(im, cv2.COLOR_RGB2BGR)
        if im.shape[1] != args.width:
            h = int(round(args.width * im.shape[0] / im.shape[1] / 2)) * 2
            im = cv2.resize(im, (args.width, h), interpolation=cv2.INTER_AREA)
        g = f + args.offset  # label in film frames when a per-act composition starts later in the film
        tiles.append(label(im.copy(), f'f{g} {g / fps:.2f}s', sublabel(g, acts, cue, half)))
        if args.diff:
            pv = imgs.get(f - 1)
            if pv is None:
                dt = np.zeros_like(im)
            else:
                pv = pv if bgr else cv2.cvtColor(pv, cv2.COLOR_RGB2BGR)
                pv = cv2.resize(pv, (im.shape[1], im.shape[0]), interpolation=cv2.INTER_AREA)
                dt = diff_tile(im, pv)
            tiles.append(label(dt, f'f{f - 1 + args.offset}->f{f + args.offset} x4'))
    return tiles


def sheet_of_images(args):
    """Tile existing images (stills, frames grabbed earlier) at one tile width, each labelled with its file name."""
    tiles = []
    for path in args.images:
        im = cv2.imread(path, cv2.IMREAD_COLOR)
        if im is None:
            die(f'cannot read {path}')
        w = args.width or 480
        tiles.append(label(cv2.resize(im, (w, max(1, round(im.shape[0] * w / im.shape[1]))), interpolation=cv2.INTER_AREA),
                           os.path.splitext(os.path.basename(path))[0]))
    h = max(t.shape[0] for t in tiles)  # pad mixed aspect ratios to one row height
    tiles = [np.pad(t, ((0, h - t.shape[0]), (0, 0), (0, 0)), constant_values=90) for t in tiles]
    cols = args.cols or max(1, min(len(tiles), 8, max(2, round(1920 / tiles[0].shape[1]))))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    cv2.imwrite(args.out, tile(tiles, cols))
    print(f'{args.out}  ({len(tiles)} images)')
    sys.exit(0)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument('video', nargs='?', help='MP4 to sample (or use --comp or --images)')
    ap.add_argument('--images', nargs='+', help='tile these image files instead, labelled by file name')
    ap.add_argument('--comp', help='Remotion composition id to render instead of reading a video')
    ap.add_argument('--entry', default='src/index.ts', help='Remotion entry point for --comp')
    ap.add_argument('--concurrency', type=int, help='Remotion render concurrency for --comp')
    ap.add_argument('--fps', type=float, help='label fps for --comp (default: read from Remotion)')
    ap.add_argument('--from', dest='from_frame', type=int, default=0)
    ap.add_argument('--to', dest='to_frame', type=int, help='last frame, inclusive (default: the end)')
    ap.add_argument('--every', type=int, help='take every Nth frame')
    ap.add_argument('--rate', type=float, help='sample at this many frames per second instead of --every')
    ap.add_argument('--chunks', type=float, help='one sheet per chunk of this many seconds (default rate 12)')
    ap.add_argument('--frames', help='explicit frames/ranges for a video, e.g. 358-364,1796')
    ap.add_argument('--width', type=int, help='tile width in px (480 = phone legibility)')
    ap.add_argument('--cols', type=int)
    ap.add_argument('--offset', type=int, default=0,
                    help='add to frame labels, e.g. the act start when --comp renders one act (ACT.x.from)')
    ap.add_argument('--diff', action='store_true', help='pair each frame with its change from the previous one')
    ap.add_argument('--cues', help='out/cues.json, to label acts and cues')
    ap.add_argument('--out', required=True, help='PNG path (chunked sheets get _k_fa-b suffixes)')
    ap.add_argument('--json', help='write a manifest of the sheets here')
    args, extra = ap.parse_known_args()
    if extra and extra[0] == '--':
        extra = extra[1:]
    if extra and not args.comp:
        die(f'unknown arguments: {" ".join(extra)}')
    args.extra = extra
    if args.images:
        sheet_of_images(args)
        return
    if bool(args.video) == bool(args.comp):
        die('give either a video path or --comp <Composition>')
    if args.frames and args.comp:
        die('--frames works on a video; render one first or use --from/--to/--every with --comp')

    if args.comp:
        fps, dur = (args.fps, None) if args.fps and args.to_frame is not None else comp_meta(args.comp, args.entry)
        fps = args.fps or fps
        last = args.to_frame if args.to_frame is not None else dur - 1
        info = None
    else:
        info = probe(args.video)
        fps, last = info['fps'], info['frames'] - 1
        if args.to_frame is not None:
            last = min(last, args.to_frame)
    first = max(0, args.from_frame)
    if last < first:
        die(f'empty range {first}-{last}')

    if args.every:
        every = args.every
    elif args.rate:
        every = max(1, int(round(fps / args.rate)))
    elif args.chunks:
        every = max(1, int(round(fps / 12)))
    else:
        every = max(1, math.ceil((last - first + 1) / 48))

    if args.frames:
        groups = [('', parse_frames(args.frames))]
    elif args.chunks:
        span = max(1, int(round(args.chunks * fps)))
        groups = []
        for k, a in enumerate(range(first, last + 1, span)):
            b = min(last, a + span - 1)
            groups.append((f'_{k + 1:02d}_f{a}-{b}', list(range(a, b + 1, every))))
    else:
        groups = [('', list(range(first, last + 1, every)))]

    n_max = max(len(g) for _, g in groups) * (2 if args.diff else 1)
    if not args.width:
        args.width = 480 if n_max <= 8 else 320 if n_max <= 24 else 240
    cols = args.cols or max(1, min(n_max, 8, max(2, round(1920 / args.width))))
    if args.diff and cols % 2:
        cols += 1

    all_frames = sorted({f for _, g in groups for f in g})
    if args.comp:
        imgs = render_comp(args, all_frames[0], all_frames[-1], every)
        bgr = True
    else:
        imgs = grab_video(args.video, info, all_frames, args.width, args.diff)
        bgr = False
    if not imgs:
        die('no frames decoded', 1)

    acts, cue = load_cues(args.cues)
    stem, ext = os.path.splitext(args.out)
    ext = ext or '.png'
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    manifest = []
    for suffix, frames in groups:
        tiles = build(frames, imgs, fps, args, acts, cue, max(1, every // 2), bgr)
        if not tiles:
            continue
        path = stem + suffix + ext
        cv2.imwrite(path, tile(tiles, cols))
        manifest.append(dict(path=path, frames=[f for f in frames if f in imgs], every=every, fps=fps))
        step = '' if args.frames else f', every {every}'
        print(f'{path}  ({len([f for f in frames if f in imgs])} frames, f{frames[0] + args.offset}-'
              f'f{frames[-1] + args.offset}{step})')
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        json.dump(dict(source=args.video or f'comp:{args.comp}', sheets=manifest), open(args.json, 'w'), indent=1)
    sys.exit(0 if manifest else 1)


if __name__ == '__main__':
    main()
