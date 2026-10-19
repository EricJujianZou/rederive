#!/usr/bin/env python3
"""Pass/fail spec check on a rendered file: size, fps, duration, codec, pixel format, BT.709 tags, audio.

Run it on every master, preview and deliverable. Players assume BT.709 for HD, so an untagged or
BT.601 file shifts colour on playback; a wrong frame count or a missing/odd audio stream is a
broken deliverable even if the picture looks right.

Usage:
  python3 scripts/probe.py out/film.mp4 --spec 1920x1080@60 --dur 30
  python3 scripts/probe.py out/film.mp4 --spec 1920x1080@60 --frames 1800 --lufs -14 --tp-max -1
  python3 scripts/probe.py out/deliver/loop.mp4 --spec 1920x1080@60 --audio none
  python3 scripts/probe.py out/deliver/Sting.mov --pix-fmt yuva444p10le,yuva444p12le --vcodec prores --audio none
  python3 scripts/probe.py out/deliver/loop.gif --spec 960x540@30 --audio none --max-mb 8

Checks (each only when it applies): size, fps, duration (+-tol, default 1 frame), frame count,
video codec (default h264 for .mp4), pix_fmt (default yuv420p for h264), BT.709 tags
(colorspace/primaries/transfer = bt709, range tv; skipped for GIF), audio presence
(--audio required|none|any), audio codec (aac for .mp4/.mov), sample rate 48 kHz, stereo,
audio length vs video length, optional loudness gates (--lufs, --tp-max) and file size (--max-mb).
Optional extras: --motion (frozen-frame/stutter stats) and --sheet (6x4 contact sheet).

Prints a JSON report on stdout (also to --json FILE), a readable summary on stderr.
Exit code 0 = every check passed, 1 = at least one failed or the file is unreadable.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from fractions import Fraction


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('--spec', help='WxH@fps, WxH or @fps, e.g. 1920x1080@60')
    ap.add_argument('--dur', type=float, help='expected duration in seconds')
    ap.add_argument('--frames', type=int, help='expected frame count (overrides --dur)')
    ap.add_argument('--tol', type=float, help='duration tolerance in seconds (default: 1 frame)')
    ap.add_argument('--vcodec', help='expected video codec (default h264 for .mp4, none otherwise)')
    ap.add_argument('--pix-fmt', help='expected pix_fmt (default yuv420p when the codec is h264)')
    ap.add_argument('--no-color-check', action='store_true', help='skip the BT.709 tag check')
    ap.add_argument('--audio', choices=['required', 'none', 'any'], default='required',
                    help='audio stream expectation (default required; use none for silent loops)')
    ap.add_argument('--acodec', help='expected audio codec (default aac for .mp4/.mov/.m4v)')
    ap.add_argument('--sample-rate', type=int, default=48000)
    ap.add_argument('--channels', type=int, default=2)
    ap.add_argument('--lufs', type=float, help='gate integrated loudness at this target (+-lufs-tol)')
    ap.add_argument('--lufs-tol', type=float, default=1.0)
    ap.add_argument('--tp-max', type=float, help='gate true peak (dBTP), e.g. -1')
    ap.add_argument('--max-mb', type=float, help='file size budget in MB')
    ap.add_argument('--no-loudness', action='store_true', help='skip the ebur128 measurement')
    ap.add_argument('--motion', action='store_true', help='also report frozen/stutter frames (decodes the video)')
    ap.add_argument('--sheet', help='write a 6x4 contact sheet PNG here')
    ap.add_argument('--json', help='also write the JSON report to this file')
    ap.add_argument('--quiet', action='store_true', help='no summary on stderr')
    return ap.parse_args()


def parse_spec(spec):
    w = h = fps = None
    if spec:
        m = re.fullmatch(r'\s*(?:(\d+)x(\d+))?\s*(?:@\s*([\d.]+(?:/[\d.]+)?))?\s*', spec)
        if not m or not any(m.groups()):
            sys.exit(f'probe.py: cannot parse --spec {spec!r} (want WxH@fps, e.g. 1920x1080@60)')
        if m.group(1):
            w, h = int(m.group(1)), int(m.group(2))
        if m.group(3):
            fps = float(Fraction(m.group(3)))
    return w, h, fps


def rate(s):
    try:
        f = Fraction(s)
        return float(f) if f > 0 else None
    except (ValueError, ZeroDivisionError, TypeError):
        return None


def ffprobe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', path],
                       capture_output=True, text=True)
    if r.returncode:
        return None, r.stderr.strip()
    return json.loads(r.stdout), None


def loudness(path):
    r = subprocess.run(['ffmpeg', '-nostats', '-hide_banner', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true',
                        '-f', 'null', '-'], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind('Summary:'):]

    def num(pat):
        m = re.search(pat, s)
        if not m or 'inf' in m.group(1):
            return None
        return float(m.group(1))
    return {'lufs': num(r'I:\s+(-?[\d.]+|-inf) LUFS'), 'lra': num(r'LRA:\s+(-?[\d.]+) LU'),
            'true_peak_dbtp': num(r'Peak:\s+(-?[\d.]+|-inf) dBFS')}


def motion_stats(path):
    import numpy as np
    W, H = 480, 270
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={W}:{H}:flags=area', '-f', 'rawvideo',
                            '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    prev, diffs = None, []
    while True:
        b = dec.stdout.read(W * H)
        if len(b) < W * H:
            break
        f = np.frombuffer(b, np.uint8).astype(np.int16)
        if prev is not None:
            diffs.append(float(np.abs(f - prev).mean()))
        prev = f
    dec.wait()
    d = np.array(diffs)
    if len(d) < 3:
        return {'steps': len(d)}
    moving = d > 0.5
    stutter = np.where(~moving[1:-1] & moving[:-2] & moving[2:])[0] + 2  # frame index of the repeated frame
    return {'steps': len(d), 'moving_ratio': round(float(moving.mean()), 3), 'median_step': round(float(np.median(d)), 3),
            'max_step': round(float(d.max()), 2), 'hard_cuts': int(np.sum(d > 25)),
            'stutter_frames': [int(x) for x in stutter[:50]], 'stutter_count': int(len(stutter))}


def sheet(path, out, dur, fps):
    n = 24
    idx = [int(dur * (i + 0.5) / n * fps) for i in range(n)]
    sel = '+'.join(f'eq(n\\,{i})' for i in idx)
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf',
                        f"select='{sel}',scale=480:-2:in_color_matrix=auto:in_range=auto,tile=6x4:padding=6:color=0x808080",
                        '-frames:v', '1', out])
    return r.returncode == 0


def main():
    a = parse_args()
    ext = os.path.splitext(a.video)[1].lower()
    report = {'file': a.video, 'pass': False, 'checks': [], 'facts': {}}
    checks = report['checks']

    def check(name, ok, expected, actual, note=None):
        c = {'name': name, 'ok': bool(ok), 'expected': expected, 'actual': actual}
        if note:
            c['note'] = note
        checks.append(c)

    def finish():
        report['pass'] = bool(checks) and all(c['ok'] for c in checks)
        out = json.dumps(report, indent=1)
        print(out)
        if a.json:
            os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
            with open(a.json, 'w') as fh:
                fh.write(out + '\n')
        if not a.quiet:
            for c in checks:
                mark = 'ok  ' if c['ok'] else 'FAIL'
                sys.stderr.write(f"  {mark} {c['name']:<12} expected {c['expected']}, got {c['actual']}"
                                 + (f"  ({c['note']})" if c.get('note') else '') + '\n')
            sys.stderr.write(('probe PASS' if report['pass'] else 'probe FAIL') + f': {a.video}\n')
        sys.exit(0 if report['pass'] else 1)

    w, h, want_fps = parse_spec(a.spec)
    if not os.path.exists(a.video):
        report['error'] = 'file not found'
        check('exists', False, 'file', 'missing')
        finish()
    info, err = ffprobe(a.video)
    if info is None:
        report['error'] = err
        check('readable', False, 'decodable', err)
        finish()

    streams = info.get('streams', [])
    v = next((s for s in streams if s['codec_type'] == 'video' and not s.get('disposition', {}).get('attached_pic')), None)
    au = next((s for s in streams if s['codec_type'] == 'audio'), None)
    if v is None:
        check('video', False, 'a video stream', 'none')
        finish()

    fps = rate(v.get('avg_frame_rate')) or rate(v.get('r_frame_rate'))
    frames = int(v.get('nb_read_packets') or v.get('nb_frames') or 0)
    fmt_dur = float(info['format'].get('duration') or 0)
    v_dur = frames / fps if fps and frames else float(v.get('duration') or fmt_dur)
    size_mb = os.path.getsize(a.video) / 1e6
    facts = report['facts']
    facts.update(width=v['width'], height=v['height'], fps=round(fps, 4) if fps else None, frames=frames,
                 duration=round(v_dur, 4), container_duration=round(fmt_dur, 4), vcodec=v['codec_name'],
                 profile=v.get('profile'), pix_fmt=v.get('pix_fmt'),
                 color={'space': v.get('color_space'), 'primaries': v.get('color_primaries'),
                        'transfer': v.get('color_transfer'), 'range': v.get('color_range')},
                 size_mb=round(size_mb, 3), bitrate_kbps=round(size_mb * 8000 / fmt_dur) if fmt_dur else None)

    if w:
        check('size', (v['width'], v['height']) == (w, h), f'{w}x{h}', f"{v['width']}x{v['height']}")
    if want_fps:
        check('fps', fps is not None and abs(fps - want_fps) < 0.01, want_fps, facts['fps'])
    ref_fps = want_fps or fps or 60
    tol = a.tol if a.tol is not None else 1.0 / ref_fps + 1e-3
    if a.frames is not None:
        check('frames', abs(frames - a.frames) <= max(0, round(tol * ref_fps - 1e-3)), a.frames, frames)
        check('duration', abs(v_dur - a.frames / ref_fps) <= tol, f'{a.frames / ref_fps:.3f}s +-{tol:.3f}', f'{v_dur:.3f}s')
    elif a.dur is not None:
        check('duration', abs(v_dur - a.dur) <= tol, f'{a.dur:.3f}s +-{tol:.3f}', f'{v_dur:.3f}s')

    vcodec = a.vcodec or ('h264' if ext in ('.mp4', '.m4v') else None)
    if vcodec:
        check('vcodec', v['codec_name'] == vcodec, vcodec, v['codec_name'])
    pix = a.pix_fmt or ('yuv420p' if v['codec_name'] == 'h264' else None)
    if pix:  # comma-separated alternatives (ffprobe reports ProRes 4444 as yuva444p12le)
        check('pix_fmt', v.get('pix_fmt') in pix.split(','), pix, v.get('pix_fmt'))
    if not a.no_color_check and v['codec_name'] not in ('gif', 'png', 'apng', 'mjpeg'):
        col = facts['color']
        # ProRes carries primaries/transfer but often no matrix tag; its decoder assumes bt709 for HD
        space_ok = col['space'] == 'bt709' or (v['codec_name'] == 'prores' and col['space'] in (None, 'unknown'))
        range_ok = col['range'] == 'tv' or (v['codec_name'] == 'prores' and col['range'] in (None, 'unknown'))
        ok = space_ok and range_ok and col['primaries'] == 'bt709' and col['transfer'] == 'bt709'
        check('bt709', ok, 'bt709/bt709/bt709/tv',
              f"{col['space']}/{col['primaries']}/{col['transfer']}/{col['range']}",
              None if ok else 'encode with scale=out_color_matrix=bt709:out_range=tv and -colorspace/-color_primaries/'
                              '-color_trc bt709 -color_range tv (see references/finishing.md)')

    if au is not None:
        a_frames = au.get('duration')
        a_dur = float(a_frames) if a_frames else fmt_dur
        facts['audio'] = {'codec': au['codec_name'], 'sample_rate': int(au.get('sample_rate', 0)),
                          'channels': au.get('channels'), 'duration': round(a_dur, 4),
                          'bitrate_kbps': round(int(au['bit_rate']) / 1000) if au.get('bit_rate') else None}
    if a.audio == 'required':
        check('audio', au is not None, 'present', 'present' if au else 'none')
    elif a.audio == 'none':
        check('audio', au is None, 'none', au['codec_name'] if au else 'none',
              None if au is None else 'mux with -an for silent deliverables')
    if au is not None and a.audio != 'none':
        acodec = a.acodec or ('aac' if ext in ('.mp4', '.mov', '.m4v') else None)
        if acodec:
            check('acodec', au['codec_name'] == acodec, acodec, au['codec_name'])
        check('sample_rate', int(au.get('sample_rate', 0)) == a.sample_rate, a.sample_rate, int(au.get('sample_rate', 0)))
        check('channels', au.get('channels') == a.channels, a.channels, au.get('channels'))
        a_tol = 1.5 / ref_fps + 2048 / max(1, a.sample_rate) + 0.005
        a_dur = facts['audio']['duration']
        check('audio_len', abs(a_dur - v_dur) <= a_tol, f'{v_dur:.3f}s +-{a_tol:.3f}', f'{a_dur:.3f}s',
              None if abs(a_dur - v_dur) <= a_tol else 'mux with -af apad -shortest (or trim the WAV to the film)')
        if not a.no_loudness or a.lufs is not None or a.tp_max is not None:
            L = loudness(a.video)
            report['loudness'] = L
            if a.lufs is not None:
                ok = L['lufs'] is not None and abs(L['lufs'] - a.lufs) <= a.lufs_tol
                check('lufs', ok, f'{a.lufs}+-{a.lufs_tol}', L['lufs'])
            if a.tp_max is not None:
                ok = L['true_peak_dbtp'] is not None and L['true_peak_dbtp'] <= a.tp_max
                check('true_peak', ok, f'<= {a.tp_max} dBTP', L['true_peak_dbtp'])

    if a.max_mb is not None:
        check('file_size', size_mb <= a.max_mb, f'<= {a.max_mb} MB', f'{size_mb:.2f} MB')
    if a.motion:
        report['motion'] = motion_stats(a.video)
    if a.sheet and fps:
        report['sheet'] = a.sheet if sheet(a.video, a.sheet, v_dur, fps) else None
    finish()


if __name__ == '__main__':
    main()
