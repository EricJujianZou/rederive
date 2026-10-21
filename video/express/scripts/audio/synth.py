#!/usr/bin/env python3
"""
synth.py: cinetic's instrument and sound-effect library (numpy + scipy, 48 kHz, deterministic).

score.py imports it. Import it yourself for one-off sounds:

    import sys; sys.path.insert(0, 'scripts/audio')
    import synth as S
    bus = S.Bus(seconds=10)
    bus.place(S.snap(S.hz('Eb1')), t=4.0, gain=0.45, pan=0.2)

Conventions
- SR is 48000. Durations are in seconds and pitch is in Hz; convert with hz('Ab5') or mtof(80).
  Octaves are scientific: C4 = MIDI 60, Ab7 = MIDI 104.
- Generators return float64 arrays, mono (n,) or stereo (n, 2), peaking near 1.
- Everything random takes `seed`, so the same call always renders the same samples.
- Oscillators integrate phase (sine, saw, square). sin(2*pi*f(t)*t) chirps on a glide; these do not.

Audition every voice:  python3 synth.py --demo out/palette.wav [--key Eb]
Exit codes: 0 ok, 1 error.
"""
import argparse
import re
import sys
from functools import lru_cache

import numpy as np
from scipy import signal

SR = 48000

# ------------------------------------------------------------------------------------------
# pitch
# ------------------------------------------------------------------------------------------
_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
_NOTE = re.compile(r'^\s*([A-Ga-g])([#b♯♭]{0,2})(-?\d+)?\s*$')


def mtof(m):
    """MIDI note number (float ok) to Hz."""
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def ftom(f):
    """Hz to fractional MIDI note number."""
    return 69 + 12 * np.log2(f / 440.0)


def pitch_class(name):
    """'Eb' -> 3, 'F#' -> 6. Octave digits are ignored."""
    m = _NOTE.match(str(name))
    if not m:
        raise ValueError(f'not a note name: {name!r}')
    acc = m.group(2).replace('♯', '#').replace('♭', 'b')
    return (_PC[m.group(1).upper()] + acc.count('#') - acc.count('b')) % 12


def midi(x):
    """'Ab5' -> 80, 80 -> 80. Accepts note names with octave, or numbers."""
    if isinstance(x, (int, float, np.integer, np.floating)):
        return float(x)
    m = _NOTE.match(str(x))
    if not m or m.group(3) is None:
        raise ValueError(f'need a note with an octave such as "Ab5", got {x!r}')
    acc = m.group(2).replace('♯', '#').replace('♭', 'b')
    return float(_PC[m.group(1).upper()] + acc.count('#') - acc.count('b') + 12 * (int(m.group(3)) + 1))


def hz(x):
    """'Ab5' or MIDI number -> Hz."""
    return mtof(midi(x))


def nearest(pcs, target_midi):
    """MIDI note whose pitch class is in `pcs` and which sits closest to target_midi."""
    best = None
    for p in pcs:
        base = target_midi - ((target_midi - p) % 12)
        for cand in (base, base + 12):
            if best is None or abs(cand - target_midi) < abs(best - target_midi):
                best = cand
    return float(best)


# ------------------------------------------------------------------------------------------
# buffers, noise, filters
# ------------------------------------------------------------------------------------------
def ns(d):
    """seconds -> sample count (at least 1)"""
    return max(1, int(round(d * SR)))


def tt(d):
    return np.arange(ns(d)) / SR


def rng(seed=0):
    return np.random.default_rng(seed)


def noise(d, seed=0):
    return rng(seed).standard_normal(ns(d))


def lp(f, order=2):
    return signal.butter(order, float(np.clip(f, 10, SR * 0.45)), 'low', fs=SR, output='sos')


def hp(f, order=2):
    return signal.butter(order, float(np.clip(f, 10, SR * 0.45)), 'high', fs=SR, output='sos')


def bp(lo, hi, order=2):
    lo, hi = float(np.clip(lo, 10, SR * 0.44)), float(np.clip(hi, 12, SR * 0.45))
    return signal.butter(order, [lo, max(hi, lo * 1.01)], 'band', fs=SR, output='sos')


def filt(x, sos):
    return signal.sosfilt(sos, x, axis=0)


@lru_cache(maxsize=4096)
def _design(kind, qc, order, q):
    c = 2.0 ** (qc / 48.0)
    return lp(c, order) if kind == 'low' else hp(c, order) if kind == 'high' else bp(c / q, c * q, order)


