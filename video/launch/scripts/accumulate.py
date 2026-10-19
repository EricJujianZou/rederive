#!/usr/bin/env python3
"""Temporal motion blur by accumulation: average each output frame's sub-frames in float, quantize once.

Reads a sub-frame render and writes the blurred master. Two modes:
  samples mode  the FilmSub stream, where output frame f owns groups[f] consecutive sub-frames
                (from scripts/measure-speed.py, the same JSON FilmSub was rendered with)
  --uniform K   a plain render at fps*K (HyperFrames, or any engine without adaptive sampling);
                each output frame averages the ceil(K*shutter/360) sub-frames centred on it

Why outside the browser: compositing samples in Chromium quantizes every layer to 8 bits, which
posterizes soft gradients, tints light greys and darkens the frame a little per sample. Here the
decode is 16-bit, the average is float32, the BT.709 limited-range conversion is done here in float
(it matches swscale to 0.01 of a code value), and the frame is quantized exactly once, straight to
the yuv420p planes x264 encodes. Rounding is plain, so a flat field (paper, a solid stage, a flat
card, moving or fading) comes out as one code value everywhere and encodes exactly. A +-1 LSB
triangular (TPDF) dither is added only where banding can form, in smooth ramps (a dark pool of
light, a blurred soft edge, a moving gradient), in every frame whether or not it moved, and with
one fixed noise pattern, so a still shot stays identical from frame to frame and the encoder can
keep the dither instead of smoothing it back into contours.

Why not let ffmpeg convert the 16-bit average: swscale always adds an 8x8 ordered dither when it
reduces a >8-bit source to 8 bits, so a flat paper whose value falls between two codes (228.31
here) becomes a fixed 228/229 checker on every frame. x264 keeps that pattern in some blocks and
flattens others, frame by frame, and a 25x stretch shows horizontal streaks and block smears of
+-1-2 levels over the whole background (references/finishing.md, section 5).

Usage:
  python3 scripts/accumulate.py out/sub.mp4 out/samples.json out/picture.mp4 [--crf 14]
  python3 scripts/accumulate.py out/sub.mp4 out/samples.json out/picture.mp4 --start 600 --count 120
  python3 scripts/accumulate.py renders/x4.mp4 out/picture.mp4 --uniform 4 [--shutter 240]
  python3 scripts/accumulate.py 'frames/*.png' out/picture.mp4 --uniform 4 --in-fps 240

Size and fps come from ffprobe (image sequences need --in-fps). Options: --crf (14), --preset
(slow), --x264-params and --tune (none), --10bit (yuv420p10le, High 10), --start/--count (a range
of film frames, for excerpt and per-act renders), --dither LSB (1.0; 0 = off), --dither-mask
gradient|changed|all (where the dither goes; default gradient), --dither-frames N (1: one fixed
pattern), --fps (override output fps). Width and height must be even (4:2:0). Exit 0 on success,
1 on failure (stream shorter/longer than the samples expect, or the encoder failed).
"""
import argparse
import glob
import json
import math
import os
import subprocess
import sys
import time
from collections import OrderedDict
from fractions import Fraction

import numpy as np

try:
    import cv2
except ImportError:  # the gradient mask falls back to numpy (slower)
    cv2 = None

