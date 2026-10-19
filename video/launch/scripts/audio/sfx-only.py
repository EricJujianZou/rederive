#!/usr/bin/env python3
"""Sound-effects-only soundtrack: the sfx stem at the level it has in the full master, no music.

Every film ships a second copy with this audio, so music can be added on the posting platform
(an Instagram song) without clashing with ours. The sfx stem is pre-master, so it gets the gain
the master applied to the whole mix (master RMS over the RMS of the summed stems), then a peak
trim to -1.5 dBFS if it needs one.

  python3 scripts/audio/sfx-only.py --stems out/stems --master public/audio/soundtrack.wav \
      --out public/audio/sfx-only.wav
"""
import argparse
import glob
import os

import numpy as np
import soundfile as sf

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--stems', required=True, help='stems folder written by score.py --stems')
ap.add_argument('--master', required=True, help='the full soundtrack those stems were rendered with')
ap.add_argument('--out', required=True)
a = ap.parse_args()

master, sr = sf.read(a.master, always_2d=True)
stems = {os.path.basename(p)[:-4]: sf.read(p, always_2d=True)[0] for p in glob.glob(os.path.join(a.stems, '*.wav'))}
if 'sfx' not in stems:
    raise SystemExit(f'sfx-only: no sfx.wav in {a.stems}')
n = len(master)
mix = sum(s[:n] for s in stems.values())
rms = lambda x: float(np.sqrt(np.mean(np.square(x)))) or 1e-12
gain = rms(master) / rms(mix)
out = stems['sfx'][:n] * gain
if len(out) < n:
    out = np.pad(out, ((0, n - len(out)), (0, 0)))
peak = float(np.max(np.abs(out)))
ceil = 10 ** (-1.5 / 20)
if peak > ceil:
    out *= ceil / peak
sf.write(a.out, out, sr, subtype='PCM_24')
print(f'sfx-only: {a.out}  gain {20 * np.log10(gain):+.1f} dB from the master, peak {20 * np.log10(max(float(np.max(np.abs(out))), 1e-9)):.1f} dBFS')