def sweep(x, cutoff, kind='low', order=2, block=256, q=1.35):
    """Time-varying filter. cutoff is Hz per sample (array) or a scalar; kind low|high|band.
    Coefficients are redesigned per block (cutoff quantized to 1/48 octave and cached) with the
    filter state carried across blocks."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=float), (len(x),))
    y = np.zeros_like(x)
    zi = None
    for s in range(0, len(x), block):
        c = float(np.mean(cutoff[s:s + block]))
        sos = _design(kind, int(round(48 * np.log2(max(c, 10.0)))), order, q)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:])
        y[s:s + block], zi = signal.sosfilt(sos, x[s:s + block], axis=0, zi=zi)
    return y


def colored(d, seed=0, alpha=1.6):
    """1/f^alpha noise, unit RMS: alpha 1 is pink, 2 is brown. 1.6 (between them) is the body of
    every whoosh: dull, never hissy."""
    n = ns(d)
    X = np.fft.rfft(noise(d, seed))
    fr = np.fft.rfftfreq(n, 1 / SR)
    X[1:] /= (fr[1:] / 100.0) ** (alpha / 2)
    X[0] = 0
    y = filt(np.fft.irfft(X, n), hp(40, 2))
    return y / (np.std(y) + 1e-12)


# ------------------------------------------------------------------------------------------
# oscillators and envelopes
# ------------------------------------------------------------------------------------------
def _f(freq, n):
    return np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=float)[:n]


def _phase(freq, d, phase0):
    n = ns(d)
    f = _f(freq, n)
    return (phase0 + np.cumsum(f) / SR) % 1.0, f / SR


def _blep(ph, dt):
    y = np.zeros_like(ph)
    m1 = ph < dt
    t1 = ph[m1] / dt[m1]
    y[m1] = t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt[m2]
    y[m2] = t2 * t2 + t2 + t2 + 1
    return y


def sine(freq, d, phase0=0.0):
    """Integrated-phase sine; freq may be an array (a glide)."""
    n = ns(d)
    return np.sin(2 * np.pi * (phase0 + np.cumsum(_f(freq, n)) / SR))


def saw(freq, d, phase0=0.0):
    """PolyBLEP band-limited saw."""
    ph, dt = _phase(freq, d, phase0)
    return 2 * ph - 1 - _blep(ph, dt)


def square(freq, d, phase0=0.0, pw=0.5):
    """PolyBLEP pulse built from two saws."""
    ph, dt = _phase(freq, d, phase0)
    ph2 = (ph + pw) % 1.0
    return (2 * ph - 1 - _blep(ph, dt)) - (2 * ph2 - 1 - _blep(ph2, dt))


def adsr(d, a=0.005, dcy=0.1, s=0.7, r=0.2):
    n = ns(d)
    env = np.full(n, float(s))
    na, nd, nr = min(n, max(1, int(a * SR))), int(dcy * SR), int(r * SR)
    env[:na] = np.linspace(0, 1, na)
    if na + nd < n:
        env[na:na + nd] = np.linspace(1, s, nd)
    if 0 < nr < n:
        env[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return env


def expdec(d, tau):
    return np.exp(-tt(d) / tau)


def sat(x, drive=1.5):
    return np.tanh(x * drive) / np.tanh(drive)


# ------------------------------------------------------------------------------------------
# space
# ------------------------------------------------------------------------------------------
def make_ir(rt60=2.4, pre=0.02, lpf=6500, width=1.0, seed=3):
    """Stereo noise-tail impulse response with air absorption. Unit energy."""
    n = ns(rt60 * 1.2)
    t = np.arange(n) / SR
    r = rng(seed)
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)], axis=1) * np.exp(-6.9 * t / rt60)[:, None]
    ir = filt(ir, lp(lpf, 1))
    mid = ir.mean(axis=1, keepdims=True)
    ir = mid + (ir - mid) * width
    ir = np.concatenate([np.zeros((ns(pre), 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2))


_IR = {}


def ir(name='hall'):
    """Cached rooms: 'hall' (2.8 s) for music and big hits, 'room' (0.7 s) for landings and moves,
    'small' (0.3 s, 5 ms predelay, narrow) for keys, ticks and clicks: tiny sounds get a tiny room."""
    if name not in _IR:
        _IR[name] = {'hall': lambda: make_ir(2.8, 0.025, 5500, 1.0, 3),
                     'room': lambda: make_ir(0.7, 0.008, 7000, 0.8, 5),
                     'small': lambda: make_ir(0.3, 0.005, 6000, 0.6, 7)}[name]()
    return _IR[name]


def reverb(x, room='hall'):
    """Convolution reverb, output the same length as x. High-pass the send first (250 Hz)."""
    h = ir(room) if isinstance(room, str) else room
    x = stereo(x)
    return np.stack([signal.fftconvolve(x[:, c], h[:, c])[:len(x)] for c in (0, 1)], axis=1)


def pingpong(x, delay_s, fb=0.35, mix=0.3, lpf=4000, taps=6):
    """Stereo ping-pong delay (the pluck's 3/8-beat echo)."""
    x = stereo(x)
    d = int(delay_s * SR)
    y = np.zeros_like(x)
    tap = x.copy()
    for k in range(1, taps + 1):
        tap = filt(tap, lp(lpf, 1)) * fb
        sh = d * k
        if sh >= len(x):
            break
        side = 0 if k % 2 else 1
        y[sh:, side] += tap[:len(x) - sh, side] + tap[:len(x) - sh, 1 - side] * 0.3
    return x + y * mix / fb


# ------------------------------------------------------------------------------------------
# placement
# ------------------------------------------------------------------------------------------
def pan2(x, pan=0.0):
    """Mono -> stereo with a constant-power pan (-1 left .. +1 right)."""
    a = (float(np.clip(pan, -1, 1)) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def stereo(x):
    return pan2(x, 0.0) if x.ndim == 1 else x


def fade_tail(x, d=0.01):
    """cos^2 fade over the last d seconds (a copy): use before summing a layer into a longer sound."""
    x = x.copy()
    k = min(len(x), ns(d))
    w = np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    x[-k:] *= w[:, None] if x.ndim == 2 else w
    return x


def layer_in(base, x, gain=1.0):
    """Sum x (faded at its end) into the start of base, growing base if x is longer."""
    x = fade_tail(x) * gain
    if x.ndim != base.ndim:
        base, x = stereo(base), stereo(x)
    if len(x) > len(base):
        base = np.concatenate([base, np.zeros((len(x) - len(base),) + base.shape[1:])])
    base = base.copy()
    base[:len(x)] += x
    return base


def place(dst, x, t, gain=1.0, pan=0.0, tail=0.006):
    """Add x into the stereo buffer dst at t seconds. Mono x is panned; every placed sound gets a
    `tail`-second cos^2 fade at its end so nothing clicks where a buffer stops."""
    i = int(round(t * SR))
    n_dst = len(dst)
    if i >= n_dst or len(x) == 0:
        return
    x = pan2(x, pan) if x.ndim == 1 else x.copy()
    nf = min(len(x), int(tail * SR))
    if nf > 1:
        x[-nf:] *= (np.cos(np.linspace(0, np.pi / 2, nf)) ** 2)[:, None]
    if i < 0:
        x = x[-i:]
        i = 0
    n = min(len(x), n_dst - i)
    dst[i:i + n] += x[:n] * gain


def place_at_peak(dst, x, frac, t_peak, gain=1.0, pan=0.0):
    """Place a swell so the point at `frac` of its length lands on t_peak (whoosh apex -> the
    velocity-peak frame)."""
    place(dst, x, t_peak - frac * len(x) / SR, gain, pan)


class Bus:
    """A stereo buffer with place() helpers."""

    def __init__(self, seconds=None, n=None):
        self.x = np.zeros((n if n is not None else ns(seconds), 2))

    def place(self, x, t, gain=1.0, pan=0.0):
        place(self.x, x, t, gain, pan)

    def place_at_peak(self, x, frac, t_peak, gain=1.0, pan=0.0):
        place_at_peak(self.x, x, frac, t_peak, gain, pan)


# ------------------------------------------------------------------------------------------
# drums
# ------------------------------------------------------------------------------------------
def kick(root=51.91, d=0.9, hard=1.0, seed=11):
    """Kick whose pitch settles on `root` Hz: tune it to the tonic so it agrees with every bass."""
    t = tt(d)
    f = root + 110 * np.exp(-t / 0.035) + 40 * np.exp(-t / 0.006)
    body = sine(f, d) * np.exp(-t / (0.26 * hard + 0.05))
    click = filt(noise(d, seed), hp(2500)) * np.exp(-t / 0.0025) * 0.35
    return sat(body * 1.1 + click, 1.8) * 0.9


def sub_boom(f0=104, f1=52, glide=0.12, d=2.5, seed=12, tau=0.9):
    """Sub drop gliding from f0 onto f1 (the chord root), decaying with time constant tau.
    The weight under drops, slams and heavy landings."""
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / glide)
    x = sine(f, d) * np.exp(-t / tau) + sine(f * 2, d) * np.exp(-t / 0.25) * 0.25
    thump = filt(noise(d, seed), lp(180, 2)) * np.exp(-t / 0.05) * 0.6
    y = sat(x, 1.4) * 0.9 + thump
    a = min(len(y), max(1, int(0.003 * SR)))  # a 3 ms raised-cosine attack: a drop onto true silence lands without a click
    y[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    return y


def clap(d=0.45, seed=13):
    """Four noise bursts 9-10 ms apart, the last one with a short tail."""
    t = tt(d)
    n = filt(noise(d, seed), bp(900, 5200, 2))
    env = np.zeros_like(t)
    for k, off in enumerate((0, 0.009, 0.019, 0.028)):
        env += (t >= off) * np.exp(-np.maximum(t - off, 0) / (0.006 if k < 3 else 0.11))
    return n * env * 0.8


def hat(d=0.12, tau=0.018, bright=7500, seed=14):
    """Closed (tau ~0.01) or open (tau ~0.07) hat: high-passed noise plus metallic partials."""
    t = tt(d)
    x = filt(noise(d, seed), hp(bright, 2))
    ring = sum(np.sin(2 * np.pi * f * t) for f in (8100, 10900, 13300)) * 0.08
    return (x + ring) * np.exp(-t / tau) * 0.5


# ------------------------------------------------------------------------------------------
# clock, UI and foley-like voices
# ------------------------------------------------------------------------------------------
def modal(t, modes, pitch=1.0):
    """Sum of damped sines [(f Hz, tau s, gain), ...] over the time axis t, each from phase 0 so the
    onset is continuous; modes above 0.45*SR are skipped. The body of every key, tick and click."""
    x = np.zeros_like(t)
    for f, tau, g in modes:
        f = f * pitch
        if g and f < SR * 0.45:
            x += g * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    return x


def soft_onset(t, a=0.0004):
    """1 - exp(-t/a): a soft attack of time constant a that starts from exact zero (no step)."""
    return 1 - np.exp(-t / a)


def tick(freq=1567.98, d=0.07, tau=0.010, body=0.8, seed=21, dark=False):
    """Clock tick, a small wooden mallet rather than a beep: the tuned fundamental (decay tau, 8-12 ms),
    free-bar partials at 2.76x and 5.4x dying 2.5-7x faster, and a 0.5 ms low-passed felt transient.
    Tune freq into the key in octave 5-6 (520-1600 Hz): a pure tone in octave 7 sits on the ear's
    3-4 kHz resonance and reads as a harsh ping. dark=True is the tock: a quieter 2.76x partial and a
    duller transient (use it a fifth below the tick)."""
    t = tt(d)
    x = modal(t, [(freq, tau, 1.0), (freq * 2.76, min(0.004, tau * 0.4), 0.12 if dark else 0.22),
                  (freq * 5.4, 0.0015, 0.03 if dark else 0.06)]) * body
    x += filt(noise(d, seed), lp(2500 if dark else 4000, 2)) * np.exp(-t / 0.0005) * 0.3
    return filt(x * soft_onset(t, 0.0003), hp(150, 2))


def tock(freq=1100, d=0.12, tau=0.03, low=0.4, seed=22):
    """Wooden knock: noise ringing a resonant band at freq, plus a small 140 Hz thump."""
    t = tt(d)
    exc = noise(d, seed) * np.exp(-t / 0.004)
    res = filt(exc, bp(freq * 0.85, freq * 1.18, 2)) * 6 * np.exp(-t / tau)
    return res + np.sin(2 * np.pi * 140 * t) * np.exp(-t / 0.025) * low


# Modal keys, calibrated to measured norms of top-tier launch films: a dark "tock" (spectral peak
# 0.7-1.0 kHz, centroid about 1.0-1.8 kHz, 2-5 kHz share about 0.1-0.15), attack 1-4 ms, -20 dB within
# about 6 ms, gone in about 12 ms. Per kind: body f1 range (Hz) and decay, plate ratio to f1 and decay,
# case thud (Hz, decay, gain), definition tick (ratio to f1, decay, gain), excitation low-pass, length (s).
# Space and return are lower (centroid ~700 Hz), a little longer, and always bottom out (`second`).
_KEY = {
    'letter': dict(f1=(760, 940), tau1=(0.0024, 0.0030), r2=(1.9, 2.15), tau2=(0.0014, 0.0018), g2=1.0, thud=(240, 300),
                   tau3=0.0030, g3=0.35, r4=(3.3, 3.8), tau4=0.0011, g4=1.0, exc=6000, d=0.03),
    'space': dict(f1=(370, 410), tau1=(0.0048, 0.0054), r2=(2.6, 2.8), tau2=(0.0028, 0.0032), g2=1.3, thud=(140, 160),
                  tau3=0.0055, g3=0.40, r4=(6.2, 6.8), tau4=0.0009, g4=0.8, exc=4000, d=0.05),
    'return': dict(f1=(400, 440), tau1=(0.0042, 0.0048), r2=(2.5, 2.7), tau2=(0.0025, 0.0029), g2=1.3, thud=(150, 170),
                   tau3=0.0060, g3=0.40, r4=(5.8, 6.4), tau4=0.0009, g4=0.8, exc=4000, d=0.06),
}
KEY_STYLES = ('soft', 'mechanical', 'pitched', 'muted')
_PENTA_C = (67, 69, 72, 74, 76)  # G4 A4 C5 D5 E5: the pitched keys' default tones (400-700 Hz)


def key_click(seed=0, pitch=1.0, d=None, style='soft', kind='letter', strike=None, level=1.0, keyup=None,
              note=None, tau=1.0, second=None, second_db=None):
    """One keystroke, modelled as a small damped object rather than a noise burst: a dark "tock" with a
    body mode at 760-940 Hz (the spectral peak), a plate mode at ~2.0x, a case thud near 270 Hz and a
    1 ms definition tick at ~3.5x, excited by a 0.4 ms low-passed noise transient under a 0.7 ms soft
    onset, low-passed at 6 kHz and high-passed at 150 Hz. Attack about 1.5 ms, -20 dB about 6 ms after
    the peak, under 12 ms in all; centroid about 1.2 kHz with about 11% of its energy in 2-5 kHz.

    seed    the key's identity: the same seed is the same key (body pitch, mode ratios, decays drawn
            once), as on a real keyboard; a run of seeds sounds like one keyboard, not a marimba
    pitch   multiplies every mode; keep the per-press drift within +-1.5%
    d       length in seconds (default per kind: letter 0.03, space 0.05, return 0.06, plus the
            secondary transient or keyup)
    style   'soft' (default), 'mechanical' (stiffer and crisper, a bottom-out tick 4-5 ms later),
            'pitched' (a felt mallet tuned to `note`) or 'muted' (dull, short)
    kind    'letter', 'space', 'return' or 'back' (backspace: a letter 5% higher, 15% shorter)
    strike  this press: a new noise waveform and +-1% mode detune every strike (default: seed)
    level   press strength (1 = normal); the output peaks at `level`, and a harder press is
            brighter (+25% cutoff per +6 dB)
    keyup   seconds after the press for a separate release click (70-120 ms), 10 dB down and 18%
            higher; None (the default) for none. Measured typing has no key-up sound: off by default.
    note    Hz for style 'pitched' (default: a C major pentatonic tone in 400-700 Hz from seed)
    tau     multiplies every decay (score.py shortens them when keys come fast)
    second  seconds after the press for the secondary transient (the key bottoming out and the cap
            rattling, 25-35 ms later on about half the letters in measured typing); None = the kind's
            default (none on letters; always, 32 ms, on space and return), 0 = none
    second_db  its level re the press (default -13.5 dB on letters, -10 dB on space and return)"""
    if style not in KEY_STYLES or kind not in ('letter', 'space', 'return', 'back'):
        raise ValueError(f'key style {style!r} / kind {kind!r}: styles {", ".join(KEY_STYLES)}; '
                         'kinds letter, space, return, back')
    back = kind == 'back'
    wide = kind in ('space', 'return')
    P = _KEY['letter' if back else kind]
    k = rng(1000 + int(seed) + {'letter': 0, 'back': 0, 'space': 500, 'return': 600}[kind])
    s = rng(50000 + 7919 * int(seed if strike is None else strike))
    u = [k.random() for _ in range(6)]
    pick = lambda rg, x: rg[0] + (rg[1] - rg[0]) * x
    f1 = pick(P['f1'], u[0]) * (1.05 if back else 1.0)
    tau1, tau2 = pick(P['tau1'], u[1]), pick(P['tau2'], u[3])
    modes = [[f1, tau1, 1.0], [f1 * pick(P['r2'], u[2]), tau2, P['g2']],
             [pick(P['thud'], u[4]), P['tau3'], P['g3']], [f1 * pick(P['r4'], u[5]), P['tau4'], P['g4']]]
    exc_lp, exc_g, onset, out_lp, length = P['exc'], 0.5, 0.0007, 6000.0, P['d']
    if style == 'mechanical':  # stiffer, a little higher and drier; a crisper onset and a bottom-out
        modes[0][0] *= 1.12
        modes[0][1] *= 0.85
        modes[3][2] *= 0.6
        exc_lp, exc_g, onset, out_lp = exc_lp * 1.1, 0.6, 0.0003, 7000.0
    elif style == 'muted':  # a fingertip on a laptop: no tick, a dull short body
        modes[0][1] *= 0.8
        modes[1][2], modes[2][2], modes[3][2] = 0.2, P['g3'] * 1.3, 0.0
        exc_lp, exc_g, onset, out_lp, length = 2200.0, 0.3, 0.0012, 2500.0, length * 0.85
    elif style == 'pitched':  # a felt mallet on a small bar: tuned body, a quiet 3.93x overtone, no tick
        f1 = note if note else mtof(_PENTA_C[int(seed) % len(_PENTA_C)] - (12 if wide else 0))
        long_ = 0.035 if not wide else 0.06
        modes = [[f1, long_, 1.0], [f1 * 3.93, 0.008, 0.2], [pick(P['thud'], u[4]), 0.012, 0.12]]
        exc_lp, exc_g, onset, out_lp, length = 3000.0, 0.45, 0.0008, 5000.0, long_ * 4
    if back:
        for m in modes:
            m[1] *= 0.85
        modes[-1][2] *= 0.85
    if second is None:
        second = 0.032 if wide and style != 'pitched' else 0.0
    if second_db is None:
        second_db = -10.0 if wide else -13.5
    if d is None:
        d = length + max(keyup or 0.0, (second + 0.025) if second else 0.0)
    bright = float(np.clip(1 + 0.25 * (level - 1) + 0.08 * s.standard_normal(), 0.6, 1.6))
    t = tt(d)
    detune = [1 + (0.0 if style == 'pitched' else 0.01) * s.standard_normal() for _ in modes]
    x = modal(t, [(f * dt, tau_ * tau, g) for (f, tau_, g), dt in zip(modes, detune)], pitch)
    nz = noise(d, 777 + int(seed if strike is None else strike) % 100000)
    exc = filt(filt(nz, lp(exc_lp * bright, 2)), hp(300, 2)) * np.exp(-t / 0.0004) * exc_g
    y = (x + exc) * soft_onset(t, onset)
    peak0 = np.max(np.abs(y)) + 1e-12
    if style == 'mechanical':  # the bottom-out: the plate and a short transient again, 9 dB down
        i = ns(0.004 + 0.001 * s.random())
        if i < len(t):
            tb = t[:len(t) - i]
            bo = modal(tb, [(modes[1][0] * 1.03, 0.0015, 0.6), (modes[0][0] * 1.4, 0.0012, 0.4)], pitch)
            bo += filt(nz[i:], lp(exc_lp * bright, 2)) * np.exp(-tb / 0.0003) * 0.3
            y[i:] += bo * soft_onset(tb, 0.0002) * 0.35
    if second and second < d - 0.005:  # the cap bottoms out and rattles: the same key, smaller and higher
        i = ns(second)
        tb = t[:len(t) - i]
        sec = modal(tb, [(f * 1.08, tau_ * 0.7, g) for f, tau_, g in modes[:3]], pitch)
        sec += filt(filt(noise(len(tb) / SR, 131 + int(seed if strike is None else strike) % 100000),
                         lp(exc_lp, 2)), hp(300, 2)) * np.exp(-tb / 0.0003) * exc_g
        sec *= soft_onset(tb, onset)
        y[i:] += sec * (peak0 * 10 ** (second_db / 20) / (np.max(np.abs(sec)) + 1e-12))
    if keyup and keyup < d - 0.01:
        i = ns(keyup)
        tu = t[:len(t) - i]
        if style == 'pitched':  # the felt lifts: no tone, just a little air and the thud
            up = modal(tu, [(modes[2][0] * 1.18, 0.008, 0.5)], pitch)
        else:
            up = modal(tu, [(f * 1.18, tau_ * 0.7, g) for f, tau_, g in modes[:2]] + [(modes[0][0] * 1.18 * 4.3, 0.0005, 0.15)], pitch)
        up += filt(noise(len(tu) / SR, 99 + int(seed if strike is None else strike) % 100000), lp(6000, 2)) * np.exp(-tu / 0.0004) * 0.3
        up *= soft_onset(tu, 0.0004)
        y[i:] += up * (peak0 * (0.1 if style == 'muted' else 0.32) / (np.max(np.abs(up)) + 1e-12))
    y = filt(filt(y, lp(out_lp * bright, 1)), hp(150 if not wide else 90, 2))
    return y * (level / (np.max(np.abs(y)) + 1e-12))


def thock(freq=950, seed=0, style='soft', kind='space', strike=None, level=1.0, keyup=None, d=None, note=None, tau=1.0,
          second=None, second_db=None):
    """Space bar (kind='space') or return (kind='return'): the same modal key family, lower (centroid
    about 700 Hz) and a little longer, always bottoming out about 32 ms after the press. freq is the
    plate's knock (~950 Hz) and scales the whole key (body ~freq/2.45); the other arguments are
    key_click's."""
    return key_click(seed, freq / 950.0, d, style, kind, strike, level, keyup, note, tau, second, second_db)


def ui_click(ping=1975.53, d=0.14, seed=23, release=0.085, tone=None, strike=None, release_db=-1.5):
    """Cursor press and release: one bright, very short voice per film. A tuned mode at `ping` (tau
    3 ms; a pentatonic tone near 2 kHz), partials at ~1.5x and ~2.2x dying faster, and a 0.4 ms
    band-passed transient under a 0.6 ms soft onset, high-passed at 600 Hz (4th order): centroid about
    2.5 kHz with almost nothing below 500 Hz, attack about 1.5 ms, -20 dB about 6.5 ms after the peak.
    It reads in the 2-5 kHz band the music leaves empty, so it can sit near -3 dB against the music.

    seed       the voice: keep ONE seed (and ping) for every click of a film; the partial ratios are
               drawn from it once
    strike     this press (default: seed): a tiny timbre jitter, +-0.15% pitch and a new transient
    release    seconds after the press for the release (measured 38-112 ms, about 85), the same voice
               6% higher; None for none
    release_db the release's level re the press (0 to -3 dB; default -1.5)
    tone       Hz: a confirm tone 12 dB under the press, for meaningful actions only
    The press peaks at 1."""
    if release and release > d - 0.03:
        d = release + 0.04
    v = rng(9000 + int(seed))
    r2, r3 = 1.42 + 0.1 * v.random(), 2.1 + 0.2 * v.random()
    s = rng(9100 + int(seed if strike is None else strike))
    f = ping * (1 + 0.0015 * s.standard_normal())
    t = tt(d)
    exc_seed = 23 + int(seed if strike is None else strike) % 100000

    def press(tt_, f_, k, seed_):
        x = modal(tt_, [(f_, 0.0030 * k, 1.0), (f_ * r2, 0.0022 * k, 1.0), (f_ * r3, 0.0014 * k, 0.8)])
        x += filt(noise(len(tt_) / SR, seed_), bp(1500, 9000, 2)) * np.exp(-tt_ / 0.0004) * 0.5
        return x * soft_onset(tt_, 0.0006)

    y = press(t, f, 1.0, exc_seed)
    peak0 = np.max(np.abs(y)) + 1e-12
    if release:
        i = ns(release)
        tu = t[:len(t) - i]
        rel = press(tu, f * 1.06, 0.85, exc_seed + 1)
        y[i:] += rel * (peak0 * 10 ** (release_db / 20) / (np.max(np.abs(rel)) + 1e-12))
    y = filt(y, hp(600, 4))
    y /= np.max(np.abs(y[:ns(min(d, (release or d)))])) + 1e-12
    if tone:
        y += sine(tone, d) * soft_onset(t, 0.001) * np.exp(-t / 0.06) * 0.25
    return y


def crisp_tick(seed=0, d=0.05, freq=None):
    """A crisp tick for counters locking, list rows and build ticks (the clock keeps the tuned
    wooden tick()): three inharmonic modes near 3.1, 4.4 and 6.2 kHz, drawn from `seed` (give every
    hit a new seed: a cluster of ticks may change pitch and timbre), and a 0.5 ms band-passed
    transient, high-passed at 1.5 kHz. Centroid about 3.5-4 kHz, attack about 1.5 ms, -20 dB 10-20 ms
    after the peak. Untuned by default; freq (Hz) loosely tunes the lowest mode. Peaks at 1."""
    r = rng(7000 + int(seed))
    f0 = float(freq) * (1 + 0.01 * r.standard_normal()) if freq else 2800 + 600 * r.random()
    t = tt(d)
    x = modal(t, [(f0, 0.0050, 1.0), (f0 * (1.38 + 0.1 * r.random()), 0.0035, 0.8),
                  (f0 * (1.95 + 0.15 * r.random()), 0.0020, 0.5)])
    x += filt(noise(d, 7100 + int(seed)), bp(2000, 9000, 2)) * np.exp(-t / 0.0005) * 0.6
    y = filt(x * soft_onset(t, 0.0007), hp(1500, 2))
    return y / (np.max(np.abs(y)) + 1e-12)


def snap(root=51.91, d=0.6, weight=1.0, seed=24):
    """Lock-in snap: click + body at 4x root + a low tail on the root. Tune root to the chord."""
    t = tt(d)
    c = filt(noise(d, seed), bp(1800, 9000, 2)) * np.exp(-t / 0.003) * 1.2
    body = sine(4 * root * (1 + 0.8 * np.exp(-t / 0.008)), d) * np.exp(-t / 0.045) * 0.7
    low = sine(root * (1 + 0.5 * np.exp(-t / 0.02)), d) * np.exp(-t / 0.16) * weight
    return sat(c + body + low, 1.3)


def blip(freq=880, up=True, d=0.12):
    """Word / pop blip, mallet-like rather than a cartoon bloop: a sine that slides 2 semitones into
    freq (up from below, or down from above) over ~20 ms, a 2.5 ms attack, and a 2.76x partial 15 dB
    down that dies in 3 ms. No echo: the effects room gives it space. It rings on freq: tune it."""
    t = tt(d)
    f = freq * 2 ** ((-2 if up else 2) / 12 * np.exp(-t / 0.007))
    x = sine(f, d) * np.exp(-t / 0.02) + sine(2.76 * f, d) * np.exp(-t / 0.003) * 0.18
    return x * np.minimum(1, t / 0.0025)


def word_blip(freq=660.0, d=0.048, glide=2.5, seed=0):
    """One blip per typed word (typing style "word"): a pitched sine 36-60 ms long that glides
    `glide` semitones up into freq over its first ~15 ms, a 4 ms raised-cosine attack, a decay of
    tau 12 ms, a 2nd harmonic 18 dB down for definition, and a 6 ms fade to zero at its end. Keep
    freq in 330-1400 Hz on a chord tone (score.py steps it through the chord, word by word). Dry and
    mono. Peaks at 1. seed is unused (the blip is pure tone) and kept for a uniform signature."""
    d = float(np.clip(d, 0.036, 0.06))
    t = tt(d)
    f = freq * 2 ** (-glide / 12 * np.exp(-t / 0.006))
    x = sine(f, d) + 0.125 * sine(2 * f, d)
    a = np.minimum(1, t / 0.004)
    env = (0.5 - 0.5 * np.cos(np.pi * a)) * np.exp(-np.maximum(t - 0.004, 0) / 0.012)
    y = x * env
    k = min(len(y), ns(0.006))
    y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return y / (np.max(np.abs(y)) + 1e-12)


def fm_bell(freq, d=3.0, index=2.2, ratio=3.5, tau=1.2):
    """FM bell (ratio 3.5, index ~2, modulator decaying in 0.35 s). Logo moments and motifs."""
    d = max(d, 5 * tau)
    t = tt(d)
    mod = np.sin(2 * np.pi * freq * ratio * t) * index * np.exp(-t / 0.35)
    x = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / tau)
    x += np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t / (tau * 0.35)) * 0.15
    return x * np.minimum(1, t / 0.003)


