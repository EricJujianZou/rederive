#!/usr/bin/env python3
"""Decide how many motion-blur samples each frame needs, from how fast things move on screen.

Optical flow on a sharp render gives, per frame, the speed of the fastest moving content. Each
output frame is later rendered as n sub-frames across the shutter (the FilmSub composition) so that
neighbouring samples land at most --step px apart: fast moves smear instead of stamping copies,
and still frames render once. The output (out/samples.json) is passed to FilmSub as --props.

Only motion the flow can vouch for counts, because every over-read costs render time for nothing
(a raw maximum read 2-3x too fast on flat shapes, flashes and repeating grids):
  dense  = the k-th fastest *consistent* moving pixel of Farneback flow: forward and backward flow
           agree there (|fwd + bwd| < 0.5 px + 10%), k = max(--dense-min-px, (1-pct)*consistent);
           the backward flow is computed only when the raw dense read could win
  sparse = the --track-pct percentile of *consistent* corner tracks (pyramidal LK, forward-backward
           error < 1 px, and at least --track-support neighbours moving the same way), not the maximum
  v      = max(dense, sparse) scaled to the source width. A one-frame spike (> --spike x both
           neighbours) stands only when dense and sparse agree within 30%; otherwise it takes the
           larger neighbour, because real motion is smooth at 60 fps
  speed[f] = max(v[f], v[f+1])  (the shutter straddles the frame, so it sees both neighbours' moves)
Then a +-N frame temporal max filter (no n flicker 4 -> 34 -> 4, which reads as strobing blur),
optional floors over known fast ranges and an optional analytic speed track exported from the
timeline (max of both wins).

Cuts. A pair of frames where most pixels change (--cut-frac) and the flow cannot explain the change
(a hard cut, a flash, a full-frame luminance flip) contributes no speed, is listed in `cuts` and
renders with one sample, so its frame never averages the two shots into a double exposure (at an act
boundary src/blur.ts also clamps the samples to the act). A whip pan also changes most pixels, but the flow explains it, so it keeps
its speed. Smaller unexplained changes are listed as suspect_cuts; with --cues, the ones away from
act boundaries are flagged.

  n = 1                                           if speed < --still
  n = clamp(ceil(shutter/360 * speed / step), --min, --max)   otherwise
  --budget X  then caps the total at X times the frame count: the fastest frames are trimmed first
              (never below --min), and the capped frames are listed in the log and the JSON.
A frame whose samples would sit more than --step px apart (over the cap, or capped by --budget) gets
a shorter shutter in `shutters` (src/blur.ts reads it), so it draws one clean, shorter streak instead
of stepped copies; --no-short-shutter keeps the full shutter. Frames faster than --too-fast (80 px/f)
are listed as too_fast: blur cannot make them read, so the log asks for a redesign of the move.

--shutter must match SHUTTER in src/blur.ts (240 by default).

Blind spots (use --floor or --analytic there, and check those frames at 1:1 in the master): an
edge with no 2D structure (a flat band sweeping the full frame reads ~0), a small flat object
jumping more than ~150 px/f at the default analysis width (both trackers lose it), and the first
frame of an object entering from off-frame (the max filter usually covers it).

Usage:
  python3 scripts/measure-speed.py sharp.mp4 out/samples.json
  python3 scripts/measure-speed.py sharp.mp4 out/samples.json --shutter 240 --step 3 --min 4 --max 32 --still 2
  python3 scripts/measure-speed.py sharp.mp4 out/samples.json --floor 1210-1260:16 --analytic out/speed.json
  python3 scripts/measure-speed.py sharp.mp4 out/samples.json --budget 6      # at most 6x the frame count
  python3 scripts/measure-speed.py excerpt.mp4 out/samples.json --offset 600   # excerpt starts at film frame 600

--analytic FILE: JSON {"speed": [px/f per film frame]} or {"ranges": [{"from": a, "to": b, "speed": v}]}
                 (px per frame at output resolution, absolute film frames).
--offset F:      the video starts at film frame F; groups/speed are padded with F still frames so
                 FilmSub indexes them correctly (render.sh --frames uses this).
Writes JSON {groups, speed, offset, frames, fps, width, height, shutter, step, min, max, still,
cuts, suspect_cuts, subframes, multiple, peak, budget, capped, too_fast, short_shutter, shutters?,
fastest_frames, ...}. Exit 0 on success, 1 on failure.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
from fractions import Fraction
from multiprocessing import Pool

import numpy as np


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('video', help='sharp (unblurred) render of the film or an excerpt, or an earlier samples JSON to re-decide groups from its speed track')
    ap.add_argument('out', help='samples JSON to write (e.g. out/samples.json)')
    ap.add_argument('--shutter', type=float, default=240, help='shutter angle in degrees; must match src/blur.ts')
    ap.add_argument('--step', type=float, default=3.0, help='max px between neighbouring samples at output size')
    ap.add_argument('--min', type=int, default=4, help='min samples on a moving frame')
    ap.add_argument('--max', type=int, default=32, help='max samples per frame (32 covers 144 px/f at a 3 px step)')
    ap.add_argument('--still', type=float, default=2.0, help='px/f below which a frame renders once')
    ap.add_argument('--width', type=int, default=960, help='analysis width (height keeps the aspect)')
    ap.add_argument('--mask-thr', type=int, default=6, help='grey-level change that counts as moving')
    ap.add_argument('--dense-pct', type=float, default=99.9, help='dense-flow robust-max percentile')
    ap.add_argument('--dense-min-px', type=int, default=30, help='min pixel count behind the dense robust max')
    ap.add_argument('--track-pct', type=float, default=90, help='percentile of the consistent corner tracks')
    ap.add_argument('--track-support', type=int, default=2, help='neighbouring tracks that must move the same way')
    ap.add_argument('--fb-tol', type=float, default=0.5, help='forward-backward flow error allowed (px at analysis size, + 10%%)')
    ap.add_argument('--spike', type=float, default=1.25, help='a pair this much faster than both neighbours needs both trackers to agree (0 = off)')
    ap.add_argument('--maxfilter', type=int, default=2, help='temporal max filter radius in frames (0 = off)')
    ap.add_argument('--cut-mad', type=float, default=12.0, help='mean grey change above which a pair may be a hard cut')
    ap.add_argument('--cut-frac', type=float, default=0.5, help='share of changed pixels above which an unexplained change is a cut')
    ap.add_argument('--budget', type=float, default=0, help='cap total sub-frames at this multiple of the frame count (0 = off)')
    ap.add_argument('--too-fast', type=float, default=80, help='px/f above which a move is flagged for redesign')
    ap.add_argument('--min-shutter', type=float, default=45, help='shortest fallback shutter in degrees')
    ap.add_argument('--no-short-shutter', action='store_true', help='keep the full shutter on frames the samples cannot cover')
    ap.add_argument('--floor', action='append', default=[], help="a-b:n, min samples over frames a..b (repeatable, comma list ok)")
    ap.add_argument('--analytic', help='JSON speed track exported from the timeline (px/f)')
    ap.add_argument('--cues', help='out/cues.json: warn about hard cuts that are not act boundaries')
    ap.add_argument('--offset', type=int, default=0, help='film frame index of the first frame of the video')
    ap.add_argument('--workers', type=int, default=max(1, min(4, (os.cpu_count() or 2) // 2)))
    ap.add_argument('--quiet', action='store_true')
    return ap.parse_args()


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                        'stream=width,height,avg_frame_rate,r_frame_rate', '-of', 'json', path], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'measure-speed.py: cannot read {path}: {r.stderr.strip()}')
    s = json.loads(r.stdout)['streams'][0]
    fps = None
    for k in ('avg_frame_rate', 'r_frame_rate'):
        try:
            f = Fraction(s[k])
            if f > 0:
                fps = float(f)
                break
        except (ValueError, ZeroDivisionError):
            pass
    return s['width'], s['height'], fps


CFG = {}


def init_worker(cfg):
    import cv2
    cv2.setNumThreads(1)
    CFG.update(cfg)


def pair_speed(job):
    """Speed (px/f at analysis size) of the move a -> b, plus cut evidence.

    Returns (dense, sparse, mad, resid, frac): the consistent dense speed, the consistent track
    speed, the mean grey change, how much of it the flow leaves unexplained, and the changed share.
    """
    import cv2
    a, b = job
    diff = cv2.absdiff(a, b)
    moving = diff > CFG['mask_thr']
    count = int(moving.sum())
    mad = float(diff.mean())
    frac = count / moving.size
    if count < 20:
        return 0.0, 0.0, mad, 0.0, frac
    h, w = a.shape
    fwd = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 5, 21, 3, 7, 1.5, 0)
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    mx, my = gx + fwd[..., 0], gy + fwd[..., 1]
    mag = np.hypot(fwd[..., 0], fwd[..., 1])

    def kth(values):
        n = len(values)
        if n < CFG['dense_min_px']:
            return 0.0
        k = min(n, max(CFG['dense_min_px'], int(math.ceil(n * (1 - CFG['dense_pct'] / 100.0)))))
        return float(np.partition(values, n - k)[n - k])

    # how much of the change the flow explains: warp b back onto a (for cut detection)
    resid = 1.0
    if mad > CFG['cut_mad'] or frac > CFG['cut_frac']:
        warped = cv2.remap(b, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        resid = float(cv2.absdiff(a, warped).mean()) / max(mad, 1e-6)
    sparse = 0.0
    pts = cv2.goodFeaturesToTrack(a, 600, 0.01, 5, mask=cv2.dilate(moving.astype(np.uint8), None, iterations=4))
    if pts is not None and len(pts) >= 3:
        lk = dict(winSize=(21, 21), maxLevel=4, criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
        nxt, st1, _ = cv2.calcOpticalFlowPyrLK(a, b, pts, None, **lk)
        back, st2, _ = cv2.calcOpticalFlowPyrLK(b, a, nxt, None, **lk)
        good = (st1[:, 0] == 1) & (st2[:, 0] == 1) & (np.linalg.norm((back - pts)[:, 0], axis=1) < 1.0)
        p0, vel = pts[good, 0], (nxt - pts)[good, 0]
        if len(p0) >= 3:
            # a track counts only when neighbours (within 64 px) move the same way: one object, not
            # a lone tracker that jumped to a look-alike corner
            sp = np.linalg.norm(vel, axis=1)
            near = np.linalg.norm(p0[:, None] - p0[None], axis=2) < 64
            same = np.linalg.norm(vel[:, None] - vel[None], axis=2) < np.maximum(1.0, 0.15 * sp[:, None])
            support = (near & same).sum(axis=1) - 1
            cons = sp[support >= CFG['track_support']]
            if len(cons) >= 3:
                sparse = float(np.percentile(cons, CFG['track_pct']))

    raw = kth(mag[moving])
    if raw <= max(sparse, 1.0):
        # the dense read cannot win (or the frame is still): skip the backward flow, half the cost
        return raw, sparse, mad, resid, frac
    # forward-backward check: where the flow is real, following it forward and then back returns
    # to the start. Flat interiors, occluded edges and aliased repeats fail it.
    bwd = cv2.calcOpticalFlowFarneback(b, a, None, 0.5, 5, 21, 3, 7, 1.5, 0)
    ex = fwd[..., 0] + cv2.remap(bwd[..., 0], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    ey = fwd[..., 1] + cv2.remap(bwd[..., 1], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    ok = moving & (np.hypot(ex, ey) < CFG['fb_tol'] + 0.1 * mag)
    dense = kth(mag[ok])
    return dense, sparse, mad, resid, frac


def frames(path, W, H):
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H}:flags=area', '-f', 'rawvideo',
                            '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    while True:
        b = dec.stdout.read(W * H)
        if len(b) < W * H:
            break
        yield np.frombuffer(b, np.uint8).reshape(H, W)
    dec.wait()


def parse_floors(specs):
    out = []
    for spec in specs:
        for part in spec.split(','):
            part = part.strip()
            if not part:
                continue
            try:
                rng, n = part.split(':')
                a, b = (rng.split('-') + [rng])[:2]
                out.append((int(a), int(b), int(n)))
            except ValueError:
                sys.exit(f'measure-speed.py: bad --floor {part!r} (want a-b:n, e.g. 1210-1260:16)')
    return out


def load_analytic(path, total):
    d = json.load(open(path))
    sp = np.zeros(total)
    if isinstance(d, dict) and 'speed' in d:
        arr = np.asarray(d['speed'], dtype=float)[:total]
        sp[:len(arr)] = arr
    ranges = d.get('ranges', []) if isinstance(d, dict) else d
    for r in ranges or []:
        a, b = int(r['from']), int(r['to'])
        sp[max(0, a):min(total, b + 1)] = np.maximum(sp[max(0, a):min(total, b + 1)], float(r['speed']))
    return sp


def ranges_of(idx, offset=0):
    """[[a, b], ...] runs of consecutive frame indices."""
    out, start = [], None
    for k, i in enumerate(idx):
        if start is None:
            start = i
        if k + 1 == len(idx) or idx[k + 1] != i + 1:
            out.append([start + offset, i + offset])
            start = None
    return out


def measure(a, log, t0):
    """Optical-flow speed per frame of a video: (speed, flow_speed, cuts, suspects, meta)."""
    src_w, src_h, fps = probe(a.video)
    W = min(a.width, src_w) // 2 * 2
    H = int(round(src_h * W / src_w)) // 2 * 2
    scale = src_w / W
    cfg = dict(mask_thr=a.mask_thr, dense_pct=a.dense_pct, dense_min_px=a.dense_min_px, track_pct=a.track_pct,
               track_support=a.track_support, fb_tol=a.fb_tol, cut_mad=a.cut_mad, cut_frac=a.cut_frac)
    res = []  # per pair (i-1 -> i)
    batch = []
    pool = Pool(a.workers, initializer=init_worker, initargs=(cfg,)) if a.workers > 1 else None
    if pool is None:
        init_worker(cfg)

    def flush():
        if batch:
            res.extend(pool.map(pair_speed, batch) if pool else map(pair_speed, batch))
            batch.clear()
            if len(res) % 240 < 64:
                log(f'  measured {len(res) + 1} frames ({time.time() - t0:.0f}s)')

    n_frames, prev = 0, None
    for f in frames(a.video, W, H):
        n_frames += 1
        if prev is not None:
            batch.append((prev, f))
            if len(batch) >= 64:
                flush()
        prev = f
    flush()
    if pool:
        pool.close()
        pool.join()
    if n_frames == 0:
        sys.exit(f'measure-speed.py: no frames decoded from {a.video}')

    dense = np.array([0.0] + [r[0] for r in res]) * scale
    sparse = np.array([0.0] + [r[1] for r in res]) * scale
    mad = np.array([0.0] + [r[2] for r in res])
    resid = np.array([0.0] + [r[3] for r in res])
    frac = np.array([0.0] + [r[4] for r in res])
    v = np.maximum(dense, sparse)

    # Cuts: most pixels change and the flow cannot explain it (hard cut, flash, full-frame flip).
    # No speed from them: a blur sample cannot help there, and a raw read of one reached 1,187 px/f.
    cuts = [i for i in range(1, n_frames) if frac[i] > a.cut_frac and resid[i] > 0.5]
    v[cuts] = 0.0
    # Smaller changes the flow cannot explain (floods, flashes on part of the frame) keep their
    # speed, but a hard cut inside an act would let sub-frames straddle it, so those are reported.
    suspects = [i for i in range(1, n_frames) if mad[i] > a.cut_mad and resid[i] > 0.6 and i not in cuts]
    # One-frame spikes: real motion is smooth at 60 fps, so a pair more than --spike x faster than
    # both neighbours stands only when both trackers see it (a peaky whip does; an object entering
    # from off-frame, whose edge the dense flow misreads, does not). Otherwise take the larger neighbour.
    if a.spike > 0 and n_frames > 2:
        nb = np.maximum(np.r_[0.0, v[:-1]], np.r_[v[1:], 0.0])
        agree = np.minimum(dense, sparse) >= 0.7 * np.maximum(dense, sparse)
        v = np.where((v > a.spike * nb) & ~agree, nb, v)

    speed = np.array([max(v[i], v[i + 1] if i + 1 < n_frames else 0.0) for i in range(n_frames)])
    if a.maxfilter > 0:
        from scipy.ndimage import maximum_filter1d
        speed = maximum_filter1d(speed, size=2 * a.maxfilter + 1, mode='nearest')
    meta = dict(frames=n_frames, fps=fps, width=src_w, height=src_h, measured_s=round(time.time() - t0, 1))
    return speed, speed.copy(), cuts, suspects, meta


def reuse(a, log):
    """The speed track of an earlier samples JSON, to re-decide groups without measuring again."""
    try:
        d = json.load(open(a.video))
        sp = np.asarray(d['speed'], dtype=float)
    except (OSError, ValueError, KeyError) as e:
        sys.exit(f'measure-speed.py: cannot reuse {a.video}: {e}')
    off = int(d.get('offset', 0))
    if a.offset and a.offset != off:
        sys.exit(f'measure-speed.py: {a.video} starts at frame {off}; --offset {a.offset} does not match')
    a.offset = off
    speed = sp[off:]
    cuts = [c - off for c in d.get('cuts', [])]
    suspects = [c - off for c in d.get('suspect_cuts', [])]
    meta = {k: d.get(k) for k in ('frames', 'fps', 'width', 'height', 'sharp_s_per_frame')}
    meta['frames'] = len(speed)
    meta['reused_from'] = a.video
    log(f'  reusing the speed track of {a.video} ({len(speed)} frames)')
    return speed, np.asarray(d.get('flow_speed_track', speed), dtype=float), cuts, suspects, meta


def main():
    a = parse_args()
    t0 = time.time()

    def log(msg):
        if not a.quiet:
            sys.stderr.write(msg + '\n')

    if a.video.endswith('.json'):
        speed, flow_speed, cuts, suspects, meta = reuse(a, log)
    else:
        speed, flow_speed, cuts, suspects, meta = measure(a, log, t0)
    n_frames = meta['frames']
    total = a.offset + n_frames
    if a.analytic:
        speed = np.maximum(speed, load_analytic(a.analytic, total)[a.offset:])

    sfrac = a.shutter / 360.0
    groups = [1 if s < a.still else int(min(a.max, max(a.min, math.ceil(sfrac * s / a.step)))) for s in speed]

    # --budget: cap the samples per frame so the total stays <= budget x frames. The fastest frames
    # lose samples first; still frames stay at 1.
    cap = a.max
    budget = None
    capped = []
    if a.budget > 0:
        budget = {'multiple': a.budget, 'cap': None, 'uncapped_subframes': int(sum(groups))}
        while cap > a.min and sum(min(g, cap) for g in groups) > a.budget * n_frames:
            cap -= 1
        if cap < a.max:
            capped = [i for i, g in enumerate(groups) if g > cap]
            groups = [min(g, cap) for g in groups]
            budget['cap'] = cap
        budget['met'] = sum(groups) <= a.budget * n_frames
    floors = parse_floors(a.floor)
    for fa, fb, n in floors:
        for i in range(max(fa - a.offset, 0), min(fb - a.offset, n_frames - 1) + 1):
            groups[i] = max(groups[i], min(n, a.max))

    # Frames faster than the samples can cover would show stepped copies ("ghosts") over a long
    # smear. Unless --no-short-shutter, they get a shorter shutter instead, so the samples stay
    # --step px apart: a shorter, clean streak. Either way the move is too fast; the log says so.
    shutters = [a.shutter] * n_frames
    short = []
    for i, (s, g) in enumerate(zip(speed, groups)):
        if g > 1 and sfrac * s / g > a.step * 1.02:
            short.append(i)
            if not a.no_short_shutter:
                shutters[i] = round(max(a.min_shutter, 360.0 * a.step * g / s), 1)
    too_fast = [i for i, s in enumerate(speed) if s > a.too_fast]

    # A hard cut renders sharp. Its frame's shutter would otherwise reach back into the outgoing
    # shot (the temporal max filter gives it its neighbours' speed) and average the two shots into
    # one double-exposed frame. At an act boundary src/blur.ts already clamps the samples; inside an
    # act only this keeps the cut clean.
    for c in cuts:
        if 0 <= c < n_frames:
            groups[c] = 1
            shutters[c] = a.shutter
    short = [i for i in short if i not in set(cuts)]

    groups = [1] * a.offset + groups
    sub = int(sum(groups[a.offset:]))
    out = {'groups': groups, 'speed': [0.0] * a.offset + [round(float(s), 1) for s in speed], 'offset': a.offset,
           'frames': n_frames, 'fps': meta.get('fps'), 'width': meta.get('width'), 'height': meta.get('height'),
           'shutter': a.shutter, 'step': a.step, 'min': a.min, 'max': a.max, 'still': a.still,
           'cuts': [c + a.offset for c in cuts], 'suspect_cuts': [c + a.offset for c in suspects],
           'floors': [list(f) for f in floors], 'analytic': bool(a.analytic), 'subframes': sub,
           'multiple': round(sub / n_frames, 2), 'peak': round(float(speed.max()), 1),
           'peak_frame': int(np.argmax(speed)) + a.offset, 'flow_peak': round(float(np.max(flow_speed)), 1),
           'budget': budget, 'capped': ranges_of(capped, a.offset),
           'too_fast': ranges_of(too_fast, a.offset), 'too_fast_px_f': a.too_fast,
           'short_shutter': ranges_of(short, a.offset) if not a.no_short_shutter else [],
           'fastest_frames': [int(i) + a.offset for i in np.argsort(-speed, kind='stable')[:6] if speed[i] >= 12]}
    if not a.no_short_shutter and short:
        out['shutters'] = [a.shutter] * a.offset + shutters  # read by src/blur.ts (per-frame shutter)
    for k in ('sharp_s_per_frame', 'reused_from', 'measured_s'):
        if meta.get(k) is not None:
            out[k] = meta[k]
    if a.cues and (out['suspect_cuts'] or out['cuts']):
        acts = json.load(open(a.cues)).get('acts', {})
        edges = [int(x['from']) for x in acts.values()]
        out['cuts_inside_acts'] = sorted(c for c in out['suspect_cuts'] + out['cuts'] if all(abs(c - e) > 2 for e in edges))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as fh:
        json.dump(out, fh)

    g = np.array(groups[a.offset:])
    log(f'{n_frames} frames -> {sub} sub-frames ({sub / n_frames:.1f}x); still {int((g == 1).sum())}, '
        f'2-8: {int(((g > 1) & (g <= 8)).sum())}, 9-24: {int(((g > 8) & (g <= 24)).sum())}, 25+: {int((g > 24).sum())}; '
        f'peak {out["peak"]:.0f} px/f at frame {out["peak_frame"]}; {time.time() - t0:.0f}s')
    if out['cuts']:
        log(f'  cuts (most pixels changed, flow cannot explain it; no speed taken): frames {out["cuts"][:12]}'
            + (' ...' if len(out['cuts']) > 12 else ''))
    if out.get('cuts_inside_acts'):
        log(f'  check frames {out["cuts_inside_acts"][:12]}: large changes the flow cannot explain, away from act '
            'boundaries. Measured hard cuts render with one sample; any other that is a hard cut must become an ACT '
            'boundary, or its sub-frames blend the two shots (floods, flashes and zoom-throughs are fine).')
    if budget and capped:
        worst = float(max(speed[i] for i in capped))
        log(f'  budget {a.budget:g}x: capped {len(capped)} frames at {cap} samples ({budget["uncapped_subframes"]} -> {sub} '
            f'sub-frames); frames {out["capped"][:8]}' + (' ...' if len(out['capped']) > 8 else '')
            + f'; the fastest ({worst:.0f} px/f) keep a {360.0 * a.step * cap / worst:.0f} deg shutter')
    if budget and not budget['met']:
        log(f'  budget {a.budget:g}x cannot be met even at --min {a.min} samples per moving frame')
    if too_fast:
        log(f'  TOO FAST FOR CLEAN BLUR: frames {out["too_fast"][:8]}' + (' ...' if len(out['too_fast']) > 8 else '')
            + f' move faster than {a.too_fast:g} px/f (peak {out["peak"]:.0f} at frame {out["peak_frame"]}). '
            'Blur smears that into a streak with visible copies; redesign the move: cut on the beat, a match cut, '
            'a mask wipe, or a shorter distance (references/transitions.md).')
    if short:
        log(f'  frames {out["short_shutter"][:8] or ranges_of(short, a.offset)[:8]} need more than {cap} samples: '
            + ('they render with a shorter shutter so samples stay %gpx apart (a clean, shorter streak)' % a.step
               if not a.no_short_shutter else 'with --no-short-shutter they will show stepped copies'))
    print(a.out)


if __name__ == '__main__':
    main()