# Extra x264 options for the master: none. With the planes quantized here a flat field is exact at
# any setting, and on a dark dithered gradient aq-mode=3, tune film/grain and deblock -1:-1 moved
# the banding error by 3% or less while aq-mode=3 cost 66% more bits on a flat sting (finishing.md §5).
DEFAULT_X264 = ''
# BT.709 luma weights; swscale's rgb48 carries 8-bit code v as v*256
KR, KB = 0.2126, 0.0722
KG = 1.0 - KR - KB
# Where the dither goes (luma px; the chroma planes use half): a pixel is dithered when its 5x5
# neighbourhood is not flat (range > FLAT_EPS code values; a slow 1-code-per-200-px ramp still
# counts) and its 9x9 neighbourhood holds no edge (range <= RAMP_MAX; steeper than ~1 code per px
# nothing can band). Flat fields, including the paper right next to a hairline, are rounded.
FLAT_R, FLAT_EPS = 2, 0.01
EDGE_R, RAMP_MAX = 4, 8.0


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='+', help='SRC SAMPLES OUT, or SRC OUT with --uniform')
    ap.add_argument('--uniform', type=int, help='K: the source was rendered at fps*K; average uniformly')
    ap.add_argument('--shutter', type=float, default=240, help='shutter angle for --uniform (default 240)')
    ap.add_argument('--crf', type=float, default=float(os.environ.get('ACCUM_CRF', 14)))
    ap.add_argument('--preset', default='slow')
    ap.add_argument('--tune', help='x264 tune (none by default; see references/finishing.md section 5)')
    ap.add_argument('--x264-params', default=os.environ.get('ACCUM_X264', DEFAULT_X264),
                    help='extra x264 options, e.g. "aq-mode=3" (default: none)')
    ap.add_argument('--10bit', dest='tenbit', action='store_true', help='encode yuv420p10le (High 10)')
    ap.add_argument('--start', type=int, default=0, help='first film frame in the stream (samples mode)')
    ap.add_argument('--count', type=int, help='number of film frames in the stream (samples mode)')
    ap.add_argument('--dither', type=float, default=1.0, help='TPDF dither amplitude in output LSB (0 = off)')
    ap.add_argument('--dither-mask', choices=('gradient', 'changed', 'all'), default='gradient',
                    help='gradient: smooth ramps only, flat fields and edges rounded (default); changed: every '
                         'pixel the shutter changed (the older rule); all: every pixel')
    ap.add_argument('--dither-all', action='store_true', help='same as --dither-mask all')
    ap.add_argument('--dither-frames', type=int, default=1,
                    help='distinct noise patterns, cycled (1 = one fixed pattern, which a static shot keeps exactly)')
    ap.add_argument('--fps', type=float, help='output fps (default: source fps, or source fps / K)')
    ap.add_argument('--in-fps', type=float, help='source fps for image sequences')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    if a.dither_all:
        a.dither_mask = 'all'
    if a.uniform:
        if len(a.paths) == 3:
            a.src, _, a.out = a.paths
        elif len(a.paths) == 2:
            a.src, a.out = a.paths
        else:
            ap.error('--uniform takes SRC OUT')
        a.samples = None
        if a.uniform < 1:
            ap.error('--uniform K must be >= 1')
    else:
        if len(a.paths) != 3:
            ap.error('want SRC SAMPLES OUT (or SRC OUT --uniform K)')
        a.src, a.samples, a.out = a.paths
    return a


def fail(msg):
    sys.stderr.write(f'accumulate.py: {msg}\n')
    sys.exit(1)


def source_args(src, in_fps):
    """ffmpeg input args for a video file, a printf pattern or a glob of images."""
    if os.path.isdir(src):
        imgs = sorted(glob.glob(os.path.join(src, '*.png')) + glob.glob(os.path.join(src, '*.jpg')))
        if not imgs:
            fail(f'no .png/.jpg frames in {src}')
        src = os.path.join(src, '*' + os.path.splitext(imgs[0])[1])
    if any(c in src for c in '*?['):
        if not in_fps:
            fail('image sequences need --in-fps')
        return ['-framerate', str(in_fps), '-pattern_type', 'glob', '-i', src], sorted(glob.glob(src))[0], True
    if '%' in src:
        if not in_fps:
            fail('image sequences need --in-fps')
        return ['-framerate', str(in_fps), '-i', src], src % 0 if os.path.exists(src % 0) else src % 1, True
    if not os.path.exists(src):
        fail(f'missing source {src}')
    return ['-i', src], src, False


def probe(path, count_frames):
    cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0']
    if count_frames:
        cmd.append('-count_packets')
    cmd += ['-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_read_packets,color_space,color_range',
            '-of', 'json', path]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or not json.loads(r.stdout).get('streams'):
        fail(f'cannot probe {path}: {r.stderr.strip()}')
    s = json.loads(r.stdout)['streams'][0]
    fps = None
    for k in ('avg_frame_rate', 'r_frame_rate'):
        try:
            f = Fraction(s.get(k, '0/0'))
            if f > 0:
                fps = float(f)
                break
        except (ValueError, ZeroDivisionError):
            pass
    n = int(s['nb_read_packets']) if s.get('nb_read_packets') else None
    return s['width'], s['height'], fps, n


def ycbcr_matrix():
    """3x3 from swscale rgb48 units to BT.709 limited-range Y, Cb, Cr in 8-bit code units (no offsets)."""
    m = np.array([[KR, KG, KB],
                  [-KR / (2 * (1 - KB)), -KG / (2 * (1 - KB)), 0.5],
                  [0.5, -KG / (2 * (1 - KR)), -KB / (2 * (1 - KR))]], np.float32)
    return m * (np.array([[219], [224], [224]], np.float32) / (255.0 * 256.0))


M709 = ycbcr_matrix()
OFF = np.array([16, 128, 128], np.float32)