def marker(d=0.25, seed=25):
    """Felt marker across paper: a noise band that brightens as the stroke speeds up. Stereo."""
    t = tt(d)
    u = t / d
    x = np.stack([noise(d, seed), noise(d, seed + 1)], axis=1)
    y = sweep(x, 1800 * (5200 / 1800) ** np.sqrt(u), 'band') * 2.4
    env = np.minimum(1, t / 0.008) * (1 - u) ** 1.5 * (0.6 + 0.4 * np.sin(np.pi * np.minimum(1, u * 1.4)))
    return y * env[:, None]


# ------------------------------------------------------------------------------------------
# moves: whoosh, riser, suck, swell (all stereo)
# ------------------------------------------------------------------------------------------
def whoosh(d=0.8, f0=120, f1=750, f2=220, apex=0.5, travel=0.0, air=0.025, seed=31):
    """Move whoosh. A wide band of 1/f^1.6 noise sweeps f0 -> f1 at the apex -> f2; the envelope
    rises as (u/apex)^2 and decays after. The defaults keep it dull (centroid ~550 Hz): a whoosh
    should be felt, not heard as hiss. Put the apex on the velocity-peak frame with
    place_at_peak(x, apex, t). travel pans it from -0.6*travel to +0.6*travel, so the sound
    moves the way the picture does."""
    n = ns(d)
    u = np.arange(n) / n
    cut = np.where(u < apex, f0 * (f1 / f0) ** (u / apex), f1 * (f2 / f1) ** ((u - apex) / (1 - apex)))
    x = np.stack([colored(d, seed), colored(d, seed + 1)], axis=1)
    y = sweep(x, cut, 'band', q=1.8) * 1.6
    y += filt(np.stack([noise(d, seed + 2), noise(d, seed + 3)], axis=1), bp(3000, 9000, 2)) * air
    env = np.where(u < apex, (u / apex) ** 2, np.exp(-(u - apex) * d / 0.18))
    y *= env[:, None]
    ang = (np.linspace(-0.6, 0.6, n) * travel + 1) * np.pi / 4
    y[:, 0] *= np.cos(ang) * 1.4
    y[:, 1] *= np.sin(ang) * 1.4
    return y


