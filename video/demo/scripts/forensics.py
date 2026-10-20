#!/usr/bin/env python3
"""Pixel forensics for a rendered film: the artifacts that eyes on contact sheets miss.

Usage:
  python3 scripts/forensics.py out/film.mp4 --cues out/cues.json --json out/qa/forensics.json
  python3 scripts/forensics.py out/film.mp4 --cuts 600,836-840 --freeze-ok 345-359 --json out/qa/f.json
  python3 scripts/forensics.py out/loop.mp4 --loop --json out/qa/loop.json
  python3 scripts/forensics.py out/a.mp4 --against out/b.mp4        # render twice: nondeterministic frames
  python3 scripts/forensics.py out/film.mp4 --from 1440 --to 1979 --track 700,400,512,256

d[f] is the mean absolute RGB change from frame f-1 to frame f at 480x270 (area downscale).
Frames are 0-based and absolute (frame = t * fps). Defaults (every number is a flag):

  check        rule                                                                     result
  spike        d > 1.0 and d > 2.5 * median(d[f-4..f+4] without f) + 0.3 on the whole frame, or the
               same rule with a 1.5 floor inside one of 9 regions (small pops), then classified:
                 cut: overlaps a declared cut                                           info
                 burst: the change is spread over >= 3 frames (whip, flood, landing)   info
                 motion: optical flow explains the change (residual < 0.5)            info
                 seam pop: 1-2 frame change on an act boundary, not motion            fail
                 hit: 1-2 frame change within 2 f of a cue or sound event             warn
                      (inside a region: info)
                 busy: a region spike while the whole frame changes > 0.15x as much   info
                 pop: any other 1-2 frame change that motion does not explain         fail
  stall        d < 0.05 while d[f-1] > 0.8 and d[f+1] > 0.8 (a repeated frame)         fail
  hold         d < 0.1 for > 48 f: frozen (90% of its frames change < 16 px by > 24)  fail
                                   quiet (only small elements move)                   warn
               a static end tail <= 2 s + 1 f is allowed (the audio decays there)
  quiet        60-frame mean d < 0.15 outside holds (nearly locked-off)                warn
  hook         the first 2 s move less than max(0.5, 0.5x the film's median 2 s window)
               (films that start at frame 0, not loops; for films of 6 s or less, the first
               1 s under 0.5x the median 1 s): a muted feed decides in second one      warn
               the first 0.5 s window whose mean d passes max(0.03, 0.3x the median d
               of the film's moving frames) starts after 1.0 s                         warn
                                                         after 2.5 s                   fail
  ghost        a frame differs from both neighbours by > 80 while they agree (< 30) on
               > 2000 px (full-res equivalent) and nothing moves within 192 px         fail
               (the same pattern inside motion is a fast element crossing: info)
  border       the outer 1-3 rows/columns differ by > 40 from rows 5-7 inside, on > 25%
               of the edge, at a constant depth for >= 3 frames (a sliver or gap)      fail
  judder       phase-correlated 256 px patches (3x3 grid, or --track) that move in
               whole-pixel stairs (rests and isolated 1 px jumps) in a slow move     warn
  sharpness    a region's Laplacian variance steps x3 in one frame while the region
               is otherwise calm (a stepped blur ramp)                               warn
  banding      > 3% of the frame in 64 px tiles holding a 1-12 level gradient drawn as
               flat 8-bit plateaus with 1-level contour steps (visible bands)        warn
  smear        compression smear on a flat field (paper, a solid stage): in a large region
               held within +-2 of one code value, 16 px blocks of fine 1-level texture
               sit next to clean ones (the encoder kept a pattern in some blocks and
               flattened others: streaks and blotches under a 25x stretch). The smeared
               share of the frame (the lesser of textured and clean, times the region)
               > 0.2 on >= 2 sampled frames (2 per second, exact luma plane)          fail
                                                              on one sampled frame   warn
  loop seam    (--loop) last->first change <= max(0.4, 1.5 * median step at the ends)  fail
  determinism  (--against) frames whose change between two renders > max(0.3, 5*median) fail

Declare intended cuts, freezes and effects:
  --cuts 600,836-840        hard cuts or flash transitions (a spike overlapping +-1 f is accepted)
  --freeze-ok 345-359       designed freezes/holds (holds, stalls and quiet runs inside are accepted)
  --ignore 10-12            skip every check on these frames (a deliberate glitch)
  --declare qa.json         {"cuts":[600,[836,840]], "freezes":[[345,359]], "ignore":[[10,12]]}
  --cues out/cues.json      the same block under "qa"; events of kind "cut" count as cuts; act
                            boundaries become seams; cue frames and sound events mark hits.

Writes JSON (--json), a x12 banding stretch sheet and a x25 smear sheet next to it, and a short
summary on stdout.
Exit: 0 no failing check (warnings allowed), 1 a failing check, 2 usage or decode error.
Needs ffmpeg/ffprobe, numpy and opencv-python.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from collections import deque

import cv2
import numpy as np

SW, SH = 480, 270  # MAD analysis size; the thresholds are calibrated at this size
APEX_KINDS = ('whoosh', 'sweep', 'suck')  # the loudest point of the sound sits on f
END_KINDS = ('riser', 'swell')  # the sound builds and ends on f


def die(msg):
    print(f'forensics: {msg}', file=sys.stderr)
    sys.exit(2)


# ------------------------------------------------------------------------------------------
# decoding (shared with sheet.py and av-audit.py)
# ------------------------------------------------------------------------------------------
def probe(path):
    """Size, fps, frame count and duration of the first video stream."""
    if not os.path.exists(path):
        die(f'no such file: {path}')
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
             'stream=width,height,r_frame_rate,nb_frames,duration,pix_fmt:format=duration', '-of', 'json', path],
            capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        die('ffprobe not found on PATH')
    except subprocess.CalledProcessError as e:
        die(f'cannot read {path}: {e.stderr.strip()}')
    j = json.loads(out)
    if not j.get('streams'):
        die(f'{path} has no video stream')
    s = j['streams'][0]
    num, den = (s['r_frame_rate'].split('/') + ['1'])[:2]
    fps = float(num) / float(den)
    dur = float(s.get('duration') or j.get('format', {}).get('duration') or 0)
    nb = s.get('nb_frames')
    n = int(nb) if nb and str(nb).isdigit() else int(round(dur * fps))
    return dict(w=int(s['width']), h=int(s['height']), fps=fps, frames=n, duration=dur, pix_fmt=s.get('pix_fmt', ''))


def decode(path, info, start=0, count=None, pix='rgb24', size=None):
    """Yield (frame_index, array). Seeks exactly: the first yielded frame is `start`."""
    w, h = size or (info['w'], info['h'])
    cmd = ['ffmpeg', '-v', 'error', '-nostdin']
    if start > 0:
        cmd += ['-ss', f'{(start - 0.5) / info["fps"]:.6f}']
    cmd += ['-i', path, '-map', '0:v:0']
    if count:
        cmd += ['-frames:v', str(count)]
    if size:
        cmd += ['-vf', f'scale={w}:{h}:flags=area']
    # passthrough: after an accurate seek, the default CFR sync duplicates the first frame
    cmd += ['-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', pix, '-']
    ch = 3 if pix == 'rgb24' else 1
    nbytes = w * h * ch
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    i = start
    try:
        while True:
            buf = p.stdout.read(nbytes)
            if len(buf) < nbytes:
                break
            a = np.frombuffer(buf, np.uint8)
            yield i, (a.reshape(h, w, 3) if ch == 3 else a.reshape(h, w))
            i += 1
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


def decode_y(path, info, start=0, count=None, every=1):
    """Yield (frame_index, luma plane as float32 code values) for every `every`-th frame from `start`.
    The plane is copied as stored (extractplanes, no matrix or range conversion; 10/12-bit sources
    are scaled to 8-bit code units), so a 1-level step in the file is exactly 1.0 here."""
    pf = info.get('pix_fmt', '')
    m = re.search(r'(\d+)(le|be)$', pf)
    bits = int(m.group(1)) if m else 8
    yuv = pf.startswith(('yuv', 'yuvj', 'gray', 'nv'))
    cmd = ['ffmpeg', '-v', 'error', '-nostdin']
    if start > 0:
        cmd += ['-ss', f'{(start - 0.5) / info["fps"]:.6f}']
    cmd += ['-i', path, '-map', '0:v:0']
    if count:  # count source frames; after the select that is ceil(count / every) sampled ones
        cmd += ['-frames:v', str(-(-count // every))]
    sel = f'select=not(mod(n\\,{every}))'
    out_fmt = 'gray' if bits == 8 else f'gray{bits}le'
    cmd += ['-vf', f'{sel},extractplanes=y' if yuv else f'{sel},format=gray', '-fps_mode', 'passthrough',
            '-f', 'rawvideo', '-pix_fmt', out_fmt if yuv else 'gray', '-']
    w, h = info['w'], info['h']
    wide = yuv and bits > 8
    nbytes = w * h * (2 if wide else 1)
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    i = start
    try:
        while True:
            buf = p.stdout.read(nbytes)
            if len(buf) < nbytes:
                break
            a = np.frombuffer(buf, '<u2' if wide else np.uint8).reshape(h, w).astype(np.float32)
            yield i, (a / (1 << (bits - 8)) if wide else a)
            i += every
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


SMEAR_B = 16  # macroblock size: encoder decisions (keep the texture or flatten it) are made per block


def smear_frame(y, min_region=0.01, near=2, mode_min=0.5, tex_hi=0.3, tex_lo=0.02):
    """Compression smear on flat fields. A region counts as a flat field when the 17x17 neighbourhood
    of each of its pixels spans <= 3 code values, it covers >= min_region of the frame, one code value
    holds >= half of it and >= 98% sits within +-near of that value (a truly flat colour, not a
    gradient, texture or blurred UI). In such a field every 16 px block should look alike: all clean
    (an exact encode) or all finely textured (uniform dither or grain). Smear is the mix: blocks whose
    pixels differ from a neighbour on >= tex_hi of the block next to blocks with <= tex_lo. Returns
    the smeared share of the frame (min(textured, clean) x the field's blocks / all blocks)."""
    H, W = y.shape
    y8 = np.clip(np.round(y), 0, 255).astype(np.uint8)
    k = np.ones((17, 17), np.uint8)
    flat = ((cv2.dilate(y8, k).astype(np.int16) - cv2.erode(y8, k)) <= 3).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(flat, connectivity=4)
    diff = np.zeros((H, W), bool)
    diff[:, :-1] |= np.abs(np.diff(y, axis=1)) > 0.5
    diff[:-1] |= np.abs(np.diff(y, axis=0)) > 0.5
    th, tw = H // SMEAR_B, W // SMEAR_B
    if th == 0 or tw == 0:
        return dict(area=0.0, patchy=0.0, field=0.0, level=None)

    def blocks(a):
        return a[:th * SMEAR_B, :tw * SMEAR_B].reshape(th, SMEAR_B, tw, SMEAR_B).mean(axis=(1, 3))

    tex = blocks(diff.astype(np.float32))
    best = dict(area=0.0, patchy=0.0, field=0.0, level=None)
    for c in range(1, n):
        if st[c, cv2.CC_STAT_AREA] < min_region * W * H:
            continue
        inside = lab == c
        full = blocks(inside.astype(np.float32)) >= 0.999
        if full.sum() < 50:
            continue
        hist = np.bincount(y8[inside], minlength=256)
        mode = int(hist.argmax())
        if hist[mode] < mode_min * hist.sum() or hist[max(0, mode - near):mode + near + 1].sum() < 0.98 * hist.sum():
            continue  # a gradient, a texture or soft content: the banding check's business, not this one's
        t = tex[full]
        patchy = min(float((t >= tex_hi).mean()), float((t <= tex_lo).mean()))
        area = patchy * float(full.sum()) / (th * tw)
        if area > best['area'] or best['level'] is None:
            best = dict(area=round(area, 4), patchy=round(patchy, 3), field=round(float(full.sum()) / (th * tw), 3),
                        level=mode)
    return best


def smear_scan(args, info):
    """Sample frames for the smear check; returns [{frame, area, patchy, field, level, _img}]."""
    start = max(0, args.from_frame or 0)
    count = max(1, args.to_frame - start + 1) if args.to_frame is not None else None
    every = args.smear_every or max(1, int(round(info['fps'] / 2)))
    out = []
    for f, y in decode_y(args.video, info, start, count, every):
        r = smear_frame(y)
        lvl = r['level'] if r['level'] is not None else float(np.median(y))
        st = np.clip((y - lvl) * 25 + 128, 0, 255).astype(np.uint8)
        r['_img'] = cv2.cvtColor(cv2.resize(st, (480, int(480 * info['h'] / info['w'])), interpolation=cv2.INTER_AREA),
                                 cv2.COLOR_GRAY2BGR)
        out.append(dict(frame=f, **r))
    return out


# ------------------------------------------------------------------------------------------
# cues (shared with av-audit.py): the new {events:[...]} schema or an older per-key layout
# ------------------------------------------------------------------------------------------
def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def load_cues(path):
    """Normalise a cues file to {fps,total,acts,cue,events:[{f,kind,weight,apex,ends,pan}],qa,schema}.

    New schema: {fps,bpm,total,acts:{name:{from,dur}},cue:{name:f},events:[{f,kind,weight,pan,pitch?,apexFrac?}]}.
    Older exports (per-key lists such as sfx:{name:f|[f]}, peaks:{name:f}, landings:[{f}], rain:[f]) are
    read too: every integer frame list or name->frame map becomes events of that kind; `peaks` and
    whoosh-like names are apex events (the sound's loudest point sits on the frame).
    Event shapes: apex (apexFrac given, or whoosh/suck) peaks on f; ends (riser, swell) builds
    into f; everything else starts on f.
    """
    try:
        c = json.load(open(path))
    except (OSError, json.JSONDecodeError) as e:
        die(f'cannot read cues {path}: {e}')
    total = int(c.get('total') or 0)
    acts = {k: (int(v['from']), int(v['from']) + int(v.get('dur', 0)))
            for k, v in (c.get('acts') or {}).items() if isinstance(v, dict) and 'from' in v}
    cue = {k: int(round(v)) for k, v in (c.get('cue') or {}).items() if _num(v)}
    events = []

    def is_apex(kind):
        return any(a in kind.lower() for a in APEX_KINDS)

    def is_end(kind):
        return any(a in kind.lower() for a in END_KINDS)

    if isinstance(c.get('events'), list):
        schema = 'events'
        for e in c['events']:
            if not isinstance(e, dict) or not _num(e.get('f')):
                continue
            kind = str(e.get('kind', 'hit'))
            apex = ('apexFrac' in e) or is_apex(kind)
            events.append(dict(f=float(e['f']), kind=kind, weight=float(e.get('weight', 1.0)),
                               apex=apex, ends=is_end(kind) and not apex, pan=e.get('pan'), variant=e.get('variant')))
    else:
        schema = 'legacy'
        skip = {'fps', 'total', 'bpm', 'acts', 'cue', 'events', 'qa', 'meta', 'version'}

        def framey(v):
            return _num(v) and float(v).is_integer() and v >= 0 and (not total or v <= total + 1)

        for key, val in c.items():
            if key in skip:
                continue
            if isinstance(val, list) and val and all(framey(v) for v in val):
                events += [dict(f=float(v), kind=key, weight=0.5, apex=is_apex(key), ends=is_end(key), pan=None)
                           for v in val]
            elif isinstance(val, list) and val and all(isinstance(v, dict) and framey(v.get('f')) for v in val):
                events += [dict(f=float(v['f']), kind=key, weight=1.0 if v.get('heavy') else 0.6,
                                apex=is_apex(key), ends=is_end(key), pan=v.get('pan')) for v in val]
            elif isinstance(val, dict):
                for name, v in val.items():
                    apex = key == 'peaks' or is_apex(name)
                    for x in (v if isinstance(v, list) else [v]):
                        if framey(x):
                            events.append(dict(f=float(x), kind=name, weight=1.0, apex=apex,
                                               ends=is_end(name) and not apex, pan=None))
    events.sort(key=lambda e: (e['f'], e['kind']))
    return dict(fps=float(c.get('fps') or 0) or None, total=total, acts=acts, cue=cue, events=events,
                qa=c.get('qa') if isinstance(c.get('qa'), dict) else None, schema=schema)


# ------------------------------------------------------------------------------------------
# declarations
# ------------------------------------------------------------------------------------------
def parse_ranges(text):
    """'345-359,600' -> [(345, 359), (600, 600)]"""
    out = []
    for part in filter(None, (x.strip() for x in (text or '').split(','))):
        try:
            if '-' in part[1:]:
                a, b = part.split('-', 1)
                out.append((int(a), int(b)))
            else:
                out.append((int(part), int(part)))
        except ValueError:
            die(f'bad frame range: {part}')
    return out


def _pairs(items):
    out = []
    for x in items or []:
        if _num(x):
            out.append((int(x), int(x)))
        elif isinstance(x, (list, tuple)) and len(x) == 2:
            out.append((int(x[0]), int(x[1])))
        else:
            raise ValueError(x)
    return out


def load_declarations(args):
    cuts = parse_ranges(args.cuts)
    freezes = parse_ranges(args.freeze_ok)
    ignore = parse_ranges(args.ignore)
    acts, moments = {}, []

    def take(block, where):
        if not isinstance(block, dict):
            return
        try:
            cuts.extend(_pairs(block.get('cuts')))
            freezes.extend(_pairs(block.get('freezes')))
            ignore.extend(_pairs(block.get('ignore')))
        except (TypeError, ValueError):
            die(f'bad qa block in {where}: expected cuts:[f|[a,b]], freezes:[[a,b]], ignore:[[a,b]]')

    if args.declare:
        try:
            take(json.load(open(args.declare)), args.declare)
        except (OSError, json.JSONDecodeError) as e:
            die(f'cannot read --declare {args.declare}: {e}')
    if args.cues:
        c = load_cues(args.cues)
        take(c['qa'], args.cues)
        cuts.extend((int(round(e['f'])), int(round(e['f']))) for e in c['events'] if e['kind'].lower() == 'cut')
        acts = c['acts']
        moments = sorted({int(round(e['f'])) for e in c['events']} | set(c['cue'].values()))
    return sorted(set(cuts)), sorted(set(freezes)), sorted(set(ignore)), acts, moments


def in_ranges(f, ranges, pad=0):
    return any(a - pad <= f <= b + pad for a, b in ranges)


def act_of(f, acts):
    for name, (a, b) in acts.items():
        if a <= f < b:
            return name
    return None


# ------------------------------------------------------------------------------------------
# sheet helpers (labelled tiles), shared with sheet.py
# ------------------------------------------------------------------------------------------
def label(img, text, sub=None):
    font, sc = cv2.FONT_HERSHEY_SIMPLEX, max(0.4, img.shape[1] / 900)
    (tw, th), base = cv2.getTextSize(text, font, sc, 1)
    cv2.rectangle(img, (0, 0), (tw + 8, th + base + 6), (0, 0, 0), -1)
    cv2.putText(img, text, (4, th + 3), font, sc, (255, 255, 255), 1, cv2.LINE_AA)
    if sub:
        (sw, sh), sb = cv2.getTextSize(sub, font, sc * 0.85, 1)
        y0 = th + base + 6
        cv2.rectangle(img, (0, y0), (sw + 8, y0 + sh + sb + 6), (40, 40, 40), -1)
        cv2.putText(img, sub, (4, y0 + sh + 3), font, sc * 0.85, (120, 230, 255), 1, cv2.LINE_AA)
    return img


def tile(images, cols, pad=4, bg=(90, 90, 90)):
    h, w = images[0].shape[:2]
    rows = (len(images) + cols - 1) // cols
    out = np.full((rows * h + (rows + 1) * pad, cols * w + (cols + 1) * pad, 3), bg, np.uint8)
    for i, im in enumerate(images):
        r, c = divmod(i, cols)
        y, x = pad + r * (h + pad), pad + c * (w + pad)
        out[y:y + h, x:x + w] = im
    return out


# ------------------------------------------------------------------------------------------
# measurements
# ------------------------------------------------------------------------------------------
def grid_boxes(w, h, n=3, size=256):
    size = min(size, w // n, h // n)
    return [(int(w * (i + 0.5) / n) - size // 2, int(h * (j + 0.5) / n) - size // 2, size, size)
            for j in range(n) for i in range(n)]


def edge_depth(rows, delta, frac):
    """rows[0] is the outermost line of an edge. Returns how many outer lines (1-3) differ from
    rows 5-7, or 0 when nothing differs or the reference rows themselves disagree (an edge of
    content passing through, not a sliver)."""
    if (np.abs(rows[5] - rows[7]) > delta).mean() > frac / 2:
        return 0
    inner = rows[5:8].mean(0)
    depth = 0
    for r in range(4):
        if (np.abs(rows[r] - inner) > delta).mean() > frac:
            depth = r + 1
        else:
            break
    return depth if depth <= 3 else 0


BAND_T = 64


def banding_tiles(gray):
    """Boolean map of 64 px tiles that hold a real low-frequency gradient (1-12 levels across the
    tile) rendered as flat 8-bit plateaus split by 1-level contours: visible bands. Dithered
    gradients are not flat; flat fills have no gradient; edges and texture are not smooth."""
    k = np.ones((5, 5), np.uint8)
    rng = cv2.dilate(gray, k).astype(np.int16) - cv2.erode(gray, k)
    th, tw = gray.shape[0] // BAND_T, gray.shape[1] // BAND_T

    def t(a):
        return a[:th * BAND_T, :tw * BAND_T].reshape(th, BAND_T, tw, BAND_T).mean(axis=(1, 3))

    smooth, flat, step = t(rng <= 2), t(rng == 0), t((rng >= 1) & (rng <= 2))
    q = BAND_T // 4
    lo = cv2.GaussianBlur(cv2.resize(gray, (gray.shape[1] // 4, gray.shape[0] // 4),
                                     interpolation=cv2.INTER_AREA).astype(np.float32), (0, 0), 4)
    lo = lo[:th * q, :tw * q].reshape(th, q, tw, q)
    span = lo.max(axis=(1, 3)) - lo.min(axis=(1, 3))
    return (smooth > 0.97) & (flat > 0.5) & (flat < 0.97) & (step > 0.03) & (span >= 1.0) & (span <= 12)


def stretch(gray, gain=12):
    med = float(np.median(gray))
    return np.clip((gray.astype(np.float32) - med) * gain + 128, 0, 255).astype(np.uint8)


def flow_residual(small_prev, small_cur):
    """How much of the change from prev to cur optical flow cannot explain (0 = pure motion, 1 = none)."""
    a = cv2.cvtColor(small_prev, cv2.COLOR_RGB2GRAY)
    b = cv2.cvtColor(small_cur, cv2.COLOR_RGB2GRAY)
    diff = np.abs(b.astype(np.float32) - a)
    m = diff > 12
    if m.sum() < 10:
        return 0.0
    fl = cv2.calcOpticalFlowFarneback(b, a, None, 0.5, 5, 25, 5, 7, 1.5, 0)
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]].astype(np.float32)
    warped = cv2.remap(a, xx + fl[..., 0], yy + fl[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    res = np.abs(b.astype(np.float32) - warped)
    return float(res[m].mean() / diff[m].mean())


def stairs(v, r, first, win, rmin):
    """Windows of a patch track that move in whole-pixel stairs during a slow move: rests (|u| < 0.15)
    with isolated 1 px jumps between them. Smooth acceleration (rests, then a run of ~1 px steps)
    is not stairs, so at least two jumps must have a rest on both sides."""
    hits = []
    for s in range(0, max(0, len(v) - win + 1), max(1, win // 2)):
        seg, rr = v[s:s + win], r[s:s + win]
        if np.isnan(seg).any() or (rr < rmin).mean() > 0.1:
            continue
        disp = seg.sum(0)
        D = float(np.hypot(*disp))
        if D < 2.0 or D / win > 0.9:
            continue
        u = seg @ (disp / D)
        rest, jump = np.abs(u) < 0.15, np.abs(u - 1) < 0.2
        isolated = sum(1 for i in range(1, win - 1) if jump[i] and rest[i - 1] and rest[i + 1])
        if isolated >= 2 and (rest | jump).mean() >= 0.9:
            hits.append(dict(frm=first + s, to=first + s + win - 1, speed=round(D / win, 3),
                             jumps=int(jump.sum()), isolated=isolated))
    merged = []
    for h in hits:
        if merged and h['frm'] <= merged[-1]['to'] + 1:
            merged[-1]['to'] = h['to']
            merged[-1]['jumps'] = max(merged[-1]['jumps'], h['jumps'])
            merged[-1]['isolated'] = max(merged[-1]['isolated'], h['isolated'])
        else:
            merged.append(dict(h))
    return [{'from': m.pop('frm'), **m} for m in merged]


def rolling_median_excl(d, i, r=4):
    lo, hi = max(1, i - r), min(len(d), i + r + 1)
    nb = np.concatenate([d[lo:i], d[i + 1:hi]])
    return float(np.median(nb)) if len(nb) else 0.0


def runs(mask):
    """[(start, end_inclusive)] of True runs."""
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(mask) - 1))
    return out


# ------------------------------------------------------------------------------------------
# pass 1: decode once, measure everything per frame
# ------------------------------------------------------------------------------------------
def analyse(args, info):
    fps, W, H = info['fps'], info['w'], info['h']
    start = max(0, args.from_frame or 0)
    count = max(1, args.to_frame - start + 1) if args.to_frame is not None else None
    hw, hh = W // 2, H // 2
    gscale = (W * H) / (hw * hh)  # ghost pixel counts are reported at full-res equivalent
    sboxes = [(int(hw * i / 3), int(hh * j / 3), hw // 3, hh // 3) for j in range(3) for i in range(3)]
    rboxes = [(int(SW * i / 3), int(SH * j / 3), SW // 3, SH // 3) for j in range(3) for i in range(3)]
    tracks = {} if args.no_judder else {f'p{k}': b for k, b in enumerate(grid_boxes(W, H, 3, 256))}
    for k, t in enumerate(args.track or []):
        try:
            x, y, w, h = [int(float(q)) for q in t.split(',')]
        except ValueError:
            die(f'bad --track {t}: expected x,y,w,h')
        if x < 0 or y < 0 or w < 16 or h < 16 or x + w > W or y + h > H:
            die(f'--track {t} is outside the {W}x{H} frame')
        tracks[f'track{k}'] = (x, y, w, h)
    hann = {k: cv2.createHanningWindow((b[2], b[3]), cv2.CV_32F) for k, b in tracks.items()}
    band_every = args.banding_every or max(1, int(round(fps)))
    ghost_margin = 96  # half-res px: a fast element moves up to ~190 full-res px per frame

    M = dict(idx=[], d=[], d2=[], nchg=[], dr=[], sharp=[], depth={e: [] for e in ('top', 'bottom', 'left', 'right')},
             tv={k: [] for k in tracks}, tr={k: [] for k in tracks}, ghosts=[], crossings=[], band=[], det=[],
             tracks=tracks, sboxes=sboxes, rboxes=rboxes)
    smallq = deque(maxlen=3)
    halfq = deque(maxlen=3)
    prev_gray = None
    first_small = None
    other = None
    if args.against:
        oinfo = probe(args.against)
        if (oinfo['w'], oinfo['h']) != (W, H):
            die('--against file has a different size')
        other = decode(args.against, oinfo, start, count)

    for f, rgb in decode(args.video, info, start, count):
        small = cv2.resize(rgb, (SW, SH), interpolation=cv2.INTER_AREA).astype(np.int16)
        M['idx'].append(f)
        if smallq:
            diff = np.abs(small - smallq[-1])
            M['d'].append(float(diff.mean()))
            M['nchg'].append(int((diff.max(axis=2) > 24).sum()))
            M['dr'].append([float(diff[y:y + h, x:x + w].mean()) for (x, y, w, h) in rboxes])
        else:
            M['d'].append(np.nan)
            M['nchg'].append(0)
            M['dr'].append([0.0] * 9)
        smallq.append(small)
        if len(smallq) == 3:  # change from f-2 to f, stored at f-1 (out-and-back test)
            M['d2'].append(float(np.abs(smallq[2] - smallq[0]).mean()))
        if first_small is None:
            first_small = small
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        g16 = gray.astype(np.int16)
        for name, rows in (('top', g16[:8]), ('bottom', g16[-1:-9:-1]), ('left', g16[:, :8].T),
                           ('right', g16[:, -1:-9:-1].T)):
            M['depth'][name].append(edge_depth(rows, args.border_delta, args.border_frac))

        half = cv2.resize(gray, (hw, hh), interpolation=cv2.INTER_AREA).astype(np.int16)
        halfq.append((f, half))
        if len(halfq) == 3:
            (_, g0), (f1, g1), (_, g2) = halfq
            agree = np.abs(g2 - g0) < 30
            odd = (np.abs(g1 - g0) > args.ghost_delta) & (np.abs(g1 - g2) > args.ghost_delta) & agree
            n_odd = int(odd.sum()) * gscale
            if n_odd > args.ghost_px:
                ys, xs = np.nonzero(odd)
                x0, x1 = max(0, xs.min() - ghost_margin), min(hw, xs.max() + ghost_margin + 1)
                y0, y1 = max(0, ys.min() - ghost_margin), min(hh, ys.max() + ghost_margin + 1)
                moving = int((~agree[y0:y1, x0:x1]).sum()) * gscale
                bx, by = int(xs.min() * 2), int(ys.min() * 2)
                item = dict(frame=f1, px=int(n_odd), motion_px=int(moving),
                            bbox=[bx, by, int(xs.max() * 2) - bx + 2, int(ys.max() * 2) - by + 2])
                (M['ghosts'] if n_odd > 1.5 * moving else M['crossings']).append(item)

        lap = cv2.Laplacian(half.astype(np.float32), cv2.CV_32F)
        M['sharp'].append([float(lap[y:y + h, x:x + w].var()) for (x, y, w, h) in sboxes])

        if tracks:
            gf = gray.astype(np.float32)
            for k, (x, y, w, h) in tracks.items():
                cur = gf[y:y + h, x:x + w]
                prv = prev_gray[y:y + h, x:x + w] if prev_gray is not None else None
                if prv is None or cur.std() < 4 or prv.std() < 4:
                    M['tv'][k].append((np.nan, np.nan))
                    M['tr'][k].append(0.0)
                    continue
                (dx, dy), resp = cv2.phaseCorrelate(prv, cur, hann[k])
                M['tv'][k].append((dx, dy))
                M['tr'][k].append(resp)
            prev_gray = gf

        if not args.no_banding and (f - start) % band_every == 0:
            bt = banding_tiles(gray)
            area = float(bt.mean())
            if area > 0 or len(M['band']) < 1:
                img = cv2.cvtColor(stretch(gray), cv2.COLOR_GRAY2BGR)
                for (ty, tx) in zip(*np.nonzero(bt)):
                    cv2.rectangle(img, (tx * BAND_T, ty * BAND_T), ((tx + 1) * BAND_T - 1, (ty + 1) * BAND_T - 1),
                                  (0, 0, 255), 3)
                M['band'].append(dict(frame=f, area=round(area, 4), tiles=int(bt.sum()),
                                      _img=cv2.resize(img, (480, int(480 * H / W)), interpolation=cv2.INTER_AREA)))

        if other is not None:
            try:
                _, orgb = next(other)
                osmall = cv2.resize(orgb, (SW, SH), interpolation=cv2.INTER_AREA).astype(np.int16)
                M['det'].append((f, float(np.abs(small - osmall).mean())))
            except StopIteration:
                other = None
                M['det'].append((f, np.nan))
    if not M['idx']:
        die('decoded 0 frames (bad file, or --from beyond the end)')
    M['first_small'], M['last_small'] = first_small, smallq[-1]
    return M


# ------------------------------------------------------------------------------------------
# pass 2: classify
# ------------------------------------------------------------------------------------------
def evaluate(args, info, M, decl):
    fps = info['fps']
    if args.max_end_hold is None:  # the audio's decay: 2 s whatever the frame rate
        args.max_end_hold = int(round(2 * fps)) + 1
    cuts, freezes, ignore, acts, moments = decl
    idx = np.array(M['idx'])
    f0, n, last = int(idx[0]), len(idx), int(idx[-1])
    dd = np.nan_to_num(np.array(M['d'], dtype=np.float64), nan=0.0)
    nchg = np.array(M['nchg'])
    dr = np.array(M['dr'])
    seams = sorted(a for a, _ in acts.values() if a > 0)
    flags = []

    def ignored(f):
        return in_ranges(f, ignore)

    def add(check, severity, frame, note, **kw):
        first = frame if isinstance(frame, int) else int(str(frame).split('-')[0])
        item = dict(check=check, severity=severity, frame=frame, t=round(first / fps, 3), note=note)
        if acts:
            item['act'] = act_of(first, acts)
        item.update(kw)
        flags.append(item)

    # --- spikes: whole frame, then each of the 9 regions (small pops hide in the global mean)
    def spike_events(x):
        cand = [k for k in range(1, n) if not ignored(f0 + k) and x[k] > args.spike_min * scale
                and x[k] > args.spike_ratio * rolling_median_excl(x, k) + args.spike_add]
        evs = []
        for k in cand:
            b = rolling_median_excl(x, k)
            e = b + 0.35 * (x[k] - b)
            a_, z_ = k, k
            while a_ - 1 >= 1 and x[a_ - 1] > e and k - a_ < 6:
                a_ -= 1
            while z_ + 1 < n and x[z_ + 1] > e and z_ - k < 6:
                z_ += 1
            if evs and a_ <= evs[-1]['z'] + 1:
                ev = evs[-1]
                ev['z'] = max(ev['z'], z_)
                if x[k] > x[ev['k']]:
                    ev['k'], ev['base'] = k, b
            else:
                evs.append(dict(a=a_, z=z_, k=k, base=b))
        return evs

    scale = 1.0
    events = [dict(ev, region=None, series=dd) for ev in spike_events(dd)]
    scale = args.region_spike_min / args.spike_min
    for rg, box in enumerate(M['rboxes']):
        x = dr[:, rg]
        for ev in spike_events(x):
            if any(g['a'] - 1 <= ev['z'] and ev['a'] <= g['z'] + 1 for g in events if g['region'] is None):
                continue
            events.append(dict(ev, region=rg, series=x))
    events.sort(key=lambda ev: (ev['k'], -1 if ev['region'] is None else ev['region']))

    need = sorted({f0 + ev['k'] for ev in events if ev['z'] - ev['a'] + 1 < args.burst_frames}
                  | {f0 + ev['k'] - 1 for ev in events if ev['z'] - ev['a'] + 1 < args.burst_frames})
    smalls, spans = {}, []
    for f in need:  # re-decode the frames of short events for the flow test, in merged spans
        if spans and f - spans[-1][1] <= 30:
            spans[-1][1] = f
        else:
            spans.append([f, f])
    wanted = set(need)
    for a, b in spans:
        for f, im in decode(args.video, info, a, b - a + 1, size=(SW, SH)):
            if f in wanted:
                smalls[f] = im.copy()
    spikes = []
    for ev in events:
        x, rg = ev['series'], ev['region']
        fa, fz, fk = f0 + ev['a'], f0 + ev['z'], f0 + ev['k']
        L = fz - fa + 1
        it = dict(frame=fk, frames=[fa, fz], mad=round(float(x[ev['k']]), 3), neighbour_median=round(ev['base'], 3))
        where = ''
        if rg is not None:
            bx, by, bw, bh = M['rboxes'][rg]
            k4 = info['w'] / SW
            it['region'] = [int(bx * k4), int(by * k4), int(bw * k4), int(bh * k4)]
            where = f' in region {it["region"]}'
        seam = next((s for s in seams if fa - 1 <= s <= fz + 1), None)
        on_cue = next((m for m in moments if fa - 2 <= m <= fz + 2), None)
        if any(a - 1 <= fz and fa <= b + 1 for a, b in cuts):
            it['class'] = 'cut'
        elif L >= args.burst_frames:
            it['class'] = 'burst'
        else:
            if fk - 1 in smalls and fk in smalls:
                pa, pb = smalls[fk - 1], smalls[fk]
                if rg is not None:
                    bx, by, bw, bh = M['rboxes'][rg]
                    pa, pb = pa[by:by + bh, bx:bx + bw], pb[by:by + bh, bx:bx + bw]
                res = flow_residual(pa, pb)
            else:
                res = 1.0
            it['flow_residual'] = round(res, 2)
            j = ev['a'] - 1  # d2[j] is the change across the middle frame a (out-and-back test)
            it['out_and_back'] = bool(rg is None and L == 2 and 0 <= j < len(M['d2'])
                                      and M['d2'][j] < 0.5 * (dd[ev['a']] + dd[ev['z']]))
            busy = rg is not None and rolling_median_excl(dd, ev['k']) > args.region_busy * x[ev['k']]
            if res < args.flow_explained:
                it['class'] = 'motion'
            elif busy:
                it['class'] = 'busy'  # the whole frame is changing a lot: part of a larger move
            elif seam is not None:
                it['class'] = 'seam-pop'
            elif on_cue is not None:
                it['class'] = 'hit' if rg is None else 'region-hit'
            else:
                it['class'] = 'pop'
        it['seam'] = seam
        it['cue'] = on_cue
        spikes.append(it)
        what = 'a one-frame image' if it.get('out_and_back') else f'a {L}-frame change'
        size = f'({it["mad"]} vs {ev["base"]:.2f} around it{where})'
        if it['class'] == 'seam-pop':
            add('spike', 'fail', fk, f'{what} at the act seam f{seam} {size} that motion does not explain: a '
                'property flipping across the cut; match it on both sides, or declare the cut',
                mad=it['mad'], cls=it['class'], region=it.get('region'))
        elif it['class'] == 'pop':
            add('spike', 'fail', fk, f'{what} {size} that motion does not explain and no cue marks: a pop, a '
                'fade collapsing into 1-2 frames, or an undeclared cut', mad=it['mad'], cls=it['class'],
                region=it.get('region'))
        elif it['class'] == 'hit':
            add('spike', 'warn', fk, f'{what} on the cue at f{on_cue} {size}: fine if it is a designed hit; a '
                'fade or reveal that finishes in 1-2 frames reads as a pop', mad=it['mad'], cls=it['class'],
                region=it.get('region'))

    # --- stalls
    stalls = []
    for k in range(2, n - 1):
        f = f0 + k
        if ignored(f) or in_ranges(f, freezes, 1):
            continue
        if dd[k] < args.stall_max and dd[k - 1] > args.stall_moving and dd[k + 1] > args.stall_moving:
            seam = next((s for s in seams if abs(s - f) <= 1), None)
            stalls.append(dict(frame=f, mad=round(float(dd[k]), 3), before=round(float(dd[k - 1]), 2),
                               after=round(float(dd[k + 1]), 2), seam=seam))
            add('stall', 'fail', f, f'frame {f} repeats frame {f - 1} inside motion (stop-hold-go)'
                + (f' at the seam f{seam}' if seam else '') + '; show the rest pose once or keep the move alive')

    # --- holds
    still = dd < args.hold_mad
    still[0] = False
    holds = []
    for a, b in runs(still):
        fa, fb = f0 + a - 1, f0 + b
        length = fb - fa + 1
        if length <= args.max_hold:
            continue
        frozen = float(np.percentile(nchg[a:b + 1], 90)) < args.frozen_px  # a stray moving frame is not life
        declared = any(fa >= x - 2 and fb <= y + 2 for x, y in freezes)
        at_end = fb >= info['frames'] - 2
        kind = 'declared' if declared else 'end' if at_end else ('frozen' if frozen else 'quiet')
        holds.append({'from': fa, 'to': fb, 'frames': length, 'seconds': round(length / fps, 2), 'kind': kind,
                      'mean_mad': round(float(dd[a:b + 1].mean()), 3), 'max_changed_px': int(nchg[a:b + 1].max())})
        if kind == 'declared' or ignored(fa) or ignored(fb):
            continue
        if kind == 'end':
            if length > args.max_end_hold:
                add('hold', 'fail', f'{fa}-{fb}', f'static end tail of {length} f ({length / fps:.1f} s); keep it <= '
                    f'{args.max_end_hold} f (the audio decay) or give it a visible build (a slow push or drift)')
        elif kind == 'frozen':
            add('hold', 'fail', f'{fa}-{fb}', f'{length} f ({length / fps:.1f} s) frozen: reads as a stalled player; '
                'add a build (push, drift, breath) or declare it with --freeze-ok')
        else:
            add('hold', 'warn', f'{fa}-{fb}', f'{length} f ({length / fps:.1f} s) where only small elements move '
                f'(mean change {holds[-1]["mean_mad"]}): the frame reads locked-off; add a push or drift')

    # --- quiet stretches that are not already holds
    quiet = []
    win = args.quiet_window
    if n > win:
        cs = np.concatenate([[0], np.cumsum(dd)])
        mean = (cs[win:] - cs[:-win]) / win  # mean[k] covers dd[k..k+win-1]
        for a, b in runs(mean < args.quiet_mad):
            fa, fb = f0 + a, f0 + b + win - 1
            if any(h['from'] <= fb and fa <= h['to'] for h in holds):
                continue
            if any(fa >= x - 2 and fb <= y + 2 for x, y in freezes) or ignored(fa):
                continue
            q = {'from': fa, 'to': fb, 'mean_mad': round(float(dd[a:b + win].mean()), 3)}
            quiet.append(q)
            add('quiet', 'warn', f'{fa}-{fb}', f'{fb - fa + 1} f of near-stillness (mean change {q["mean_mad"]}); '
                'fine for a read, otherwise add drift or a push')

    # --- hook: the opening carries at least the film's typical energy (a muted feed decides in second one)
    hook = None
    hw = int(round(2 * fps))
    if n <= 3 * hw:  # a sting or a short cut: judge its first second against its typical second
        hw = int(round(fps))
    if f0 == 0 and last + 1 >= info['frames'] - 2 and n > 3 * hw and not getattr(args, 'loop', False):
        cs = np.concatenate([[0], np.cumsum(dd)])
        typical = float(np.median((cs[hw:] - cs[:-hw]) / hw))
        opening = float(dd[1:hw].mean())
        hook = dict(first_2s=round(opening, 3), typical_2s=round(typical, 3))
        if opening < max(0.5 if hw > fps * 1.5 else 0.0, 0.5 * typical) and not ignored(0):
            add('hook', 'warn', f'0-{hw - 1}', f'the first {hw / fps:.0f} s move {opening:.2f} against a typical {hw / fps:.0f} s of {typical:.2f}: '
                'a still opening loses a muted feed; start inside the action (the device already moving, the first '
                'change by 0.5 s) and let the first line land over motion')

    # --- a still opening: the first visible change comes at a median 0.1 s (all by 0.43 s) in top-tier
    # launch films, and a still title held 2.7 s before any motion reads as a slow hook. "Still" is
    # measured on the film's own scale (a fine-line sting moves less than a product film): the first
    # half second whose mean change passes 0.3x the median change of the film's moving frames.
    first_change = None
    if f0 == 0 and not getattr(args, 'loop', False) and n > fps:
        moving = dd[1:][dd[1:] > args.hold_mad]
        thr = max(0.03, 0.3 * float(np.median(moving))) if len(moving) else 0.03
        w = max(1, int(round(fps / 2)))
        cs = np.concatenate([[0], np.cumsum(dd)])
        over = np.nonzero((cs[w:] - cs[:-w]) / w > thr)[0]
        first_change = round(float(over[0]) / fps, 2) if len(over) else round(n / fps, 2)
        hook = {**(hook or {}), 'first_change_s': first_change}
        if first_change > 1.0 and not ignored(0) and not any(x <= 2 for x, _ in freezes):
            add('hook', 'fail' if first_change > 2.5 else 'warn', f'0-{int(first_change * fps)}',
                f'the first visible change comes at {first_change:.1f} s: it belongs inside 0.5 s, and the first '
                'hard change (a cut, a reveal, a surge) by about 1.3 s. Start inside the action, put a push or drift '
                'under the first read, or declare a designed still with --freeze-ok')

    # --- ghosts
    for g in M['ghosts']:
        if ignored(g['frame']) or in_ranges(g['frame'], cuts, 1):
            continue
        add('ghost', 'fail', g['frame'], f'one-frame image on {g["px"]} px that neither neighbour has and nothing '
            'near it moves (stale layer, compositor race, one-frame flash): inspect with grab.sh', bbox=g['bbox'])

    # --- border slivers: constant depth for >= N frames
    borders = []
    for edge, dep in M['depth'].items():
        dep = np.array(dep)
        k = 0
        while k < n:
            if dep[k] == 0:
                k += 1
                continue
            j = k
            while j + 1 < n and dep[j + 1] == dep[k]:
                j += 1
            if j - k + 1 >= args.sliver_frames and not ignored(f0 + k):
                borders.append(dict(edge=edge, depth_px=int(dep[k]), frames=[f0 + k, f0 + j]))
                add('border', 'fail', f'{f0 + k}-{f0 + j}', f'{edge} edge: the outer {dep[k]} px differ from the '
                    f'pixels inside for {j - k + 1} frames (a sliver or gap); overscan moving layers, clamp the camera')
            k = j + 1

    # --- judder (whole-pixel stairs)
    judder = []
    for key, box in M['tracks'].items():
        v = np.array(M['tv'][key], dtype=np.float64)
        r = np.array(M['tr'][key], dtype=np.float64)
        for w in stairs(v, r, f0, args.judder_window, args.judder_resp):
            if ignored(w['from']) or ignored(w['to']):
                continue
            w['track'], w['box'] = key, list(box)
            judder.append(w)
            add('judder', 'warn', f'{w["from"]}-{w["to"]}', f'a slow move ({w["speed"]} px/f) in {key} {list(box)} '
                f'advances in whole-pixel stairs ({w["jumps"]} jumps): put all translation inside one transform '
                'and animate no left/top', track=key)

    # --- sharpness steps in otherwise calm regions
    S = np.array(M['sharp'])
    sharp_steps = []
    spiky = [(s_['frames'][0] - 1, s_['frames'][1] + 1) for s_ in spikes if s_['class'] != 'motion']
    for k in range(2, n - 1):
        f = f0 + k
        if ignored(f) or in_ranges(f, cuts, 1) or in_ranges(f, spiky):
            continue  # a spike there is already reported
        for rg in range(S.shape[1]):
            a_, b_ = S[k - 1, rg], S[k, rg]
            if max(a_, b_) < args.sharp_min:
                continue
            ratio = max(a_, b_) / max(min(a_, b_), 1e-3)
            if ratio < args.sharp_ratio or dr[k - 1, rg] > 1.0 or dr[k + 1, rg] > 1.0:
                continue
            p = max(S[k - 1, rg], S[k - 2, rg]) / max(min(S[k - 1, rg], S[k - 2, rg]), 1e-3)
            q = max(S[k, rg], S[k + 1, rg]) / max(min(S[k, rg], S[k + 1, rg]), 1e-3)
            if p < 1.5 and q < 1.5:
                x, y, w, h = M['sboxes'][rg]
                reg = [x * 2, y * 2, w * 2, h * 2]
                sharp_steps.append(dict(frame=f, region=reg, before=round(float(a_), 1), after=round(float(b_), 1)))
                add('sharpness', 'warn', f, f'sharpness {a_:.0f} -> {b_:.0f} in one frame in region {reg} while it '
                    'is otherwise still: a stepped blur ramp; cross-fade a sharp and a blurred copy (RackFocus)')
                break

    # --- banding
    band = [{k: v for k, v in s.items() if k != '_img'} for s in M['band']]
    for s in band:
        s['flagged'] = s['area'] > args.band_area
        if s['flagged'] and not ignored(s['frame']):
            add('banding', 'warn', s['frame'], f'{s["area"] * 100:.1f}% of the frame ({s["tiles"]} tiles) is smooth '
                'gradient in flat 8-bit plateaus: visible bands; use dithered PNG backdrops (red boxes in the sheet)')
    band_sheet = None
    if M['band'] and args.banding_sheet:
        picks = sorted(M['band'], key=lambda s: -s['area'])[:8]
        rest = [s for s in M['band'] if s not in picks]
        picks += rest[:: max(1, len(rest) // max(1, 12 - len(picks)))][:12 - len(picks)]
        picks.sort(key=lambda s: s['frame'])
        ims = [label(s['_img'].copy(), f'f{s["frame"]} {s["frame"] / fps:.2f}s',
                     f'x12  banded {s["area"] * 100:.1f}%') for s in picks]
        os.makedirs(os.path.dirname(os.path.abspath(args.banding_sheet)), exist_ok=True)
        cv2.imwrite(args.banding_sheet, tile(ims, 4))
        band_sheet = args.banding_sheet

    # --- compression smear on flat fields
    smear = [{k: v for k, v in x.items() if k != '_img'} for x in M.get('smear', [])]
    over = [x for x in smear if x['area'] > args.smear_area and not ignored(x['frame'])]
    for x in smear:
        x['flagged'] = x in over
    if over:
        sev = 'fail' if len(over) >= 2 else 'warn'
        worst = max(over, key=lambda x: x['area'])
        span = f'{over[0]["frame"]}-{over[-1]["frame"]}' if len(over) > 1 else over[0]['frame']
        add('smear', sev, span, f'compression smear on the flat field (level {worst["level"]}) in {len(over)} sampled '
            f'frames, up to {worst["area"] * 100:.0f}% of the frame at f{worst["frame"]}: blocks of fine 1-level texture '
            'next to clean ones (smear sheet). Blurred master: re-run the current scripts/accumulate.py, which rounds '
            'flat fields exactly; otherwise encode at a lower CRF or 10-bit', frames=[x['frame'] for x in over][:50])
    smear_sheet = None
    if M.get('smear') and args.smear_sheet:
        picks = sorted(M['smear'], key=lambda x: -x['area'])[:4]
        rest = [x for x in M['smear'] if x not in picks]
        picks += rest[:: max(1, len(rest) // 4)][:8 - len(picks)]
        picks.sort(key=lambda x: x['frame'])
        ims = [label(x['_img'].copy(), f'f{x["frame"]} {x["frame"] / fps:.2f}s',
                     f'x25 smear {x["area"] * 100:.0f}% (field {x["field"] * 100:.0f}%)') for x in picks]
        os.makedirs(os.path.dirname(os.path.abspath(args.smear_sheet)), exist_ok=True)
        cv2.imwrite(args.smear_sheet, tile(ims, 4))
        smear_sheet = args.smear_sheet

    # --- loop seam
    loop = None
    if args.loop:
        seam = float(np.abs(M['last_small'] - M['first_small']).mean())
        ends = np.concatenate([dd[1:9], dd[-8:]])
        local = float(np.median(ends)) if len(ends) else 0.0
        limit = max(args.seam_abs, args.seam_ratio * local)
        loop = {'seam_mad': round(seam, 3), 'median_step_at_ends': round(local, 3), 'limit': round(limit, 3),
                'pass': seam <= limit}
        if not loop['pass']:
            add('loop_seam', 'fail', last, f'loop seam change {seam:.2f} > {limit:.2f}: the last frame does not flow '
                'into frame 0 (match state and velocity; the loop is whole bars long)')

    # --- determinism
    det = None
    if args.against:
        vals = np.array([x for _, x in M['det']], dtype=np.float64)
        med = float(np.nanmedian(vals)) if len(vals) and not np.isnan(vals).all() else 0.0
        lim = max(args.det_min, args.det_ratio * med)
        bad = [dict(frame=f, mad=round(x, 3)) for f, x in M['det'] if not np.isnan(x) and x > lim]
        det = dict(against=args.against, median=round(med, 4), limit=round(lim, 3), frames=bad[:200])
        for b in bad[:50]:
            add('determinism', 'fail', b['frame'], f'the two renders differ here ({b["mad"]}): nondeterministic '
                'frame; look for will-change on a blurred layer, Math.random, Date.now')
        if np.isnan(vals).any() or probe(args.against)['frames'] != info['frames']:
            add('determinism', 'fail', last, 'the two renders have different frame counts')

    # --- energy summary for pacing reads
    step = max(1, int(round(fps)))
    per_sec = [round(float(dd[max(1, s):s + step].mean()), 2) for s in range(0, n, step) if len(dd[max(1, s):s + step])]
    per_act = {}
    for name, (a, b) in acts.items():
        lo, hi = max(1, a - f0), min(n, b - f0)
        if hi > lo:
            seg = dd[lo:hi]
            per_act[name] = dict(mean=round(float(seg.mean()), 2), p90=round(float(np.percentile(seg, 90)), 2),
                                 still_frac=round(float((seg < args.hold_mad).mean()), 2))
    seam_table = [dict(frame=s, mad=round(float(dd[s - f0]), 3), neighbour_median=round(rolling_median_excl(dd, s - f0), 3))
                  for s in seams if 1 <= s - f0 < n]

    sev = {'fail': 0, 'warn': 1}
    flags.sort(key=lambda x: (sev[x['severity']], int(str(x['frame']).split('-')[0])))
    fails = sum(1 for x in flags if x['severity'] == 'fail')
    warns = len(flags) - fails
    counts = {}
    for s in spikes:
        counts[s['class']] = counts.get(s['class'], 0) + 1
    return {
        'file': args.video, 'fps': round(fps, 3), 'size': [info['w'], info['h']], 'frames': n, 'range': [f0, last],
        'pass': fails == 0, 'fails': fails, 'warnings': warns,
        'declared': dict(cuts=[list(x) for x in cuts], freezes=[list(x) for x in freezes],
                         ignore=[list(x) for x in ignore], cue_moments=len(moments)),
        'thresholds': {k: getattr(args, k) for k in (
            'spike_min', 'region_spike_min', 'region_busy', 'spike_ratio', 'spike_add', 'burst_frames', 'flow_explained', 'stall_max', 'stall_moving',
            'hold_mad', 'max_hold', 'frozen_px', 'max_end_hold', 'quiet_window', 'quiet_mad', 'ghost_delta',
            'ghost_px', 'border_delta', 'border_frac', 'sliver_frames', 'judder_window', 'judder_resp',
            'sharp_ratio', 'sharp_min', 'band_area', 'smear_area', 'seam_abs', 'seam_ratio', 'det_min', 'det_ratio')},
        'stats': dict(mad_median=round(float(np.median(dd[1:])), 3) if n > 1 else 0,
                      mad_p90=round(float(np.percentile(dd[1:], 90)), 3) if n > 1 else 0,
                      mad_max=round(float(dd.max()), 3), mad_max_frame=int(f0 + int(np.argmax(dd))),
                      spike_classes=counts, fast_crossings=len(M['crossings']),
                      energy_per_second=per_sec, energy_per_act=per_act),
        'flags': flags,
        'checks': dict(spikes=spikes, stalls=stalls, holds=holds, quiet=quiet, hook=hook, ghosts=M['ghosts'],
                       crossings=M['crossings'][:100], borders=borders, judder=judder, sharpness=sharp_steps,
                       banding=band, banding_sheet=band_sheet, smear=smear, smear_sheet=smear_sheet,
                       seams=seam_table, loop=loop, determinism=det),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    ap.add_argument('video')
    ap.add_argument('--json', help='write the report here (e.g. out/qa/forensics.json)')
    ap.add_argument('--cues', help='out/cues.json: act seams, cue moments, a "qa" block, events of kind "cut"')
    ap.add_argument('--declare', help='JSON with cuts / freezes / ignore')
    ap.add_argument('--cuts', help='declared hard cuts or flash transitions, e.g. 600,836-840')
    ap.add_argument('--freeze-ok', help='declared freezes/holds, e.g. 345-359')
    ap.add_argument('--ignore', help='frames to skip entirely, e.g. 10-12')
    ap.add_argument('--from', dest='from_frame', type=int, help='first frame to analyse')
    ap.add_argument('--to', dest='to_frame', type=int, help='last frame to analyse (inclusive)')
    ap.add_argument('--loop', action='store_true', help='check the loop seam (last frame -> frame 0)')
    ap.add_argument('--against', help='a second render of the same thing; report frames that differ')
    ap.add_argument('--track', action='append', help='x,y,w,h region to phase-track for judder (repeatable)')
    ap.add_argument('--no-judder', action='store_true', help='skip the automatic 3x3 judder patches')
    ap.add_argument('--no-banding', action='store_true')
    ap.add_argument('--banding-sheet', help='x12 contrast-stretch sheet PNG (default: banding.png next to --json)')
    ap.add_argument('--banding-every', type=int, help='sample one frame per N for banding (default: fps)')
    ap.add_argument('--no-smear', action='store_true', help='skip the flat-field compression smear check')
    ap.add_argument('--smear-sheet', help='x25 stretch sheet of the smear samples (default: smear.png next to --json)')
    ap.add_argument('--smear-every', type=int, help='sample one frame per N for smear (default: fps / 2)')
    ap.add_argument('--curves', help='also write per-frame MAD and sharpness curves to this JSON')
    g = ap.add_argument_group('thresholds (defaults are proven starting points; see references/review-loop.md)')
    g.add_argument('--spike-min', type=float, default=1.0)
    g.add_argument('--spike-ratio', type=float, default=2.5)
    g.add_argument('--spike-add', type=float, default=0.3)
    g.add_argument('--region-spike-min', type=float, default=1.5, help='spike floor inside one of 9 regions')
    g.add_argument('--region-busy', type=float, default=0.15,
                   help='a region spike is part of a larger move when the whole-frame change exceeds this share')
    g.add_argument('--burst-frames', type=int, default=3, help='a change spread over this many frames is a burst')
    g.add_argument('--flow-explained', type=float, default=0.5, help='flow residual below this = motion')
    g.add_argument('--stall-max', type=float, default=0.05)
    g.add_argument('--stall-moving', type=float, default=0.8)
    g.add_argument('--hold-mad', type=float, default=0.1)
    g.add_argument('--max-hold', type=int, default=48, help='frames')
    g.add_argument('--frozen-px', type=int, default=16, help='a hold is frozen if fewer px change by >24 levels')
    g.add_argument('--max-end-hold', type=int, default=None, help='frames of static tail allowed at the end (default: 2 s at the film\'s rate, plus 1)')
    g.add_argument('--quiet-window', type=int, default=60)
    g.add_argument('--quiet-mad', type=float, default=0.15)
    g.add_argument('--ghost-delta', type=int, default=80)
    g.add_argument('--ghost-px', type=int, default=2000, help='full-res pixels')
    g.add_argument('--border-delta', type=int, default=40)
    g.add_argument('--border-frac', type=float, default=0.25)
    g.add_argument('--sliver-frames', type=int, default=3)
    g.add_argument('--judder-window', type=int, default=24)
    g.add_argument('--judder-resp', type=float, default=0.7, help='phase-correlation response needed')
    g.add_argument('--sharp-ratio', type=float, default=3.0)
    g.add_argument('--sharp-min', type=float, default=30.0)
    g.add_argument('--band-area', type=float, default=0.03)
    g.add_argument('--smear-area', type=float, default=0.2,
                   help='smeared share of the frame that flags a sample (Tessel peaks at 0.15; the smeared sting at 0.29-0.42)')
    g.add_argument('--seam-abs', type=float, default=0.4)
    g.add_argument('--seam-ratio', type=float, default=1.5)
    g.add_argument('--det-min', type=float, default=0.3)
    g.add_argument('--det-ratio', type=float, default=5.0)
    args = ap.parse_args()
    if args.banding_sheet is None and args.json and not args.no_banding:
        args.banding_sheet = os.path.join(os.path.dirname(os.path.abspath(args.json)), 'banding.png')

    if args.smear_sheet is None and args.json and not args.no_smear:
        args.smear_sheet = os.path.join(os.path.dirname(os.path.abspath(args.json)), 'smear.png')

    info = probe(args.video)
    decl = load_declarations(args)
    M = analyse(args, info)
    M['smear'] = [] if args.no_smear else smear_scan(args, info)
    res = evaluate(args, info, M, decl)

    if args.curves:
        os.makedirs(os.path.dirname(os.path.abspath(args.curves)), exist_ok=True)
        with open(args.curves, 'w') as fh:
            json.dump(dict(first=int(M['idx'][0]), fps=res['fps'],
                           mad=[round(float(x), 3) for x in np.nan_to_num(np.array(M['d'], dtype=float))],
                           sharpness=[[round(float(v), 1) for v in row] for row in M['sharp']]), fh)
    if args.json:
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, 'w') as fh:
            json.dump(res, fh, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))

    print(f'forensics: {args.video}  {res["frames"]} frames @ {res["fps"]} fps  '
          f'{"PASS" if res["pass"] else "FAIL"}  ({res["fails"]} fail, {res["warnings"]} warn)')
    for x in res['flags'][:30]:
        act = f' [{x["act"]}]' if x.get('act') else ''
        print(f'  {x["severity"]:4s} {x["check"]:9s} f{x["frame"]}{act}: {x["note"]}')
    if len(res['flags']) > 30:
        print(f'  ... {len(res["flags"]) - 30} more in the JSON')
    if args.json:
        print(f'  report: {args.json}')
    sys.exit(0 if res['pass'] else 1)


if __name__ == '__main__':
    main()
