#!/usr/bin/env python3
"""Sync and true-peak gate for a muxed film: is the delivered audio where the source WAV says it is?

Decodes the audio of the rendered file (after AAC, exactly what a viewer hears), cross-correlates it
with the source soundtrack at a few points and fails if any lag exceeds the tolerance (48 samples =
1 ms at 48 kHz). Remotion's own AAC mux leaves ~2048 samples of encoder priming in the stream, so an
unchecked mux is typically 2-3 frames late; this catches that and any wrong-file or trimmed mux.
It also measures the true peak of the decoded audio (4x oversampled): AAC encoding raises peaks by
~0.5-1 dB, so a WAV that passed before encode can clip after.

Sample points: by default 12%, 45% and 85% of the overlap; a point whose reference window is
silent moves to the nearest window with signal, so fades and silences never produce false fails.
Both signals are high-passed (500 Hz) and the correlation is normalised by the local energy of
each candidate window. Without that, a sustained low bass note (one 49 Hz cycle is ~980 samples)
or a fading tail makes the raw correlation peak a whole bass cycle away from the true lag.

Usage:
  python3 scripts/check-sync.py out/film.mp4 [public/audio/soundtrack.wav]
  python3 scripts/check-sync.py out/act3.mp4 public/audio/soundtrack.wav --ref-offset 14.0
  python3 scripts/check-sync.py out/film.mp4 --points 4,14,28 --tol 48 --tp-max -1 --json out/qa/sync.json

Options: --tol samples (48), --points auto|comma-separated seconds, --window s (2.0), --search s
(0.1), --ref-offset s (video t=0 corresponds to this time in the WAV, for excerpt renders),
--tp-max dBTP (-1.0), --min-corr (0.5, below this the audio does not match the source),
--highpass Hz (500; 0 = broadband),
--lufs/--lufs-tol (optional loudness gate), --json FILE, --quiet.
Prints JSON on stdout, a readable summary on stderr. Exit 0 = pass, 1 = fail.
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('source', nargs='?', default='public/audio/soundtrack.wav')
    ap.add_argument('--tol', type=int, default=48, help='max |lag| in samples (default 48 = 1 ms at 48 kHz)')
    ap.add_argument('--points', default='auto', help="'auto' (12/45/85%%) or seconds, e.g. 4,14,28")
    ap.add_argument('--window', type=float, default=2.0, help='correlation window, seconds')
    ap.add_argument('--search', type=float, default=0.1, help='max lag searched, seconds')
    ap.add_argument('--ref-offset', type=float, default=0.0, help='WAV time that corresponds to video t=0')
    ap.add_argument('--tp-max', type=float, default=-1.0, help='true-peak ceiling after decode, dBTP')
    ap.add_argument('--min-corr', type=float, default=0.5, help='min normalised correlation at the best lag')
    ap.add_argument('--highpass', type=float, default=500.0,
                    help='high-pass both signals at this frequency (Hz) before correlating; 0 = broadband (default 500)')
    ap.add_argument('--lufs', type=float, help='optional integrated-loudness gate target')
    ap.add_argument('--lufs-tol', type=float, default=1.0)
    ap.add_argument('--json', help='also write the report here')
    ap.add_argument('--quiet', action='store_true')
    return ap.parse_args()


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12) if len(x) else -240.0


def ncc(dw, rw):
    """Normalised cross-correlation of rw slid across dw ('valid' lags): each lag is divided by the
    energy of the dw segment it covers, so a loud stretch (or a long bass cycle) cannot win on level."""
    n = len(rw)
    c = signal.correlate(dw, rw, mode='valid', method='fft')
    e = np.concatenate([[0.0], np.cumsum(np.square(dw, dtype=np.float64))])
    seg = np.sqrt(np.maximum(e[n:] - e[:-n], 0.0))
    return c / (seg * np.linalg.norm(rw) + 1e-12)


def main():
    a = parse_args()
    report = {'video': a.video, 'source': a.source, 'pass': False}

    def say(msg):
        if not a.quiet:
            sys.stderr.write(msg + '\n')

    def done(ok):
        report['pass'] = bool(ok)
        out = json.dumps(report, indent=1)
        print(out)
        if a.json:
            os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
            with open(a.json, 'w') as fh:
                fh.write(out + '\n')
        say('check-sync PASS' if ok else 'check-sync FAIL')
        sys.exit(0 if ok else 1)

    for p in (a.video, a.source):
        if not os.path.exists(p):
            report['error'] = f'missing file: {p}'
            say(report['error'])
            done(False)

    ref, sr = sf.read(a.source, always_2d=True, dtype='float32')
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.video, '-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
                       capture_output=True)
    if r.returncode or not r.stdout:
        report['error'] = 'no decodable audio stream in the video: ' + r.stderr.decode(errors='replace').strip()[:300]
        say(report['error'])
        done(False)
    dec = np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2)
    ref_m = ref.mean(axis=1) if ref.shape[1] > 1 else ref[:, 0]
    dec_m = dec.mean(axis=1)
    off = int(round(a.ref_offset * sr))
    ref_m = ref_m[off:]
    if a.highpass > 0:
        # Same zero-phase filter on both: removes the bass that makes lag estimates periodic, and
        # cannot shift one signal against the other.
        sos = signal.butter(4, a.highpass, btype='highpass', fs=sr, output='sos')
        hp_ref = signal.sosfiltfilt(sos, ref_m).astype(np.float32)
        hp_dec = signal.sosfiltfilt(sos, dec_m).astype(np.float32)
        # Fall back to broadband if the soundtrack has almost nothing above the cut-off.
        if rms_db(hp_ref) > rms_db(ref_m) - 40:
            ref_m, dec_m = hp_ref, hp_dec
            report['highpass_hz'] = a.highpass
        else:
            report['highpass_hz'] = 0
    else:
        report['highpass_hz'] = 0
    overlap = min(len(ref_m), len(dec_m)) / sr
    report.update(sample_rate=sr, decoded_seconds=round(len(dec_m) / sr, 4),
                  reference_seconds=round(len(ref_m) / sr, 4), ref_offset=a.ref_offset)

    search = int(a.search * sr)
    win = min(a.window, max(0.25, overlap / 5))
    n_win = int(win * sr)
    if overlap * sr < n_win + 2 * search:
        report['error'] = f'overlap too short to measure ({overlap:.2f}s)'
        say(report['error'])
        done(False)

    lo_t, hi_t = a.search, overlap - win - a.search  # window starts that leave room for the search
    if a.points == 'auto':
        wanted = [lo_t + f * (hi_t - lo_t) for f in (0.12, 0.45, 0.85)]
    else:
        wanted = [min(max(float(x), lo_t), hi_t) for x in a.points.split(',') if x.strip()]

    # windows with signal: reference RMS above -50 dBFS; move a silent point to the nearest loud one
    step = 0.25
    starts = np.arange(lo_t, hi_t + 1e-9, step)
    loud = [t for t in starts if rms_db(ref_m[int(t * sr):int(t * sr) + n_win]) > -50]
    points, worst, weak = [], 0, False
    if not loud:
        report['error'] = 'reference is silent everywhere in the overlap; nothing to correlate'
        say(report['error'])
        done(False)
    used = set()
    for t in wanted:
        tt = t
        if rms_db(ref_m[int(t * sr):int(t * sr) + n_win]) <= -50:
            tt = min(loud, key=lambda x: abs(x - t))
        if round(tt, 2) in used:
            continue
        used.add(round(tt, 2))
        s0 = int(tt * sr)
        rw = ref_m[s0:s0 + n_win]
        dw = dec_m[s0 - search:s0 + n_win + search]
        c = ncc(dw, rw)
        k = int(np.argmax(c))
        lag = k - search
        corr = float(c[k])
        worst = max(worst, abs(lag))
        weak |= corr < a.min_corr
        points.append({'t': round(float(tt), 3), 'lag_samples': lag, 'lag_ms': round(lag / sr * 1000, 3), 'corr': round(corr, 4)})
        say(f'  t={tt:6.2f}s  lag {lag:+d} samples ({lag / sr * 1000:+.2f} ms)  corr {corr:.3f}')
    report.update(points=points, worst_lag_samples=worst, tol_samples=a.tol)
    sync_ok = worst <= a.tol and not weak
    if weak:
        say(f'  weak correlation (< {a.min_corr}): the muxed audio does not match {a.source}')
    say(f'sync {"OK" if sync_ok else "FAIL"}: worst {worst} samples (tol {a.tol})')

    tp = float(20 * np.log10(np.max(np.abs(signal.resample_poly(dec, 4, 1, axis=0))) + 1e-12))
    tp_ok = tp <= a.tp_max
    report.update(true_peak_dbtp=round(tp, 2), tp_max=a.tp_max, true_peak_ok=tp_ok, sync_ok=sync_ok)
    say(f'true peak {tp:.2f} dBTP ' + ('OK' if tp_ok else f'FAIL (above {a.tp_max} dBTP: lower the limiter ceiling)'))

    lufs_ok = True
    try:
        import pyloudnorm as pyln
        lufs = float(pyln.Meter(sr).integrated_loudness(dec.astype(np.float64)))
        report['lufs'] = round(lufs, 2) if np.isfinite(lufs) else None
        if a.lufs is not None:
            lufs_ok = np.isfinite(lufs) and abs(lufs - a.lufs) <= a.lufs_tol
            say(f'loudness {lufs:.2f} LUFS ' + ('OK' if lufs_ok else f'FAIL (target {a.lufs} +-{a.lufs_tol})'))
        else:
            say(f'loudness {lufs:.2f} LUFS')
    except ImportError:
        report['lufs'] = None
    done(sync_ok and tp_ok and lufs_ok)


if __name__ == '__main__':
    main()