def riser(d=2.0, f0=250, f1=7000, target=None, seed=32):
    """Noise band sweeping up plus (if target Hz is given) two saws gliding an octave up and
    landing exactly on target: end it on the next chord's tone, never a random pitch."""
    n = ns(d)
    u = np.arange(n) / n
    cut = f0 * (f1 / f0) ** (u ** 1.3)
    x = np.stack([noise(d, seed), noise(d, seed + 1)], axis=1)
    y = sweep(x, cut, 'band') * (u ** 2.2)[:, None] * 0.9
    if target:
        f = target * 2 ** (u ** 2 - 1.0)
        s = saw(f, d) * 0.5 + saw(f * 1.005, d, 0.37) * 0.5
        s = sweep(s, 400 + 5000 * u ** 2, 'low') * u ** 2.5 * 0.35
        y += stereo(s) * np.sqrt(2)
    return y


def suck(d=0.35, seed=33):
    """Reverse suck into an implosion or a silence: bright to dark, apex at 85% of its length. It
    starts at 2.5 kHz with little air, so it reads as a breath in, not hiss."""
    return whoosh(d, 2500, 900, 200, apex=0.85, air=0.04, seed=seed)


def swell(freqs, d=1.0, seed=34):
    """Reverse swell whose loudest point is its last sample: chord tones plus an airy band,
    rising as u^3. Place it so its end lands on the hit: place(dst, x, t_hit - d)."""
    n = ns(d)
    t = np.arange(n) / SR
    u = t / d
    tone = np.zeros(n)
    for k, f in enumerate(freqs):
        tone += (sine(f, d, 0.13 * k) + 0.18 * sine(2 * f, d) + 0.06 * saw(f, d, 0.29 * k)) / len(freqs)
    tone = filt(tone, lp(2500, 1))
    air_ = sweep(noise(d, seed), 600 * (6000 / 600) ** u, 'band') * 0.35
    y = (tone + air_) * u ** 3
    y[-ns(0.012):] *= np.linspace(1, 0, ns(0.012))
    return stereo(y)