def to_ycbcr(rgb48):
    """float32 (H, W, 3) in swscale rgb48 units -> Y (H, W), Cb, Cr (H/2, W/2): BT.709 limited range
    in 8-bit code units (float). Chroma is the 2x2 mean, which is what swscale does here."""
    h, w = rgb48.shape[:2]
    if cv2 is not None:
        yuv = cv2.transform(rgb48, np.hstack([M709, OFF[:, None]]))
        y, cb, cr = cv2.split(yuv)
        half = (w // 2, h // 2)
        return y, cv2.resize(cb, half, interpolation=cv2.INTER_AREA), cv2.resize(cr, half, interpolation=cv2.INTER_AREA)
    yuv = (rgb48.reshape(-1, 3) @ M709.T).reshape(h, w, 3) + OFF
    c = yuv[..., 1:].reshape(h // 2, 2, w // 2, 2, 2).mean(axis=(1, 3))
    return np.ascontiguousarray(yuv[..., 0]), c[..., 0], c[..., 1]


def local_range(p, r):
    """max - min of plane p over a (2r+1)^2 window."""
    if cv2 is not None:
        k = np.ones((2 * r + 1, 2 * r + 1), np.uint8)
        return cv2.dilate(p, k) - cv2.erode(p, k)
    hi, lo = p.copy(), p.copy()
    for ax in (0, 1):
        a, b = hi.copy(), lo.copy()
        for s in range(1, r + 1):
            for sh in (s, -s):
                np.maximum(a, np.roll(hi, sh, axis=ax), out=a)
                np.minimum(b, np.roll(lo, sh, axis=ax), out=b)
        hi, lo = a, b
    return hi - lo


def half_any(mask):
    return mask[0::2, 0::2] | mask[1::2, 0::2] | mask[0::2, 1::2] | mask[1::2, 1::2]


def main():
    a = parse_args()
    t0 = time.time()
    in_args, probe_path, is_seq = source_args(a.src, a.in_fps)
    W, H, src_fps, n_src = probe(probe_path, not is_seq)
    if is_seq:
        src_fps = a.in_fps
        n_src = len(sorted(glob.glob(a.src))) if any(c in a.src for c in '*?[') else None
    if not src_fps:
        fail('cannot tell the source fps; pass --in-fps')

    # plan: for each output frame, the list of source indices it averages
    if a.uniform:
        K = a.uniform
        if n_src is None:
            fail('cannot count source frames; pass a video file')
        n_out = n_src // K
        n = max(1, min(K, math.ceil(K * a.shutter / 360 - 1e-9)))
        h = (n - 1) // 2
        plan = [[min(max(f * K - h + i, 0), n_src - 1) for i in range(n)] for f in range(n_out)]
        out_fps = a.fps or src_fps / K
        expected = n_src
        desc = f'uniform K={K}: {n} of every {K} sub-frames, centred ({a.shutter:g} deg)'
    else:
        try:
            groups = json.load(open(a.samples))['groups']
        except (OSError, ValueError, KeyError) as e:
            fail(f'cannot read groups from {a.samples}: {e}')
        groups = groups[a.start:a.start + a.count if a.count else None]
        if not groups:
            fail(f'no groups at --start {a.start} in {a.samples}')
        plan, j = [], 0
        for g in groups:
            g = max(1, int(g))
            plan.append(list(range(j, j + g)))
            j += g
        expected = j
        n_out = len(plan)
        out_fps = a.fps or src_fps
        desc = f'{n_out} frames from {expected} sub-frames (film frames {a.start}-{a.start + n_out - 1})'
        if n_src is not None and n_src != expected:
            before = sum(max(1, int(g)) for g in json.load(open(a.samples))['groups'][:a.start])
            fail(f'{a.src} has {n_src} frames but {a.samples} expects {expected} sub-frames for film frames '
                 f'{a.start}-{a.start + n_out - 1}: render FilmSub with the same --props file over sub-frames '
                 f'{before}-{before + expected - 1}')

    FRAME = W * H * 3
    if W % 2 or H % 2:
        fail(f'{W}x{H}: 4:2:0 needs an even width and height')
    # decode at 16 bits with the file's own matrix/range and accurate chroma; swscale maps 8-bit
    # code v to ~v*256 in rgb48, and to_ycbcr() maps it back the same way
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', *in_args, '-vf',
                            'scale=in_color_matrix=auto:in_range=auto:flags=accurate_rnd+full_chroma_int',
                            '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-'], stdout=subprocess.PIPE)
    # the planes are quantized here and piped as they are: no scale filter, so no hidden dither
    pix = 'yuv420p10le' if a.tenbit else 'yuv420p'
    gain, top, dtype = (4.0, 1023, '<u2') if a.tenbit else (1.0, 255, np.uint8)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    x264 = (['-tune', a.tune] if a.tune else []) + (['-x264-params', a.x264_params] if a.x264_params else [])
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', pix, '-s', f'{W}x{H}',
                            '-r', f'{out_fps:g}', '-i', '-',
                            '-c:v', 'libx264', '-preset', a.preset, '-crf', f'{a.crf:g}', *x264, '-pix_fmt', pix,
                            '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                            '-movflags', '+faststart', a.out], stdin=subprocess.PIPE)

    got_idx = [-1]

    def read_frame():
        buf = bytearray(FRAME * 2)
        view = memoryview(buf)
        got = 0
        while got < len(buf):
            k = dec.stdout.readinto(view[got:])
            if not k:
                return None
            got += k
        got_idx[0] += 1
        return np.frombuffer(buf, dtype='<u2').reshape(H, W, 3)

    # TPDF noise in output LSB, one set per plane; a few frames of it, cycled
    rng = np.random.default_rng(7)

    def tpdf(shape):
        return (rng.random(shape, dtype=np.float32) + rng.random(shape, dtype=np.float32) - np.float32(1)) * np.float32(a.dither)

    bank = [(tpdf((H, W)), tpdf((H // 2, W // 2)), tpdf((H // 2, W // 2))) for _ in range(max(1, a.dither_frames))] \
        if a.dither > 0 else None

    def quantize(p, noise, where):
        p = p * np.float32(gain) if gain != 1 else p
        if noise is not None and where is not None:
            p = p + (noise if where is True else np.where(where, noise, np.float32(0)))
        return np.clip(np.floor(p + np.float32(0.5)), 0, top).astype(dtype)

    cache = OrderedDict()  # source index -> frame (uniform mode windows may overlap or repeat)

    def get(idx):
        while got_idx[0] < idx:
            fr = read_frame()
            if fr is None:
                enc.stdin.close()
                enc.wait()
                fail(f'sub-frame stream ended at frame {got_idx[0] + 1}, expected {expected} ({desc})')
            cache[got_idx[0]] = fr
        return cache[idx]

    def next_frame():
        fr = read_frame()
        if fr is None:
            enc.stdin.close()
            enc.wait()
            fail(f'sub-frame stream ended at frame {got_idx[0] + 1}, expected {expected} ({desc})')
        return fr

    acc = np.zeros((H, W, 3), dtype=np.float32)
    changed = np.zeros((H, W, 3), dtype=bool)
    dithered = 0.0
    last_log = time.time()
    for f, idxs in enumerate(plan):
        # samples mode streams (a frame's sub-frames are consecutive and used once); uniform mode
        # windows can repeat an index at the ends, so it keeps a small cache
        src = (lambda i: next_frame()) if not a.uniform else get
        first = src(idxs[0])
        acc[:] = first
        blurred = len(idxs) > 1
        if blurred:
            changed[:] = False
            for i in idxs[1:]:
                x = src(i)
                acc += x
                changed |= x != first
            acc /= len(idxs)
        planes = to_ycbcr(acc)
        noise = bank[f % len(bank)] if bank is not None else (None, None, None)
        if bank is None:
            wheres = (None, None, None)
        elif a.dither_mask == 'all':
            wheres = (True, True, True)
        elif a.dither_mask == 'changed':  # the older rule: every pixel the shutter changed
            ch = changed[..., 0] | changed[..., 1] | changed[..., 2] if blurred else np.zeros((H, W), bool)
            wheres = (ch, half_any(ch), half_any(ch))
        else:  # gradient: smooth ramps only, in every frame; flat areas and hard edges are rounded
            wheres = []
            for p, r in zip(planes, (1, 0.5, 0.5)):  # chroma planes are half size
                wheres.append((local_range(p, int(FLAT_R * r)) > FLAT_EPS) & (local_range(p, int(EDGE_R * r)) <= RAMP_MAX))
        if bank is not None:
            dithered += float(np.mean(wheres[0]))
        for p, d, w in zip(planes, noise, wheres):
            enc.stdin.write(quantize(p, d, w).tobytes())
        if a.uniform:
            lo = plan[f + 1][0] if f + 1 < len(plan) else got_idx[0] + 1
            for k in [k for k in cache if k < lo]:
                del cache[k]
        if not a.quiet and time.time() - last_log > 10:
            last_log = time.time()
            el = time.time() - t0
            sys.stderr.write(f'  accumulated {f + 1}/{n_out} frames, {el:.0f}s, eta {el / (f + 1) * (n_out - f - 1):.0f}s\n')

    extra = 0
    while read_frame() is not None:  # drain (uniform mode drops a partial last group)
        extra += 1
    if a.uniform:
        extra = 0
    enc.stdin.close()
    rc = enc.wait()
    dec.stdout.close()
    dec.wait()
    if extra:
        fail(f'sub-frame stream has {extra} more frames than {a.samples} expects ({desc})')
    if rc:
        fail(f'encoder failed (exit {rc})')
    if not a.quiet:
        sys.stderr.write(f'wrote {a.out}: {desc}, {W}x{H}@{out_fps:g}, crf {a.crf:g} {a.x264_params or "x264 defaults"} '
                         f'{pix} bt709, dither on {100 * dithered / max(1, n_out):.1f}% of pixels ({a.dither_mask}), '
                         f'{time.time() - t0:.0f}s\n')
    print(a.out)


if __name__ == '__main__':
    main()