# ------------------------------------------------------------------------------------------
# tonal instruments
# ------------------------------------------------------------------------------------------
def supersaw(freq, d, voices=5, detune=0.11, cutoff=1800, a=0.25, r=0.8, seed=41):
    """Supersaw pad note (stereo): `voices` saws spread over +-detune semitones and across the
    field. High-pass the pad bus at ~170 Hz so pads never fight the bass."""
    r_ = rng(seed)
    out = np.zeros((ns(d), 2))
    for v in range(voices):
        off = (v - (voices - 1) / 2) / ((voices - 1) / 2 + 1e-9) * detune
        s = saw(freq * 2 ** (off / 12), d, r_.random())
        ang = ((v / max(1, voices - 1) - 0.5) * 1.4 + 1) * np.pi / 4
        out[:, 0] += s * np.cos(ang)
        out[:, 1] += s * np.sin(ang)
    out = filt(out / voices, lp(cutoff, 2))
    return out * adsr(d, a, 0.3, 0.85, r)[:, None]


def pluck(freq, d=0.5, bright=4200, dark=500, tau_f=0.09, tau_a=0.22):
    """Arp pluck: saw + pulse through a closing low-pass. Pair with pingpong(3/8 beat)."""
    t = tt(d)
    s = saw(freq, d) * 0.6 + square(freq, d, 0.3) * 0.09 + sine(freq * 2, d) * 0.1
    y = sweep(s, dark + (bright - dark) * np.exp(-t / tau_f), 'low', 2, 128)
    return y * np.exp(-t / tau_a) * np.minimum(1, t / 0.002)


def bass(freq, d, drive=1.3, h2=0.22):
    """Sine bass + 2nd harmonic + a little saw, low-passed at 900 Hz and saturated."""
    x = sine(freq, d) + sine(freq * 2, d) * h2 + saw(freq, d) * 0.06
    return sat(filt(x, lp(900, 2)), drive) * adsr(d, 0.006, 0.12, 0.8, 0.08)


def drone(freqs, d, lpf=500, rise=1.6):
    """Low sine drone on the given Hz (tonic + fifth) that swells in over `rise` seconds and
    keeps growing toward its end, where it should stop dead on the first hit."""
    t = tt(d)
    x = sum(sine(f, d) * (0.5 if k == 0 else 0.3) for k, f in enumerate(freqs))
    x = x + saw(freqs[0] * 4, d) * 0.03
    x = filt(x, lp(lpf, 2)) * np.minimum(1, t / rise) * (0.5 + 0.5 * (t / d) ** 2)
    k = min(len(x), ns(0.06))
    x[-k:] *= np.linspace(1, 0, k)
    return x


def keys(freq, d=1.5, index=1.4, tau=0.9):
    """Soft FM electric-piano note: warm chord stabs for calm sections."""
    d = max(d, 4 * tau)
    t = tt(d)
    mod = np.sin(2 * np.pi * freq * t) * index * np.exp(-t / 0.25)
    x = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t / tau)
    x += np.sin(2 * np.pi * freq * 14.0 * t) * np.exp(-t / 0.012) * 0.05
    return x * np.minimum(1, t / 0.002)


# ------------------------------------------------------------------------------------------
# demo
# ------------------------------------------------------------------------------------------
def _typed(style, tones=None):
    """A short typed phrase ('type it'+return) in one key style, humanized the way score.py does it:
    fixed key per letter, +-1.2% pitch and sigma 2 dB per press (no jump over 6 dB), word-start
    accent, a bottom-out 25-35 ms later on about half the letters. style 'word' plays one blip per
    word on the given tones instead."""
    text, gaps = 'type it\n', [0.11, 0.09, 0.13, 0.07, 0.12, 0.10, 0.24, 0.0]
    r = rng(5)
    out = np.zeros(ns(sum(gaps) + 0.4))
    t, walk, prev = 0.0, 2, 0.0
    for k, (ch, gap) in enumerate(zip(text, gaps)):
        kind = 'space' if ch == ' ' else 'return' if ch == '\n' else 'letter'
        start = k == 0 or text[k - 1] == ' '
        db = float(np.clip(r.normal(0, 2.0) + (2.5 if start else 0.0) * (kind == 'letter'), prev - 6, prev + 6))
        prev = db
        if style == 'word':
            x = word_blip(tones[min(len(tones) - 1, 1 + k // 3)], 0.048) * 10 ** (db / 20) if start and kind == 'letter' else None
        else:
            note = None
            if tones:
                walk = int(np.clip(walk + r.integers(-1, 2), 0, len(tones) - 1))
                note = tones[walk] / (2 if kind != 'letter' else 1)
            second = None if kind != 'letter' else (0.025 + 0.01 * r.random() if r.random() < 0.5 else 0.0)
            x = key_click(ord(ch) % 26, 1 + 0.012 * r.standard_normal(), None, style, kind, k, 10 ** (db / 20), None, note,
                          second=second)
            x *= {'space': 0.85, 'return': 0.95}.get(kind, 1.0) * {'pitched': 0.5, 'muted': 0.5}.get(style, 1.0)
        if x is not None:
            i = ns(t)
            out[i:i + len(x)] += x[:len(out) - i]
        t += gap
    return out


def _demo(path, key='Eb'):
    import os
    import soundfile as sf
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tonic = pitch_class(key)
    root1 = mtof(nearest([tonic], 31))
    fifth = (tonic + 7) % 12
    penta = [(tonic + i) % 12 for i in (0, 2, 4, 7, 9)]
    tones = [mtof(m) for m in range(67, 78) if m % 12 in penta]
    voices = [
        ('kick', kick(root1)), ('sub_boom', sub_boom(root1 * 2, root1)), ('clap', clap()),
        ('hat closed', hat(0.08, 0.012)), ('hat open', hat(0.25, 0.07, 6500)),
        ('tick', tick(mtof(nearest([tonic], 86)))), ('tock', tick(mtof(nearest([fifth], 81)), dark=True)),
        ('tock (wood)', tock(mtof(nearest([fifth], 84)))),
        ('typing soft', _typed('soft')), ('typing mechanical', _typed('mechanical')),
        ('typing pitched', _typed('pitched', tones)), ('typing muted', _typed('muted')),
        ('typing word', _typed('word', [mtof(m) for m in range(64, 90) if m % 12 in (tonic, (tonic + 4) % 12, fifth)])),
        ('key_click', key_click(3, second=0.03)), ('thock (space)', thock()), ('thock (return)', thock(kind='return')),
        ('ui_click', ui_click(mtof(nearest(penta, 95)))),
        ('ui_click + confirm', ui_click(mtof(nearest(penta, 95)), tone=mtof(nearest(penta, 81)))),
        ('crisp_tick x3', np.concatenate([np.pad(crisp_tick(k), (0, ns(0.11) - ns(0.05))) for k in range(3)])),
        ('snap', snap(root1)),
        ('blip', blip(mtof(nearest([fifth], 79)))), ('word_blip', word_blip(mtof(nearest([tonic], 72)))),
        ('fm_bell', fm_bell(mtof(nearest([tonic], 80)), 2.0)),
        ('whoosh', whoosh(0.8, travel=0.8)), ('riser', riser(1.5, target=mtof(nearest([tonic], 60)))),
        ('suck', suck()), ('swell', swell([mtof(nearest([p], 70)) for p in (tonic, (tonic + 4) % 12, fifth)])),
        ('supersaw', supersaw(mtof(nearest([tonic], 60)), 1.5)),
        ('pluck', pluck(mtof(nearest([fifth], 72)))), ('bass', bass(mtof(nearest([tonic], 38)), 1.0)),
        ('keys', keys(mtof(nearest([tonic], 64)))), ('marker', marker()),
    ]
    soft_peak = np.max(np.abs(dict(voices)['typing soft']))
    total = sum(len(v) / SR + 0.35 for _, v in voices)
    bus = Bus(total + 1)
    t = 0.2
    for name, v in voices:
        print(f'{t:6.2f}s  {name}')
        level = 0.5 if not name.startswith('typing') else 0.5 * np.max(np.abs(v)) / soft_peak  # styles keep their levels
        bus.place(v * (level / (np.max(np.abs(v)) + 1e-9)), t)
        t += len(v) / SR + 0.35
    sf.write(path, bus.x.astype(np.float32), SR, subtype='PCM_24')
    print('wrote', path)


def main(argv=None):
    ap = argparse.ArgumentParser(description='cinetic synth library; --demo renders every voice.')
    ap.add_argument('--demo', metavar='WAV', help='render an audition of every voice to WAV')
    ap.add_argument('--key', default='Eb', help='tonic for the tuned voices in the demo (default Eb)')
    a = ap.parse_args(argv)
    if not a.demo:
        ap.print_help()
        return 0
    try:
        _demo(a.demo, a.key)
    except Exception as e:  # noqa: BLE001
        print('error:', e, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
