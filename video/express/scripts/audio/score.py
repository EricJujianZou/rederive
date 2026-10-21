#!/usr/bin/env python3
"""
score.py: renders a film's soundtrack. The music comes from audio/score.json (key, tempo, one
chord per bar, sections, drops, silences, signature motif); the sound effects come from the
events in out/cues.json (exported from the picture code by scripts/export-cues.ts). The mix is
sidechained, bussed and mastered by master.py to the film's target, master.lufs in score.json
(default -14 LUFS; -16 for a calm brand or a sting of 8 s or less; --lufs overrides it), with a
true-peak ceiling and a 3 ms fade-in at sample 0.

Usage (from the project root):
  python3 scripts/audio/score.py --cues out/cues.json --score audio/score.json \
      --out public/audio/soundtrack.wav [--stems out/stems] [--json out/qa/score.json]
      [--lufs -14] [--ceiling 0.77] [--quiet]

Writes a 48 kHz 24-bit stereo WAV exactly TOTAL/FPS seconds long, optional stems that sum to
the pre-master mix (drums, bass, pad, arp, bells, reverb, sfx, and bed when used) and a JSON
report: loudness, true peak, LRA (warns under 5 LU on films of 20 s or more), the loudest moment
against the payoff and the payoff's lift over the median momentary loudness (warns under 2 LU), limiter hot spots,
masked effects (under +6 dB in their own band), every tuned sound with its note, skipped events
and warnings. The end fade (master.fade) applies to the music and the effects alike, so the WAV
reaches digital silence; an effect that starts inside the fade is reported. The hook check warns
when the first 0.5 s sits more than 12 dB under the median momentary loudness (a soft hook).
A "progress" block re-pitches matching events into a climbing scale that resolves on the tonic.
The arc check warns when the loudest moment falls in the last 20% of a film over 8 s: the drop on
the hero reveal should peak, and the lockup resolve.

Typing ("typing" in score.json, one per film): "auto" (default) sounds each run per key ("soft")
up to 25 chars/s and once per word ("word") above, as measured top-tier launch films do. "soft" is
a dark modal tock (spectral peak 0.75-0.95 kHz, centroid ~1.2 kHz, ~11% in 2-5 kHz, -20 dB about
6 ms after its peak); "mechanical" is stiffer with a bottom-out tick; "pitched" plays felt mallets
on chord/pentatonic tones in G4-F5; "muted" is dull and 10 dB further under the music; "word" is one
pitched blip per word (36-60 ms, 330-1400 Hz) stepping through the chord's tones; "off" skips key
events. Per key: never two keys within 60 ms, runs over 12 keys/s thinned to about 12/s (word
starts, spaces and returns kept); level follows the word (+2.5 dB on word starts, a slight
decrescendo inside it, -1 dB before a space, sigma 2.5 dB at random, -3 dB once a run passes 1.5 s),
no jump over 6 dB between neighbours; about half the letters bottom out 25-35 ms after the press;
no key-up click unless "keyup": true. Keys, clicks and crisp ticks are dry and every effect but a
whoosh, riser, swell or suck sits within +-0.15 of the centre.
Under every run sounded per key the music bus ducks mix.typing_duck_db (default 10 dB; 0 disables),
30 ms down and 250 ms back, and bars with 4+ sounded keys mute the hats and dip the arp. Levels
against the music, as measured (6 ms effect RMS vs the music's 250 ms RMS): each typing run about
-4 dB under the ducked music (word blips +6, muted -14), and one level per film for the UI click
(-3 dB) and the crisp tick (-8 dB), each within +-12 dB of its static level. The report's "typing"
block measures each run against the music (A-weighted, short-window, 2-5 / 5-10 kHz) and
"sfx_levels" the clicks and crisp ticks.
Schema and recipes: references/sound.md.

Exit codes: 0 rendered and the gate passed (LUFS within +-0.5 of target, true peak <= -1.5
dBTP, last 480 samples zero); 1 on invalid input or a failed gate.
"""
import argparse
import json
import math
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import master as M  # noqa: E402
import synth as S  # noqa: E402

SR = S.SR

MODES = {
    'major': [0, 2, 4, 5, 7, 9, 11], 'ionian': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10],
    'aeolian': [0, 2, 3, 5, 7, 8, 10], 'dorian': [0, 2, 3, 5, 7, 9, 10], 'mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'lydian': [0, 2, 4, 6, 7, 9, 11], 'phrygian': [0, 1, 3, 5, 7, 8, 10],
}
QUALITIES = {
    '': [0, 4, 7], 'maj': [0, 4, 7], 'M': [0, 4, 7], 'm': [0, 3, 7], 'min': [0, 3, 7], '-': [0, 3, 7],
    '5': [0, 7], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '69': [0, 4, 7, 9, 14], '6add9': [0, 4, 7, 9, 14],
    '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'M7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'mmaj7': [0, 3, 7, 11],
    '9': [0, 4, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'M9': [0, 4, 7, 11, 14], 'm9': [0, 3, 7, 10, 14],
    'm11': [0, 3, 7, 10, 14, 17], 'maj7#11': [0, 4, 7, 11, 18], 'add9': [0, 4, 7, 14], 'add2': [0, 2, 4, 7],
    'madd9': [0, 3, 7, 14], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'sus': [0, 5, 7], '7sus4': [0, 5, 7, 10],
    '9sus4': [0, 5, 7, 10, 14], '6sus4': [0, 5, 7, 9], 'dim': [0, 3, 6], 'dim7': [0, 3, 6, 9],
    'm7b5': [0, 3, 6, 10], 'aug': [0, 4, 8], '+': [0, 4, 8],
}
# Arrangement per section style. Gains are multipliers on house levels; cut = pad low-pass
# (Hz) at the section's start and end; ring = sustain one chord per chord change, not per bar.
STYLES = {
    'intro': dict(pad=0.55, bass=0.0, arp=0.0, drone=1.0, drums=None, cut=(700, 1300), attack=0.6, level=0.95, ring=True),
    'build': dict(pad=0.8, bass=0.65, arp=0.8, drone=0.0, drums='build', cut=(1400, 3200), attack=0.15, level=0.95, ring=False),
    'groove': dict(pad=0.85, bass=1.0, arp=0.8, drone=0.0, drums='groove', cut=(2200, 2400), attack=0.1, level=1.0, ring=False),
    'drive': dict(pad=1.0, bass=1.0, arp=1.0, drone=0.0, drums='drive', cut=(3000, 3400), attack=0.05, level=1.0, ring=False),
    'breakdown': dict(pad=0.95, bass=0.5, arp=0.45, drone=0.0, drums='clock', cut=(1800, 3000), attack=0.2, level=0.9, ring=True),
    'resolve': dict(pad=1.0, bass=0.9, arp=0.0, drone=0.0, drums='one', cut=(1700, 1700), attack=0.02, level=1.0, ring=True),
    'hold': dict(pad=0, bass=0, arp=0, drone=0, drums=None, cut=(2000, 2000), attack=0.1, level=1.0, ring=True),
}
STYLES['tail'] = STYLES['hold']
ARP_PATTERN = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]
# Static levels (pre-master, before the per-run and per-film levelling in render()).
BASE = dict(tick=0.25, tock=0.34, hit=0.5, land=0.26, land_light=0.15, pop=0.12, whoosh=0.24, riser=0.18,
            drop=0.7, key=0.2, click=0.9, crisp=0.4, snap=0.45, swell=0.16, bell=0.08, suck=0.5)
# Typing (score.json "typing"). "auto" picks per run: "word" above AUTO_WORD_RATE chars/s, else "soft".
TYPING = ('auto', 'soft', 'mechanical', 'pitched', 'muted', 'word', 'off')
PER_KEY = ('soft', 'mechanical', 'pitched')  # a sound per key, in the foreground: the music ducks under them
TYPING_GAIN = dict(soft=1.0, mechanical=1.0, pitched=0.5, muted=0.8, word=5.0)
AUTO_WORD_RATE = 25.0  # chars/s: measured typing above 25-30 chars/s is sounded per word, or not at all
KEY_KIND_GAIN = {'letter': 1.0, 'back': 0.9, 'space': 1.26, 'return': 1.33}  # heard level: space +2 dB, return +2.5 dB
KEY_RMS_REF = dict(soft=0.31, mechanical=0.344, muted=0.388, pitched=0.624)  # a letter's 6 ms RMS / peak, per style
KEY_FAST = 12.0  # keys/s: typing faster than this is thinned
KEY_MIN_GAP = 1 / KEY_FAST  # s: in a fast run a letter sounds only this long after the previous sounded key
KEY_FLAM_GAP = 0.06  # s: never two keys closer (a flam); word starts, spaces and returns need only this
WORD_MIN_GAP = 0.08  # s: word blips closer than this merge into one
KEY_LEVEL_SD = 2.5  # dB, random per press (heard: about 2.5 dB SD over a run, with the word dynamics)
KEY_MAX_STEP = 5.0  # dB between neighbouring sounded keys as planned (heard: under 6 dB with the timbre's spread)
# Levels against the music, as measured: short-window (6 ms) effect RMS minus the music's 250 ms RMS
# at the same moment. render() levels each typing run, and each film's clicks and crisp ticks, to these.
LEVEL_VS_MUSIC = dict(key=-4.0, pitched=-8.0, muted=-14.0, word=6.0, click=-3.0, crisp=-8.0)  # at weight 1
LEVEL_CLAMP_DB = 12.0  # the levelling never moves a run or a voice more than this from its static level
QWERTY = ('qwertyuiop', 'asdfghjkl', 'zxcvbnm')
UI_KINDS = ('tick', 'tock')  # the signature clock: a small room, never the hall
WIDE_KINDS = ('whoosh', 'riser', 'swell', 'suck')  # only these take width; every other effect sits near the centre
SFX_PAN = 0.15  # |pan| of every other effect; the cue's pan (+-0.8 at the screen edges) is scaled into it


class ScoreError(Exception):
    pass


# ------------------------------------------------------------------------------------------
# harmony
# ------------------------------------------------------------------------------------------
class Chord:
    _re = re.compile(r'^([A-G][#b]?)(.*?)(?:/([A-G][#b]?))?$')

    def __init__(self, sym):
        m = self._re.match(sym.strip())
        if not m or m.group(2) not in QUALITIES:
            raise ScoreError(f'unknown chord "{sym}"; qualities: {", ".join(q or "(major)" for q in QUALITIES)}')
        self.name = sym
        self.root = S.pitch_class(m.group(1))
        self.iv = QUALITIES[m.group(2)]
        self.pcs = [(self.root + i) % 12 for i in self.iv]
        self.bass = S.pitch_class(m.group(3)) if m.group(3) else self.root

    def tones(self):
        """Voiced tones for pads: drop the fifth from 5+ note chords, double the root of triads."""
        iv = list(self.iv)
        if len(iv) >= 5 and 7 in iv:
            iv.remove(7)
        if len(iv) == 3:
            iv = iv + [12]
        if len(iv) == 2:
            iv = [0, 7, 12, 19]
        return [(self.root + i) % 12 for i in iv]


def voicings(ch):
    """Close and drop-2 voicings between D3 and G5 whose lowest note is the root, third or fifth
    (tensions such as 9 and 11 sit inside or on top, never at the bottom)."""
    tones = ch.tones()
    base = {(ch.root + i) % 12 for i in ch.iv if i in (0, 3, 4, 7) or (i == 5 and 3 not in ch.iv and 4 not in ch.iv)}
    out = []
    for r in range(len(tones)):
        order = tones[r:] + tones[:r]
        for low in range(50, 66):
            if low % 12 != order[0]:
                continue
            v = [low]
            for p in order[1:]:
                nxt = v[-1] + 1
                while nxt % 12 != p:
                    nxt += 1
                v.append(nxt)
            for cand in (v, sorted(v[:-2] + [v[-2] - 12] + v[-1:]) if len(v) >= 4 else None):
                if cand and cand[0] >= 50 and cand[-1] <= 79 and cand[0] % 12 in base:
                    out.append(cand)
    return out


def _mud(v):
    """penalty for close intervals low in the register (they turn to mud)"""
    c = 0
    for a, b in zip(v[:-1], v[1:]):
        if b - a <= 2 and a < 60:
            c += 6
        elif b - a <= 4 and a < 52:
            c += 4
    return c


def voice_lead(ch, prev):
    best, cost = None, 1e9
    for v in voicings(ch):
        c = 0.25 * abs(np.mean(v) - 62) + _mud(v)
        if prev:
            c += sum(min(abs(a - b) for b in prev) for a in v) + sum(min(abs(a - b) for a in v) for b in prev)
        else:
            c += abs(np.mean(v) - 60)
        if c < cost:
            best, cost = v, c
    return best


def stack(pcs, low, count):
    """`count` ascending notes from `low` cycling through pcs (arp tones)."""
    out, m = [], int(math.ceil(low))
    while len(out) < count:
        if m % 12 in pcs:
            out.append(m)
        m += 1
    return out


def arp_tones(ch, center=66):
    """root, third (or sus), fifth and one colour tone (9, maj7, 7 or the octave), ascending
    from the root nearest `center`"""
    tri = [i for i in ch.iv if i in (0, 3, 4, 5, 7)][:3]
    color = next((c for c in (14, 11, 10, 9) if c in ch.iv), 12)
    first = int(S.nearest([ch.root], center))
    out = [first]
    for i in tri[1:] + [color]:
        m = first + i
        while m <= out[-1]:
            m += 12
        out.append(m)
    return out


# ------------------------------------------------------------------------------------------
# the song: timing, chords, sections
# ------------------------------------------------------------------------------------------
class Song:
    def __init__(self, score, cues):
        self.cues = cues
        self.fps, self.total, self.bpm = float(cues['fps']), int(cues['total']), float(cues['bpm'])
        if 'bpm' in score and abs(float(score['bpm']) - self.bpm) > 1e-6:
            raise ScoreError(f'score.json bpm {score["bpm"]} differs from the timeline ({self.bpm}); fix one')
        self.beat = 60.0 / self.bpm
        self.barlen = 4 * self.beat
        self.dur = self.total / self.fps
        self.nbars = int(math.ceil(self.dur / self.barlen - 1e-9))
        self.warnings = []
        key = str(score.get('key', 'C major')).split()
        self.tonic = S.pitch_class(key[0])
        self.mode = key[1].lower() if len(key) > 1 else 'major'
        if self.mode not in MODES:
            raise ScoreError(f'unknown mode "{self.mode}"; use one of {", ".join(MODES)}')
        self.scale = [(self.tonic + i) % 12 for i in MODES[self.mode]]
        minorish = MODES[self.mode][2] == 3
        self.penta = [(self.tonic + i) % 12 for i in ([0, 3, 5, 7, 10] if minorish else [0, 2, 4, 7, 9])]
        self._chords(score.get('chords', []))
        self._sections(score.get('sections', []))
        sig = score.get('signature', {})
        self.sig_tick = S.midi(sig['tick']) if 'tick' in sig else S.nearest([self.tonic], 86)  # octave 6: 0.8-1.6 kHz
        self.sig_tock = S.midi(sig['tock']) if 'tock' in sig else S.nearest([(self.tonic + 7) % 12], self.sig_tick - 5)
        t5 = S.nearest([self.tonic], 72)
        self.motif = [S.midi(m) if isinstance(m, str) else t5 + m for m in sig.get('motif', [0, 7, 14])]
        step = float(sig.get('step', 0.5))
        self.rhythm = [float(r) for r in sig['rhythm']] if 'rhythm' in sig else [k * step for k in range(len(self.motif))]
        if len(self.rhythm) != len(self.motif):
            raise ScoreError('signature.rhythm needs one beat offset per motif note')
        self.motifs = []
        for m in score.get('motifs', []):
            notes = [S.midi(x) if isinstance(x, str) else t5 + x for x in m['notes']] if 'notes' in m else self.motif
            rhythm = [float(r) for r in m['rhythm']] if 'rhythm' in m else (
                self.rhythm if 'notes' not in m else [k * float(m.get('step', step)) for k in range(len(notes))])
            self.motifs.append(dict(t=self.T(m['at']), gain=float(m.get('gain', 1.0)), notes=notes, rhythm=rhythm))
        # silences: (t0, t1, depth, scope). A drop's silence stops the music dead (reverb
        # included) while effects of on-screen motion ring on; a `silences` entry mutes everything.
        self.silences = []
        self.sucks = []  # (t0, t1, depth): the music ducks into a drop
        for d in score.get('drops', []):
            t = self.T(d['at'])
            sil = self.span(d.get('silence', 0))
            if sil > 0:
                self.silences.append((t - sil, t, float(d.get('depth', 0.97)), 'music'))
            suck = float(d.get('suck', 0.2))
            if suck > 0:
                self.sucks.append((t - max(suck, sil), t, float(d.get('suckDepth', 0.9))))
        for s_ in score.get('silences', []):
            self.silences.append((self.T(s_['from']), self.T(s_['to']), float(s_.get('depth', 0.97)), 'all'))
        self.payoff = self.T(score['payoff']) if 'payoff' in score else None
        pr = score.get('progress')
        self.progress = None
        if pr:  # a progress motif: matching events climb the scale one step each; the resolve lands on the tonic
            if not pr.get('match'):
                raise ScoreError('progress needs "match": a piece of the event ids that climb (e.g. "day")')
            self.progress = dict(match=str(pr['match']), kind=pr.get('kind'), start=pr.get('start'),
                                 tonic=S.midi(pr['tonic']) if 'tonic' in pr else S.nearest([self.tonic], 76),  # rungs near 0.5-1.5 kHz
                                 resolve=self.T(pr['resolve']) if 'resolve' in pr else None,
                                 gain=float(pr.get('gain', 1.0)))
        self.typing = str(score.get('typing', 'auto')).lower()
        if self.typing not in TYPING:
            raise ScoreError(f'unknown typing "{self.typing}"; use one of {", ".join(TYPING)}')
        self.keyup = bool(score.get('keyup', False))
        mix = score.get('mix', {})
        self.mix = dict(music=float(mix.get('music', 1.0)), sfx=float(mix.get('sfx', 1.0)),
                        reverb=float(mix.get('reverb', 1.0)), sidechain=float(mix.get('sidechain', 0.55)),
                        duck_db=float(mix.get('duck_db', 3.0)), typing_duck_db=float(mix.get('typing_duck_db', 10.0)))
        if not 0 <= self.mix['typing_duck_db'] <= 30:
            raise ScoreError('mix.typing_duck_db is dB the music dips under typing: 0 (off) to 30 (default 10)')
        bed = score.get('bed')
        self.bed = None
        if bed:  # a supplied music track: it replaces nothing, it joins the music bus
            bed = {'file': bed} if isinstance(bed, str) else bed
            self.bed = dict(file=bed['file'], at=self.T(bed.get('at', 0)), gain_db=float(bed.get('gain_db', 0)))
        mas = score.get('master', {})
        self.lufs = float(mas.get('lufs', -14.0))
        self.ceiling = float(mas.get('ceiling', 0.77))
        self.fade = float(mas.get('fade', min(1.3, max(0.4, self.dur * 0.12))))

    # time --------------------------------------------------------------------------------
    def bar_t(self, bar, beat=0.0, sub=0.0):
        return ((bar - 1) * 4 + beat + sub / 4) * self.beat

    def T(self, x):
        """frame number | "@cue" | "@cue+6" | "bar:beat:sub" string -> seconds"""
        if isinstance(x, (int, float)):
            return float(x) / self.fps
        s = str(x).strip()
        m = re.match(r'^@([A-Za-z_]\w*)\s*([+-]\s*\d+(\.\d+)?)?$', s)
        if m:
            if m.group(1) not in self.cues['cue']:
                raise ScoreError(f'score.json refers to cue "{m.group(1)}", not in cues.json '
                                 f'({", ".join(sorted(self.cues["cue"]))})')
            return (self.cues['cue'][m.group(1)] + float((m.group(2) or '0').replace(' ', ''))) / self.fps
        m = re.match(r'^(\d+)(?::(\d+(?:\.\d+)?))?(?::(\d+(?:\.\d+)?))?$', s)
        if m:
            return self.bar_t(int(m.group(1)), float(m.group(2) or 0), float(m.group(3) or 0))
        raise ScoreError(f'cannot read time {x!r}: use a frame number, "@cue", "@cue+6" or "bar:beat:sub"')

    def span(self, x):
        """duration: frames (number) | "1/8" note value | "@cue" not allowed -> seconds"""
        if isinstance(x, (int, float)):
            return float(x) / self.fps
        m = re.match(r'^(\d+)/(\d+)$', str(x).strip())
        if m:
            return 4 * self.beat * int(m.group(1)) / int(m.group(2))
        raise ScoreError(f'cannot read duration {x!r}: frames or a note value such as "1/8"')

    # chords --------------------------------------------------------------------------------
    def _chords(self, chords):
        if not chords:
            raise ScoreError('score.json needs "chords": one chord symbol per bar')
        if len(chords) > self.nbars:
            self.warnings.append(f'{len(chords)} chords for {self.nbars} bars: extra chords ignored')
        if len(chords) < self.nbars - 1:
            self.warnings.append(f'{len(chords)} chords for {self.nbars} bars: the last chord holds')
        segs = []
        for b in range(1, self.nbars + 1):
            entry = chords[min(b, len(chords)) - 1] if b <= len(chords) else '-'
            parts = str(entry).split()
            for k, sym in enumerate(parts):
                t0 = self.bar_t(b) + k * self.barlen / len(parts)
                if sym == '-':
                    continue
                ch = None if sym.upper() in ('N.C.', 'NC') else Chord(sym)
                if segs and (segs[-1][2].name if segs[-1][2] else None) == (ch.name if ch else None):
                    continue  # the same chord again just continues
                segs.append([t0, None, ch])
        for i, s_ in enumerate(segs):
            s_[1] = segs[i + 1][0] if i + 1 < len(segs) else self.bar_t(self.nbars + 1) + 4
        self.segs = [tuple(s_) for s_ in segs]

    def chord_at(self, t):
        for a, b, ch in self.segs:
            if a <= t + 1e-6 < b:
                return ch
        return self.segs[-1][2]

    def sub_root(self, t):
        """the chord's root between E1 and Eb2 (41-78 Hz): snaps, booms and landings glide onto it"""
        ch = self.chord_at(t)
        pc = ch.root if ch else self.tonic
        return S.mtof(28 + (pc - 28) % 12)

    # sections --------------------------------------------------------------------------------
    def _sections(self, sections):
        self.sections = []
        taken = set()
        for s_ in sections:
            b0, b1 = (s_['bars'] if isinstance(s_['bars'], list) else [s_['bars'], s_['bars']])
            style = s_.get('style', 'groove')
            if style not in STYLES:
                raise ScoreError(f'unknown section style "{style}"; use one of {", ".join(STYLES)}')
            if b0 < 1 or b1 < b0:
                raise ScoreError(f'bad section bars {s_["bars"]}')
            if b1 > self.nbars:
                self.warnings.append(f'section {s_["bars"]} runs past the last bar ({self.nbars})')
            for b in range(b0, b1 + 1):
                if b in taken:
                    raise ScoreError(f'bar {b} is in two sections')
                taken.add(b)
            st = dict(STYLES[style])
            st.update(dict(style=style, b0=b0, b1=b1, level=float(s_.get('level', st['level'])),
                           bright=float(s_.get('bright', 1.0)), clock=bool(s_.get('clock', False)),
                           hats=bool(s_.get('hats', True)), layers=s_.get('layers', {})))
            if 'drums' in s_:
                st['drums'] = s_['drums']
            for k, v in st['layers'].items():
                if k not in ('pad', 'bass', 'arp', 'drone', 'drums', 'bells'):
                    raise ScoreError(f'unknown layer "{k}" in section {s_["bars"]}')
            self.sections.append(st)
        self.sections.sort(key=lambda s_: s_['b0'])

    def section_at(self, t):
        bar = int(t // self.barlen) + 1
        for s_ in self.sections:
            if s_['b0'] <= bar <= s_['b1']:
                return s_
        return None

    def silence_start_in(self, a, b):
        starts = [s0 for s0, s1, _, _ in self.silences if a <= s0 < b]
        return min(starts) if starts else None


# ------------------------------------------------------------------------------------------
# music
# ------------------------------------------------------------------------------------------
def layer(sec, name):
    """a layer's gain in a section: the style's default times the section's `layers` override"""
    base = sec[name] if name in ('pad', 'bass', 'arp', 'drone') else 1.0
    return float(base) * float(sec['layers'].get(name, 1.0))


def build_music(song, n, events, plan=None):
    drums, bass, pad, arp, bells = (np.zeros((n, 2)) for _ in range(5))
    kicks = []
    beat, barlen = song.beat, song.barlen
    ev_t = [(e['f'] / song.fps, e['kind']) for e in events]
    key_t = [k['t'] for k in (plan or {}).values()]  # sounded keys (and word blips) only
    fg_t = [k['t'] for k in (plan or {}).values() if k['style'] in PER_KEY]  # typing in the foreground
    owned = [t for t, k in ev_t if k in ('tick', 'tock', 'click')] + key_t
    big = [t for t, k in ev_t if k in ('drop', 'hit', 'snap')]
    booms = [t for t, k in ev_t if k in ('drop', 'hit')]

    def free(t, tol=1.6):
        return all(abs(t - o) > tol / song.fps for o in owned)

    tonic_kick = S.mtof(28 + (song.tonic - 28) % 12)  # the kick settles on the tonic (E1..Eb2): in key under every chord

    def K(t, g=1.0, hard=1.0):
        if not in_silence(song, t):
            S.place(drums, S.kick(tonic_kick, 0.9, hard), t, g)
            kicks.append((t, g))

    # ---- pads ------------------------------------------------------------------------------
    notes = []
    for sec in song.sections:
        if layer(sec, 'pad') <= 0:
            continue
        s0, s1 = song.bar_t(sec['b0']), song.bar_t(sec['b1'] + 1)
        for a, b, ch in song.segs:
            a2, b2 = max(a, s0), min(b, s1)
            if a2 >= b2 - 1e-6 or ch is None:
                continue
            cuts = [a2] + ([] if sec['ring'] else [song.bar_t(k) for k in range(sec['b0'], sec['b1'] + 2) if a2 < song.bar_t(k) < b2]) + [b2]
            for x0, x1 in zip(cuts[:-1], cuts[1:]):
                notes.append((x0, x1, ch, sec))
    notes.sort(key=lambda z: z[0])
    prev = None
    for i, (a, b, ch, sec) in enumerate(notes):
        v = voice_lead(ch, prev)
        prev = v
        release = 0.9
        after = song.section_at(b + 1e-3)
        if sec['style'] == 'resolve' or after is None or after['style'] in ('hold', 'tail'):
            release = 2.2  # the last chord rings out
        end = b + release
        nxt = song.chord_at(b + 1e-3)
        if ch.root == (song.tonic + 7) % 12 and nxt is not None and nxt.root == song.tonic and b < song.dur - 0.5:
            end, release = b + 0.08, 0.3  # the V chord is gone by the downbeat it resolves into
        sil = song.silence_start_in(a, end)
        if sil is not None:
            end, release = sil, min(0.6, max(0.05, (sil - a) * 0.5))
        u = (a - song.bar_t(sec['b0'])) / max(1e-6, song.bar_t(sec['b1'] + 1) - song.bar_t(sec['b0']))
        cut = (sec['cut'][0] + (sec['cut'][1] - sec['cut'][0]) * u) * sec['bright']
        # the film's first chord starts with intent (no fade-in on the hook); the intro builds by its filter
        attack = 0.02 if a < 1e-3 or any(abs(a - t) < 0.03 for t in big) else sec['attack']
        d = max(0.05, end - a)
        gain = 0.34 * layer(sec, 'pad') / len(v) * 2.2
        for k, m in enumerate(v):
            x = S.supersaw(S.mtof(m), d, 5, 0.11, cut, min(attack, d * 0.5), min(release, d * 0.9), seed=1000 + 17 * k + i)
            S.place(pad, x, a, gain)
    pad = S.filt(pad, S.hp(170, 2))
    # intro drone: tonic + fifth, swelling, stopping dead where the section (or a silence) ends
    for sec in song.sections:
        if layer(sec, 'drone') <= 0:
            continue
        a, b = song.bar_t(sec['b0']), song.bar_t(sec['b1'] + 1)
        sil = song.silence_start_in(a, b)
        b = sil if sil is not None else b
        root = S.mtof(28 + (song.tonic - 28) % 12)
        rise = 0.05 if a < 1e-3 else 1.6  # at the film's start the drone is already there
        S.place(pad, S.drone([root, root * 1.5], b - a, rise=rise), a, 0.16 * layer(sec, 'drone'))

    # ---- drums, bass, arp per bar -----------------------------------------------------------
    for sec in song.sections:
        dg, bg, ag = layer(sec, 'drums'), layer(sec, 'bass'), layer(sec, 'arp')
        nb = sec['b1'] - sec['b0'] + 1
        for bar in range(sec['b0'], sec['b1'] + 1):
            s = song.bar_t(bar)
            if s >= song.dur:
                break
            u = (bar - sec['b0']) / max(1, nb - 1)
            # typing in the foreground owns the top end: the hats stop and the arp steps back
            typing = sum(1 for t in fg_t if s <= t < s + barlen) >= 4
            hats = sec['hats'] and not typing
            pat = sec['drums']

            def H(t, g, d=0.08, tau=0.012, bright=7500, pan=0.25):
                if hats and free(t) and not song.silence_start_in(t - 0.01, t + 0.01) and not in_silence(song, t):
                    S.place(drums, S.hat(d, tau, bright, seed=14 + int(t * 1000)), t, g * dg, pan)  # a new hat every hit

            if pat == 'build':
                K(s, 0.6 * dg, 0.8)
                for k in range(8):
                    H(s + k * beat / 2, (0.04 + 0.05 * u) * (1.4 if k % 2 else 0.8), 0.06, 0.01, 9000, -0.2 + 0.4 * (k % 2))
            elif pat == 'groove':
                K(s, 1.0 * dg)
                K(s + 1.75 * beat, 0.55 * dg)
                K(s + 2 * beat, 0.85 * dg)
                S.place(drums, S.clap(seed=13 + 4 * bar), s + 2 * beat, 0.42 * dg)
                for k in range(8):
                    if not typing or k % 2 == 0:
                        H(s + k * beat / 2, 0.10 if k % 2 else 0.05)
            elif pat == 'drive':
                for q in range(4):
                    K(s + q * beat, (1.0 if q == 0 else 0.85) * dg)
                    H(s + q * beat + beat / 2, 0.16, 0.25, 0.07, 6500, 0.2)
                S.place(drums, S.clap(seed=13 + 4 * bar), s + beat, 0.40 * dg)
                S.place(drums, S.clap(seed=15 + 4 * bar), s + 3 * beat, 0.44 * dg)
                if not typing:
                    for k in range(1, 16, 2):
                        H(s + k * beat / 4, 0.06, 0.05, 0.01, 9500, -0.3)
            elif pat == 'clock':
                for k in range(8):
                    t = s + k * beat / 2
                    if free(t, 2.5):
                        m = song.sig_tick if k % 2 == 0 else song.sig_tock
                        vary = 10 ** (float(np.clip(S.rng(bar * 64 + k).normal(0, 1.0), -2, 2)) / 20)  # +-1 dB, a new seed per tick
                        S.place(drums, S.tick(S.mtof(m), 0.05, 0.008, 0.5, 2000 + bar * 64 + k, k % 2 == 1), t,
                                (0.10 + 0.03 * u) * dg * vary, -0.15 if k % 2 else 0.15)
            elif pat == 'one' and bar == sec['b0'] and not any(abs(s - t) < 2 / song.fps for t in booms):
                K(s, 1.0 * dg, 1.1)  # a drop or hit on this downbeat already carries the weight
            if sec['clock']:
                for q in range(4):
                    t = s + q * beat
                    if free(t, 2.5) and not in_silence(song, t):
                        m = song.sig_tick if q % 2 == 0 else song.sig_tock
                        vary = 10 ** (float(np.clip(S.rng(bar * 16 + q + 7).normal(0, 1.0), -2, 2)) / 20)
                        S.place(drums, S.tick(S.mtof(m), 0.06, 0.009, 0.6, 3000 + bar * 16 + q, q % 2 == 1), t,
                                (0.06 + 0.01 * (q % 2 == 0)) * vary, 0.15 if q % 2 else -0.15)

            # bass
            if bg > 0:
                def B(t, d, g, oct_=0, drive=1.3, h2=0.22):
                    ch = song.chord_at(t)
                    if ch is None or in_silence(song, t):
                        return
                    m = S.nearest([ch.bass], 35) + oct_
                    sil = song.silence_start_in(t, t + d)
                    d = (sil - t) if sil is not None else d
                    if d > 0.03:
                        S.place(bass, S.bass(S.mtof(m), d, drive, h2), t, g * bg)
                st = sec['style']
                if st == 'drive':
                    for k in range(8):
                        B(s + k * beat / 2, beat / 2 * 0.95, 0.40, 12 if k in (3, 7) else 0, 1.3, 0.35)
                elif st == 'groove':
                    B(s, beat * 1.5, 0.36)
                    B(s + 1.75 * beat, beat * 0.45, 0.26)
                    B(s + 2 * beat, beat * 1.9, 0.34)
                elif st in ('build', 'breakdown'):
                    for a, b, ch in song.segs:
                        a2, b2 = max(a, s), min(b, s + barlen)
                        if a2 < b2 - 1e-6 and ch is not None:
                            B(a2, (b2 - a2) * 0.98, 0.22, 0, 1.1)
                elif st == 'resolve' and bar == sec['b0']:
                    s0, s1 = song.bar_t(sec['b0']), song.bar_t(sec['b1'] + 1)
                    segs_ = [(max(a, s0), min(b, s1), ch) for a, b, ch in song.segs if ch is not None and min(b, s1) > max(a, s0) + 1e-6]
                    for j, (a2, b2, ch) in enumerate(segs_):
                        d = (b2 - a2) if j < len(segs_) - 1 else max(b2 - a2, min(1.6 * barlen, song.dur - a2))
                        x = S.bass(S.mtof(S.nearest([ch.bass], 35)), max(0.1, d), 1.2)
                        k = min(len(x), S.ns(0.4))
                        x[-k:] *= np.linspace(1, 0, k)
                        S.place(bass, x, a2 + (0.06 if j == 0 else 0), 0.3 * bg)  # lets the kick or boom land first

            # pluck arp
            if ag > 0:
                st = sec['style']
                step = 1 if st == 'drive' else 2
                gain = {'build': 0.06 + 0.04 * u, 'groove': 0.08, 'drive': 0.13, 'breakdown': 0.06}.get(st, 0.06) * ag
                if typing:
                    gain *= 0.6
                for k in range(0, 16, step):
                    t = s + k * beat / 4
                    ch = song.chord_at(t)
                    if ch is None or in_silence(song, t) or song.silence_start_in(t, t + 0.12):
                        continue
                    tones = arp_tones(ch)
                    m = tones[ARP_PATTERN[k] % len(tones)] + (12 if st == 'drive' and k in (6, 14) else 0)
                    S.place(arp, S.pluck(S.mtof(m), 0.45, 4200 if st == 'drive' else 3000), t,
                            gain * (1.0 if k % 4 == 0 else 0.75), -0.35 if k % 2 else 0.35)
    arp = S.pingpong(arp, beat * 0.75, fb=0.32, mix=0.28)

    # ---- bells: a chord on each resolve, the signature motif where score.json places it ------
    for sec in song.sections:
        t = song.bar_t(sec['b0'])
        if sec['style'] == 'resolve' and layer(sec, 'bells') > 0 and not any(abs(mo['t'] - t) < 0.1 for mo in song.motifs):
            ch = song.chord_at(t + 1e-3)
            if ch is not None:  # a strummed chord of bells on the resolution (the motif replaces it)
                tones = [S.nearest([ch.root], 56)] + stack(ch.pcs, 68, 3)
                for k, m in enumerate(tones):
                    S.place(bells, S.fm_bell(S.mtof(m), 4.5, 2.0, 3.5, 1.8), t + 0.02 * k, (0.10 - 0.015 * k) * layer(sec, 'bells'))
    for mo in song.motifs:
        for k, (m, r) in enumerate(zip(mo['notes'], mo['rhythm'])):
            S.place(bells, S.fm_bell(S.mtof(m), 3.0, 1.4, 3.5, 1.3), mo['t'] + r * beat,
                    (0.10 - 0.015 * k) * mo['gain'], 0.12 * (k % 2 * 2 - 1))
    return dict(drums=drums, bass=bass, pad=pad, arp=arp, bells=bells), kicks


def in_silence(song, t, scope=None):
    return any(a <= t < b for a, b, _, sc in song.silences if scope is None or sc == scope)


PITCHED = ('pop', 'tick', 'tock', 'click', 'bell', 'land')  # kinds whose voice takes a `pitch`


def apply_progress(song, events):
    """The progress motif (score.json "progress"): every event whose id contains `match` (and
    whose kind is `kind`, if given) gets the next note of the key's scale, in frame order, so
    progress is heard as a climb. By default the last rung is the step below the tonic, and
    `resolve` places the tonic above it (with its octave below, on the bells) on the payoff.
    Returns the report entry."""
    pr = song.progress
    hits = [e for e in events if pr['match'] in str(e.get('id', '')) and (not pr['kind'] or e['kind'] == pr['kind'])]
    if not hits:
        song.warnings.append(f'progress: no event id contains "{pr["match"]}": nothing climbs')
        return dict(match=pr['match'], events=0)
    steps = MODES[song.mode]
    n = len(hits)
    start = int(pr['start']) if pr['start'] is not None else max(1, 8 - n)  # end one step under the octave

    def degree(d):  # 1-based scale degree, any height, above the progress tonic
        k = d - 1
        return pr['tonic'] + 12 * (k // 7) + steps[k % 7]

    rungs = []
    for k, e in enumerate(hits):
        m = degree(start + k)
        e['pitch'] = m
        rungs.append(dict(f=e['f'], id=e.get('id', ''), kind=e['kind'], note=note_name(m)))
        if e['kind'] not in PITCHED or (e['kind'] == 'land' and float(e.get('weight', 1)) >= 0.6 and e.get('variant') != 'light'):
            song.warnings.append(f'progress: {e["kind"]} {e.get("id", "")} ignores its pitch (use pop, bell, tick, click '
                                 'or a light land for the rungs)')
    rep = dict(match=pr['match'], events=n, rungs=rungs)
    if pr['resolve'] is not None:
        top = degree(start + n - 1)
        res = top + 1 + (song.tonic - (top + 1)) % 12  # the first tonic above the last rung
        if pr['resolve'] <= hits[-1]['f'] / song.fps:
            song.warnings.append('progress: the resolve comes before the last rung; it must land after the climb')
        song.motifs.append(dict(t=pr['resolve'], gain=pr['gain'] * 1.3, notes=[res, res - 12], rhythm=[0.0, 0.0]))
        rep['resolve'] = dict(t=round(pr['resolve'], 3), note=note_name(res))
    return rep


# ------------------------------------------------------------------------------------------
# sound effects from events
# ------------------------------------------------------------------------------------------
def balance(x, pan):
    if not pan:
        return x
    a = (float(np.clip(pan, -1, 1)) + 1) * np.pi / 4
    return x * np.array([np.cos(a), np.sin(a)]) * np.sqrt(2)


def plan_typing(song, events):
    """Humanize the film's key events for score.json "typing". Returns (plan, thinned, runs):
    plan[i] holds how event i sounds, thinned[i] why it does not, runs the bursts of typing (keys
    under 0.5 s apart) with their character rate and style, for the levelling and the report.

    - Style per run: "auto" (the default) sounds a run of more than 25 chars/s per word ("word")
      and a slower one per key ("soft"); any other style applies to every run.
    - "word": one pitched blip per word, on each word start (variant "word") and on the first key
      of a run, at least 80 ms apart; the other keys stay silent. The blips step through the tones
      of the chord under them (E4-F6, 330-1400 Hz), up and back down, word by word.
    - Per key, thinned by time, not by frames: no two keys sound within 60 ms (a flam), and where
      the typing runs faster than 12 keys/s (within +-0.25 s) a letter sounds only 1/12 s after
      the previous sounded key. A word start, space or return needs only the 60 ms, and displaces
      a plain letter there rather than being dropped. Realistic typing (up to ~12/s) keeps nearly
      every key.
    - Level follows the word: +2.5 dB on a word start, -0.3 dB per letter inside the word (down to
      -1.5), -1 dB on the letter before a space, sigma 2.5 dB at random (clipped at 6.25), and -3 dB
      ramped in from 1.5 s to 3 s into a run (the ear habituates; the first words sell the rest);
      about 2.5 dB SD in all, and never more than 5 dB between neighbouring keys as planned
      (under 6 dB as heard).
    - Density: gain x min(1, sqrt(10 / rate)) and decays x clip(10 / rate, 0.6, 1), where rate is
      the sounded keys per second within +-0.25 s, so a burst keeps one loudness and stays clean.
    - Timing: onsets jitter by sigma 3.5 ms, clipped at 8 ms and at 0.9 frame from the cue.
    - About half the letters bottom out 25-35 ms after the press at -12 to -15 dB; space and return
      always do. A separate key-up click only with "keyup": true in score.json (next key over 140
      ms away).
    - Each letter is one of 26 fixed keys (same key, same timbre), within +-0.05 of the centre by its
      keyboard column; space and return are one key each, centred. Per press: pitch sigma 1.2%.
    - "pitched": letters random-walk over the chord's pentatonic tones in G4-F5; space and return
      take the chord root near C4."""
    keys = [i for i, e in enumerate(events) if e['kind'] == 'key']
    plan, thinned, runs = {}, {}, []
    if not keys:
        return plan, thinned, runs
    T = {i: float(events[i]['f']) / song.fps for i in keys}
    V = {i: str(events[i].get('variant', '') or '') for i in keys}
    edge = ('space', 'return')

    def prio(i):
        return V[i] in ('word',) + edge

    pos, before_space, run_of, first, prev = {}, {}, {}, set(), None
    for n, i in enumerate(keys):  # bursts and each letter's place in its word, over every key event
        new_run = prev is None or T[i] - T[prev] > 0.5
        if new_run:
            runs.append(dict(t0=T[i], t1=T[i], keys=0, sounded=0, rate_max=0.0, idx=[]))
            first.add(i)
        run_of[i] = len(runs) - 1
        runs[-1]['t1'] = T[i]
        runs[-1]['keys'] += 1
        runs[-1]['idx'].append(i)
        pos[i] = 0 if (new_run or V[i] in ('word',) + edge or V[prev] in edge) else pos[prev] + 1
        nxt = keys[n + 1] if n + 1 < len(keys) else None
        before_space[i] = nxt is not None and V[nxt] in edge and V[i] not in edge
        prev = i
    for r in runs:
        span = r['t1'] - r['t0']
        r['chars_per_s'] = (r['keys'] - 1) / span if span > 1e-6 else 0.0
        r['style'] = song.typing if song.typing != 'auto' else ('word' if r['chars_per_s'] > AUTO_WORD_RATE else 'soft')
    if song.typing == 'off':
        return plan, {i: 'typing is "off" in score.json' for i in keys}, runs
    style = {i: runs[run_of[i]]['style'] for i in keys}
    lim = min(0.008, 0.9 / song.fps)

    # word: one blip per word, stepping through the chord tones
    contour = (0, 1, 2, 3, 4, 3, 2, 1)
    last_blip, wk = -1e9, 0
    for i in keys:
        if style[i] != 'word':
            continue
        if i in first:
            wk = 0
        why = None
        if not (V[i] == 'word' or i in first):
            why = 'typing "word": one blip per word, on its first key'
        elif T[i] - last_blip < WORD_MIN_GAP:
            why = f'{(T[i] - last_blip) * 1000:.0f} ms after the previous word blip (merged)'
        if why:
            thinned[i] = why
            continue
        last_blip = T[i]
        r = S.rng(7919 * i + int(float(events[i]['f']) * 10) + 37)
        ch = song.chord_at(T[i] + 1e-3)
        pcs = ch.pcs if ch is not None else song.penta
        tones = [m for m in range(64, 90) if m % 12 in pcs]  # E4-F6: 330-1400 Hz
        start = int(np.argmin([abs(m - 69) for m in tones]))  # from the chord tone nearest A4
        m = tones[min(len(tones) - 1, start + contour[wk % len(contour)])]
        wk += 1
        db = float(np.clip(r.normal(0, 1.0), -2.0, 2.0)) + (1.5 if i in first else 0.0)
        plan[i] = dict(t=max(0.0, T[i] + float(np.clip(r.normal(0, 0.0025), -lim, lim))), kind='word', style='word',
                       seed=0, strike=7919 * i, level=10 ** (db / 20), keyup=None, second=0.0, second_db=None, tau=1.0,
                       note=S.mtof(m), midi=m, pitch=1.0, pan=0.0, gain=TYPING_GAIN['word'], db=db)
        runs[run_of[i]]['sounded'] += 1

    # per key (soft, mechanical, pitched, muted): thin by time
    pk = [i for i in keys if style[i] != 'word']
    ta = np.array([T[i] for i in pk])
    kept = []
    for i in pk:
        if kept and run_of[kept[-1]] == run_of[i]:
            j = kept[-1]
            gap = T[i] - T[j]
            fast = np.sum(np.abs(ta - T[i]) <= 0.25) / 0.5 > KEY_FAST
            if gap < (KEY_MIN_GAP if fast and not prio(i) else KEY_FLAM_GAP):
                if prio(i) and not prio(j) and (len(kept) < 2 or T[i] - T[kept[-2]] >= KEY_FLAM_GAP):
                    thinned[j] = f'displaced by the {V[i] or "key"} {gap * 1000:.0f} ms later (thinned)'
                    kept[-1] = i
                else:
                    thinned[i] = f'{gap * 1000:.0f} ms after the previous sounded key (thinned)'
                continue
        kept.append(i)
    tk = np.array([T[i] for i in kept])
    letters = ''.join(QWERTY)
    walk, prev_db = 2, None
    for n, i in enumerate(kept):
        f = float(events[i]['f'])
        r = S.rng(7919 * i + int(f * 10) + 31)
        rate = float(np.sum(np.abs(tk - T[i]) <= 0.25)) / 0.5
        kind = V[i] if V[i] in ('space', 'return', 'back') else 'letter'
        db = float(np.clip(r.normal(0, KEY_LEVEL_SD), -2.5 * KEY_LEVEL_SD, 2.5 * KEY_LEVEL_SD))
        if kind in ('letter', 'back'):
            db += 2.5 if pos[i] == 0 else -min(1.5, 0.3 * pos[i]) - (1.0 if before_space[i] else 0.0)
        db -= 3.0 * float(np.clip((T[i] - runs[run_of[i]]['t0'] - 1.5) / 1.5, 0, 1))
        gain = min(1.0, math.sqrt(10.0 / rate)) * KEY_KIND_GAIN[kind] * TYPING_GAIN[style[i]]
        total = db + 20 * math.log10(gain)  # what is heard: the press level and the key's gain together
        if prev_db is not None and n > 0 and run_of[kept[n - 1]] == run_of[i]:
            total = float(np.clip(total, prev_db - KEY_MAX_STEP, prev_db + KEY_MAX_STEP))  # no jump over 5 dB as planned
            db = total - 20 * math.log10(gain)
        prev_db = total
        gap = tk[n + 1] - T[i] if n + 1 < len(kept) else 1e9
        need, dwell = (0.2, (0.12, 0.18)) if kind in edge else (0.14, (0.07, 0.12))
        u_up, u_sec, u_delay, u_db = r.random(), r.random(), r.random(), r.random()
        keyup = min(dwell[0] + (dwell[1] - dwell[0]) * u_up, gap - 0.03) if song.keyup and gap > need else None
        second = None if kind in edge else (0.025 + 0.010 * u_delay if u_sec < 0.5 else 0.0)  # about half the letters
        ident = int(S.rng(4242 + i).integers(26))
        row = next(k for k, rw in enumerate(QWERTY) if letters[ident] in rw)
        col = QWERTY[row].index(letters[ident]) + (0, 0.25, 0.75)[row]
        note, m = None, None
        if style[i] == 'pitched':
            ch = song.chord_at(T[i] + 1e-3)
            pcs = [q for q in song.penta if ch is None or q in ch.pcs]
            pcs = pcs if len(pcs) >= 3 else song.penta
            if kind in edge:
                m = S.nearest([ch.root if ch else song.tonic], 60)
            else:
                tones = [q for q in range(67, 78) if q % 12 in pcs]
                walk = int(np.clip(walk + int(r.integers(-2, 3) if pos[i] == 0 else r.integers(-1, 2)), 0, len(tones) - 1))
                m = tones[walk]
            note = S.mtof(m)
        plan[i] = dict(t=max(0.0, T[i] + float(np.clip(r.normal(0, 0.0035), -lim, lim))), kind=kind, style=style[i],
                       seed=0 if kind in edge else ident, strike=7919 * i + int(f * 10), level=10 ** (db / 20),
                       keyup=keyup, second=second, second_db=None if kind in edge else -12.0 - 3.0 * u_db,
                       tau=float(np.clip(10.0 / rate, 0.6, 1.0)), note=note, midi=m,
                       pitch=1 + float(np.clip(0.012 * r.standard_normal(), -0.025, 0.025)),
                       pan=0.0 if kind in edge else (col / 9.0 - 0.5) * 0.1, db=db, gain=gain)
        runs[run_of[i]]['sounded'] += 1
        runs[run_of[i]]['rate_max'] = max(runs[run_of[i]]['rate_max'], rate)
    return plan, thinned, runs


def build_sfx(song, n, events, plan=None, thinned=None):
    """Every event as a sound. Returns the buses (fx with its rooms, hall sends, ui for the clock's
    tick/tock with a small room, and keys, clicks and crisp ticks, all dry), the placed and skipped
    events and the hit ducks. Effects other than whooshes, risers, swells and sucks sit within
    +-0.15 of the centre: the cue's pan is scaled into that range."""
    fx, hall, ui, keys, clicks, crisp = (np.zeros((n, 2)) for _ in range(6))
    placed, skipped, ducks = [], [], []
    fps, beat = song.fps, song.beat
    plan, thinned = plan or {}, thinned or {}
    last_heavy = None
    pop_run, last_pop, lights = 0, -1e9, {}
    # the UI click: one voice for the whole film at one level (the median click weight), a fixed
    # press-release gap, +-0.5 dB and a tiny timbre jitter per press
    cw = [float(e.get('weight', 1.0)) for e in events if e['kind'] == 'click']
    click_w = float(np.median(cw)) if cw else 1.0
    click_seed = 23 + 7 * song.tonic
    click_gap = 0.080 + 0.012 * S.rng(click_seed).random()
    for i, e in enumerate(events):
        kind, f = e['kind'], float(e['f'])
        t = f / fps
        w = float(e.get('weight', 1.0))
        pan = float(e.get('pan', 0.0))
        if kind not in WIDE_KINDS:
            pan = SFX_PAN * float(np.clip(pan / 0.8, -1, 1))
        seed = 7919 * i + int(f * 10)
        ch = song.chord_at(t + 1e-3)
        pcs = ch.pcs if ch else song.scale
        pitch = S.midi(e['pitch']) if 'pitch' in e else None
        dur = float(e['dur']) / fps if 'dur' in e else None
        g = BASE.get(kind, 0) * w
        start = t
        x = None
        m = None  # the MIDI note the sound is tuned to, for the report
        if kind not in BASE:
            skipped.append(dict(i=i, f=f, kind=kind, why='unknown kind'))
            continue
        if in_silence(song, t, 'all') and kind != 'suck':
            song.warnings.append(f'{kind} at f={f} falls inside a silence and is muted')
        if kind == 'tick' and e.get('variant') == 'crisp':  # counters locking, list rows, build ticks
            x = S.crisp_tick(seed, 0.05, S.mtof(pitch) if pitch else None)
            m, g = pitch, BASE['crisp'] * w
            S.place(crisp, x, start, g, pan)
            placed.append(dict(i=i, f=f, kind=kind, variant='crisp', id=e.get('id', ''), t=t, start=start, x=x, g=g, pan=pan, midi=m))
            continue
        if kind == 'tick':
            m = pitch or song.sig_tick
            x = S.tick(S.mtof(m), 0.08, 0.010, 0.8, seed)
        elif kind == 'tock':
            m = pitch or song.sig_tock
            x = S.tick(S.mtof(m), 0.08, 0.011, 0.8, seed, True) * 0.95 + S.tock(S.mtof(m) / 4, 0.08, 0.02, 0.05, seed) * 0.2
        elif kind == 'hit':
            r = song.sub_root(t)
            m = S.ftom(r)
            x = S.sub_boom(r * 2, r, 0.1, 1.6, seed)
            x = S.layer_in(x, S.clap(seed=seed), 0.6)
            x = S.layer_in(x, S.filt(S.noise(0.5, seed + 1), S.bp(200, 3000)) * S.expdec(0.5, 0.1), 0.35)
            S.place(hall, S.filt(x, S.hp(250)), t, g * 0.4, pan)
            ducks.append((t, w))
        elif kind == 'land':
            heavy = w >= 0.6 and e.get('variant') != 'light'
            if heavy:
                if last_heavy is not None and abs(f - last_heavy) < 1:
                    skipped.append(dict(i=i, f=f, kind=kind, why='second heavy landing on one frame'))
                    continue
                last_heavy = f
                r = song.sub_root(t)
                m = S.ftom(r)
                knock = S.tock(650 + 150 * S.rng(seed).random(), 0.2, 0.05, 1.0, seed)
                x = S.layer_in(S.sub_boom(r * 2, r, 0.08, 1.0, seed) * 0.55, knock)
                ducks.append((t, w * 0.6))
            else:
                key = id(ch)
                k = lights.get(key, 0)
                lights[key] = k + 1
                ladder = stack(pcs, 84, 4)
                m = pitch or ladder[k % len(ladder)]
                x = S.tock(S.mtof(m), 0.12, 0.028, 0.35, seed)
                g = BASE['land_light'] * min(2.0, w / 0.5)  # a light landing's reference weight is 0.5
        elif kind == 'pop':
            pop_run = pop_run + 1 if t - last_pop < 1.0 else 0  # a run of pops climbs the pentatonic
            last_pop = t
            ladder = [m for m in range(81, 99) if m % 12 in song.penta]  # rings on the note: ~0.9-2.3 kHz
            target = S.nearest([p for p in song.penta if p in pcs] or song.penta, 86)
            base = int(np.argmin([abs(m - target) for m in ladder]))
            m = pitch or ladder[min(len(ladder) - 1, base + pop_run)]
            x = S.blip(S.mtof(m), e.get('variant') != 'down')
        elif kind == 'whoosh':
            d = float(np.clip(dur or (0.45 + 0.35 * w), 0.15, 3.0))
            apex = float(e.get('apexFrac', 0.5))
            x = S.whoosh(d, 120, 500 + 250 * min(w, 1.6), 220, apex, pan, 0.025, seed)  # dull: centroid ~550 Hz
            start = t - apex * d
            pan = 0.0
        elif kind == 'suck':
            d = dur or 0.35
            apex = float(e.get('apexFrac', 0.85))
            x = S.whoosh(d, 2500, 900, 200, apex, 0.0, 0.04, seed)  # synth.suck() with a movable apex
            start = t - apex * d
        elif kind == 'riser':
            d = dur or song.barlen
            m = pitch or S.nearest([ch.root if ch else song.tonic], 67)
            x = S.riser(d, 220, 7000, S.mtof(m), seed)
            start = t - d
        elif kind == 'drop':
            r = song.sub_root(t)
            m = S.ftom(r)
            x = S.stereo(S.sub_boom(r * 2, r, 0.12, 2.4, seed, tau=0.75))
            x = S.layer_in(x, S.whoosh(0.4, 3000, 400, 150, 0.1, 0.0, 0.05, seed + 3), 0.4)  # falling air
            S.place(hall, S.filt(x, S.hp(250)), t, g * 0.3, pan)
            ducks.append((t, w))
        elif kind == 'key':
            if i not in plan:
                skipped.append(dict(i=i, f=f, kind=kind, why=thinned.get(i, 'thinned')))
                continue
            k = plan[i]  # plan_typing(): style, thinning, word dynamics, jitter, bottom-out, density
            if k['style'] == 'word':
                x = S.word_blip(k['note'], 0.048) * k['level']
            else:
                x = S.key_click(k['seed'], k['pitch'], None, k['style'], k['kind'], k['strike'], k['level'], k['keyup'],
                                k['note'], k['tau'], k['second'], k['second_db'])
                # level by what is heard (6 ms RMS), not by the peak: every key, space and return then
                # sits exactly where plan_typing put it, whatever its timbre
                w6 = max(1, S.ns(0.006))
                x *= k['level'] * KEY_RMS_REF[k['style']] / (np.sqrt(np.convolve(x ** 2, np.ones(w6) / w6, 'same')).max() + 1e-12)
            g = BASE['key'] * w * k['gain']  # render() then levels the run against the music (weight 1 = the norm)
            start = k['t']
            pan = float(np.clip(k['pan'], -SFX_PAN, SFX_PAN))
            m = k['midi']
        elif kind == 'click':  # press + release; variant "confirm" adds a soft tuned tone (meaningful actions only)
            m = pitch or S.nearest(song.penta, 95)  # one tone near 2 kHz for the film
            tone = S.mtof(S.nearest([q for q in song.penta if q in pcs] or song.penta, 81)) if e.get('variant') == 'confirm' else None
            r = S.rng(seed)
            x = S.ui_click(S.mtof(m), 0.14, click_seed, click_gap + 0.004 * r.standard_normal(), tone, seed)
            g = BASE['click'] * click_w * 10 ** (float(np.clip(r.normal(0, 0.25), -0.5, 0.5)) / 20)
            S.place(clicks, x, start, g, pan)
            placed.append(dict(i=i, f=f, kind=kind, id=e.get('id', ''), t=t, start=start, x=x, g=g, pan=pan, midi=m))
            continue
        elif kind == 'snap':
            m = S.ftom(song.sub_root(t))
            x = S.snap(S.mtof(m), 0.6, 1.0, seed)
            ducks.append((t, w * 0.7))
        elif kind == 'swell':
            d = dur or beat
            notes = stack(pcs, 60, 3) if not pitch else [pitch]
            m = notes[0]
            x = S.swell([S.mtof(q) for q in notes], d, seed)
            start = t - d
        elif kind == 'bell':
            if e.get('variant') == 'motif':
                for k, (m, r) in enumerate(zip(song.motif, song.rhythm)):
                    y = S.fm_bell(S.mtof(m), 3.0, 1.4, 3.5, 1.3)
                    S.place(fx, y, t + r * beat, g * (1.2 - 0.15 * k) * 1.25, pan)
                    placed.append(dict(i=i, f=f, kind=kind, t=t, x=y, g=g, pan=pan))
                continue
            m = pitch or S.nearest(pcs, 80)
            x = S.fm_bell(S.mtof(m), 2.5, 1.6, 3.5, 1.0)
        if x is None:
            continue
        if x.ndim == 2 and pan:
            x = balance(x, pan)
            pan = 0.0
        S.place(keys if kind == 'key' else ui if kind in UI_KINDS else fx, x, start, g, pan)
        placed.append(dict(i=i, f=f, kind=kind, id=e.get('id', ''), t=t, start=start, x=x, g=g, pan=pan, midi=m))
    return dict(fx=fx, hall=hall, ui=ui, keys=keys, clicks=clicks, crisp=crisp), placed, skipped, ducks


# ------------------------------------------------------------------------------------------
# mix
# ------------------------------------------------------------------------------------------
def smooth_env(points, n, tau=0.02):
    t = np.arange(n) / SR
    ts, gs = zip(*sorted(points))
    g = np.interp(t, ts, gs)
    return S.filt(g, S.lp(1 / (2 * np.pi * tau), 1))


OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000]
A_WEIGHT_DB = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1]


def band_snr(evt, bus):
    """How far an effect stands above the music in its own band: per octave band, event energy
    over music energy; the result is the best band among those holding >= 15% of the event's
    A-weighted energy (a landing is heard by its knock, not its sub). Returns (band_hz, snr_db)."""
    if len(evt) < 256:
        return None
    w = np.hanning(len(evt))
    A = np.abs(np.fft.rfft(evt.mean(axis=1) * w)) ** 2
    B = np.abs(np.fft.rfft(bus.mean(axis=1) * w)) ** 2
    fr = np.fft.rfftfreq(len(evt), 1 / SR)
    bands = [(fr >= c / np.sqrt(2)) & (fr < c * np.sqrt(2)) for c in OCTAVES]
    heard = np.array([A[b].sum() * 10 ** (wd / 10) for b, wd in zip(bands, A_WEIGHT_DB)])
    tot = heard.sum() + 1e-20
    best = None
    for c, band, h in zip(OCTAVES, bands, heard):
        ea = A[band].sum()
        if h / tot < 0.15:
            continue
        snr = 10 * np.log10((ea + 1e-20) / (B[band].sum() + 1e-20))
        if best is None or snr > best[1]:
            best = (c, snr)
    return best


def _a_weight(fr):
    """A-weighting as a power gain per frequency (Hz)."""
    fr = np.maximum(fr, 1e-3)
    ra = (12194 ** 2 * fr ** 4) / ((fr ** 2 + 20.6 ** 2) * np.sqrt((fr ** 2 + 107.7 ** 2) * (fr ** 2 + 737.9 ** 2)) * (fr ** 2 + 12194 ** 2))
    return (ra * 1.2589) ** 2


def short_vs_music(sig, music, t, win=0.006, mwin=0.25):
    """An effect against the music the way the norms measure it: the effect's 6 ms RMS at its
    loudest (within 2 ms before to 20 ms after t) minus the music's 250 ms RMS centred on t, in dB.
    sig and music are mono. Returns (dB, effect RMS) or (None, rms) when there is no music there."""
    i = int(round(t * SR))
    a, b = max(0, i - int(0.002 * SR)), min(len(sig), i + int(0.02 * SR))
    if b - a < 8:
        return None, 0.0
    k = max(1, int(win * SR))
    e = np.sqrt(np.maximum(np.convolve(sig[a:b] ** 2, np.ones(k) / k, mode='same'), 0))
    h = int(mwin * SR / 2)
    mu = float(np.sqrt(np.mean(music[max(0, i - h):i + h] ** 2))) if i < len(music) else 0.0
    peak = float(e.max())
    if mu < 1e-4 or peak <= 0:  # no music under it (or nothing sounded): nothing to level against
        return None, peak
    return 20 * np.log10(peak / mu), peak


def level_bus(bus, times, music, target_db, spans=None):
    """Scale an effect bus so the median of its events' short_vs_music sits on target_db (clamped
    to +-LEVEL_CLAMP_DB). spans: [(i0, i1, times)] levels each span on its own (typing runs);
    otherwise one gain for the whole bus (one voice, one level per film). Returns the gains in dB,
    one per span (or one), None where no music sits under the events."""
    sig = bus.mean(axis=1)
    out = []
    for i0, i1, ts in (spans or [(0, len(bus), times)]):
        d = [v for v in (short_vs_music(sig, music, t)[0] for t in ts) if v is not None]
        if not d:
            out.append(None)
            continue
        g = float(np.clip(target_db - np.median(d), -LEVEL_CLAMP_DB, LEVEL_CLAMP_DB))
        bus[i0:i1] *= 10 ** (g / 20)
        out.append(round(g, 1))
    return out


def typing_duck(song, plan, runs, n):
    """Typing in the foreground gets room: the music bus gain dips mix.typing_duck_db (default 10 dB)
    under every run of 3+ keys sounded per key (soft, mechanical, pitched), down over the 30 ms before
    its first key and back up over 250 ms after its last. muted, word and off runs leave the music alone."""
    g = np.ones(n)
    db = song.mix['typing_duck_db']
    for r in runs:
        r['duck_db'] = 0.0
        ts = sorted(plan[i]['t'] for i in r['idx'] if i in plan and plan[i]['style'] in PER_KEY)
        if len(ts) < 3 or db <= 0:  # a lone key or two (an Enter, a shortcut) leaves the music alone
            continue
        a, b = ts[0], ts[-1] + 0.03
        i0, i1 = max(0, int((a - 0.03) * SR)), min(n, int((b + 0.25) * SR))
        u = np.arange(i0, i1) / SR
        shape = np.where(u < a, 0.5 - 0.5 * np.cos(np.pi * np.clip((u - a + 0.03) / 0.03, 0, 1)),
                         np.where(u <= b, 1.0, 0.5 + 0.5 * np.cos(np.pi * np.clip((u - b) / 0.25, 0, 1))))
        g[i0:i1] = np.minimum(g[i0:i1], 1 - (1 - 10 ** (-db / 20)) * shape)
        r['duck_db'] = db
    return g


def typing_levels(runs, plan, keys_sig, music_sig):
    """Each typing run of 4+ sounded keys (2+ word blips) against the music under it, both
    pre-master and the music already ducked: the A-weighted level difference over the run, the
    keys' short-window level against the music (6 ms vs 250 ms RMS, median), the 2-5 and 5-10 kHz
    band differences, the typing's 2-5 kHz share of its own A-weighted energy, and the bed's share
    above 2 kHz. Targets, from measured norms: per key (soft, mechanical, pitched) the run sits -8
    to -2 dB A under the ducked music with the keys about at the music's short-window RMS; word
    blips +2 to +9 dB over it; muted typing 8 dB A or more under the full bed. Returns (rows, warnings)."""
    rows, warns = [], []
    km, mm = keys_sig.mean(axis=1), music_sig.mean(axis=1)
    for r in runs:
        sounded = [plan[i]['t'] for i in r['idx'] if i in plan]
        if r['sounded'] < (2 if r['style'] == 'word' else 4) or not sounded:
            continue
        i0, i1 = int(r['t0'] * SR), min(len(mm), int((r['t1'] + 0.1) * SR))
        if i1 - i0 < 1024:
            continue
        k, mu = km[i0:i1], mm[i0:i1]
        K, Mu = np.abs(np.fft.rfft(k)) ** 2, np.abs(np.fft.rfft(mu)) ** 2
        fr = np.fft.rfftfreq(len(k), 1 / SR)
        aw = _a_weight(fr)
        db = lambda a, b: round(float(10 * np.log10((a + 1e-20) / (b + 1e-20))), 1)
        band = lambda X, lo, hi: X[(fr >= lo) & (fr < hi)].sum()
        sv = [v for v in (short_vs_music(km, mm, t)[0] for t in sounded) if v is not None]
        row = dict(t=[round(r['t0'], 2), round(r['t1'], 2)], style=r['style'], chars_per_s=round(r['chars_per_s'], 1),
                   keys=r['keys'], sounded=r['sounded'], rate_max=round(r['rate_max'], 1), duck_db=r.get('duck_db', 0.0),
                   level_db=r.get('level_db'), vs_music_A_db=db((K * aw).sum(), (Mu * aw).sum()),
                   key_vs_music_db=round(float(np.median(sv)), 1) if sv else None,
                   band_2k_5k_db=db(band(K, 2000, 5000), band(Mu, 2000, 5000)),
                   band_5k_10k_db=db(band(K, 5000, 10000), band(Mu, 5000, 10000)),
                   share_2k_5k_A_pct=round(float(100 * band(K * aw, 2000, 5000) / ((K * aw).sum() + 1e-20)), 1),
                   bed_top_A_pct=round(float(100 * band(Mu * aw, 2000, 10000) / ((Mu * aw).sum() + 1e-20)), 1))
        rows.append(row)
        where = f'typing at {row["t"][0]}-{row["t"][1]}s ({r["style"]}, {row["chars_per_s"]:.0f} chars/s)'
        if r['style'] != 'word' and r['chars_per_s'] > AUTO_WORD_RATE:  # any per-key style, muted included
            warns.append(f'{where} sounds per key above {AUTO_WORD_RATE:.0f} chars/s; measured films sound typing that fast '
                         'once per word or not at all: "typing": "auto", "word" or "off"')
        if np.sqrt(np.mean(mu ** 2)) < 1e-3:
            row['note'] = 'no music under this run'
            continue
        if r['style'] in PER_KEY:
            if row['vs_music_A_db'] > -1:
                warns.append(f'{where} sits {row["vs_music_A_db"]:+.0f} dB A against the ducked music (want about -8 to -2): '
                             'lower the key weights')
            elif row['vs_music_A_db'] < -10:
                warns.append(f'{where} sits {-row["vs_music_A_db"]:.0f} dB A under the ducked music (want about 2-8): the music is '
                             'too dense to level against; raise mix.typing_duck_db, thin the section, or "muted"')
        elif r['style'] == 'muted' and row['vs_music_A_db'] > -8:
            warns.append(f'{where} sits only {-row["vs_music_A_db"]:.0f} dB A under the music (muted typing is background, '
                         '8 dB A or more under): lower the key weights')
        elif r['style'] == 'word' and row['key_vs_music_db'] is not None and not 0 <= row['key_vs_music_db'] <= 11:
            warns.append(f'{where}: the word blips sit {row["key_vs_music_db"]:+.0f} dB against the music (want +2 to +9)')
        if r['style'] != 'word' and row['share_2k_5k_A_pct'] > 25:
            warns.append(f'{where} is bright: {row["share_2k_5k_A_pct"]:.0f}% of its A-weighted energy in 2-5 kHz (want 25% '
                         'or less; a key is a dark tock): use "soft" or "muted"')
    return rows, warns


def load_bed(song, n, base_dir):
    """The supplied track (score.json "bed"), resampled to 48 kHz stereo and placed at its time."""
    import soundfile as sf
    from math import gcd
    tries = [song.bed['file'], os.path.join(base_dir, song.bed['file'])]
    path = next((p for p in tries if os.path.exists(p)), None)
    if path is None:
        raise ScoreError(f'bed file not found: {song.bed["file"]} (looked in the working directory and next to score.json)')
    x, sr = sf.read(path, always_2d=True, dtype='float64')
    x = np.repeat(x, 2, axis=1) if x.shape[1] == 1 else x[:, :2]
    if sr != SR:
        from scipy import signal
        g = gcd(SR, sr)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0)
    out = np.zeros((n, 2))
    S.place(out, x, song.bed['at'], 10 ** (song.bed['gain_db'] / 20), tail=0.05)
    return out


def render(song, events, stems_dir=None, base_dir='.'):
    n_out = int(round(song.dur * SR))
    n = n_out + 4 * SR
    plan, thinned, runs = plan_typing(song, events)
    stems, kicks = build_music(song, n, events, plan)
    if song.bed:
        stems['bed'] = load_bed(song, n, base_dir)
    B, placed, skipped, ducks = build_sfx(song, n, events, plan, thinned)
    fx, hall, ui, keys = B['fx'], B['hall'], B['ui'], B['keys']
    t = np.arange(n) / SR

    sc = M.sidechain_times(kicks + [(tt_, 0.8 * w) for tt_, w in ducks], n, song.mix['sidechain'], 0.14)
    send = S.filt(stems['pad'] * 0.25 + stems['arp'] * 0.35 + stems['bells'] * 0.6 + stems['drums'] * 0.06, S.hp(250, 2))
    parts = dict(drums=stems['drums'] * 0.8, bass=stems['bass'] * sc * 0.55, pad=stems['pad'] * (0.55 + 0.45 * sc) * 1.6,
                 arp=stems['arp'] * (0.7 + 0.3 * sc) * 1.7, bells=stems['bells'] * 1.5,
                 reverb=S.reverb(send, 'hall') * 0.6 * song.mix['reverb'])
    if 'bed' in stems:
        parts['bed'] = stems['bed']
    music = sum(parts.values())

    # music bus: section levels, a 3 dB dip for 150 ms around key hits, a 10 dB dip under typing
    # sounded per key, the suck before drops
    pts = [(0.0, 1.0)]
    for sec in song.sections:
        a, b = song.bar_t(sec['b0']), song.bar_t(sec['b1'] + 1)
        pts += [(a + 1e-3, sec['level']), (b - 1e-3, sec['level'])]
    pts.append((n / SR, pts[-1][1]))
    bus = smooth_env(pts, n, 0.03)
    dip = 1 - 10 ** (-song.mix['duck_db'] / 20)
    for tt_, w in ducks:
        seg = (t >= tt_ - 0.01) & (t < tt_ + 0.4)
        u = t[seg] - tt_
        shape = np.where(u < 0, (u + 0.01) / 0.01, np.where(u < 0.15, 1.0, np.exp(-(u - 0.15) / 0.08)))
        bus[seg] *= 1 - dip * min(1.0, w) * shape
    bus *= typing_duck(song, plan, runs, n)
    for a, b, depth in song.sucks:
        w_ = (t > a) & (t < b)
        bus[w_] = np.minimum(bus[w_], 1 - depth * np.clip((t[w_] - a) / 0.04, 0, 1))
    # the end fade: music AND effects (with their reverb) reach digital zero 30 ms before the end,
    # so nothing is still sounding when master.py's last 60 ms fade and zeroed samples arrive
    fade = np.clip((song.dur - 0.03 - t) / song.fade, 0, 1) ** 2
    hold = {'all': np.ones(n), 'music': np.ones(n)}
    for a, b, depth, scope in song.silences:
        w_ = (t > a - 0.04) & (t < b)
        h = hold[scope]
        h[w_] = np.minimum(h[w_], 1 - depth * np.clip((t[w_] - (a - 0.04)) / 0.04, 0, 1))
        r_ = (t >= b) & (t < b + 0.008)  # open again over 8 ms, so tails that resume at the silence's end don't click
        h[r_] = np.minimum(h[r_], 1 - depth * (0.5 + 0.5 * np.cos(np.pi * (t[r_] - b) / 0.008)))
    music_gain = bus * fade * song.mix['music'] * hold['music'] * hold['all']
    music_bus = music * (bus * fade * song.mix['music'] * hold['music'])[:, None]

    # levels against the music as heard (measured norms: 6 ms effect RMS vs 250 ms music RMS): each
    # typing run on its own, and one gain per film for the click and for the crisp tick
    heard = (music_bus * hold['all'][:, None]).mean(axis=1)
    ref = heard / 1.25  # the dry effects go out at 1.25x (below); mix.sfx stays a trim on top of the levelling
    spans, owners = [], []
    for r in runs:
        ts = sorted(plan[i]['t'] for i in r['idx'] if i in plan)
        if ts:
            spans.append((max(0, int((ts[0] - 0.02) * SR)), min(n, int((ts[-1] + 0.3) * SR)), ts))
            owners.append(r)
    wdb = lambda ws: 20 * math.log10(max(0.05, float(np.median(ws)))) if ws else 0.0  # a weight shifts the target
    for r, (i0, i1, ts) in zip(owners, spans):
        target = LEVEL_VS_MUSIC.get(r['style'], LEVEL_VS_MUSIC['key'])
        target += wdb([float(events[i].get('weight', 1.0)) for i in r['idx'] if i in plan])
        r['level_db'] = level_bus(keys, None, ref, target, [(i0, i1, ts)])[0]
    sfx_levels = {}
    for name, bus_, sel in (('click', B['clicks'], lambda p: p['kind'] == 'click'),
                            ('crisp', B['crisp'], lambda p: p.get('variant') == 'crisp')):
        ps = [p for p in placed if sel(p)]
        if not ps:
            continue
        target = LEVEL_VS_MUSIC[name] + wdb([float(events[p['i']].get('weight', 1.0)) for p in ps])
        g_db = level_bus(bus_, [p['start'] for p in ps], ref, target)[0]
        for p in ps:
            p['g'] *= 10 ** ((g_db or 0.0) / 20)
        sig = bus_.mean(axis=1) * 1.25 * song.mix['sfx']
        sv = [v for v in (short_vs_music(sig, heard, p['start'])[0] for p in ps) if v is not None]
        sfx_levels[name] = dict(count=len(ps), level_db=g_db, vs_music_db=round(float(np.median(sv)), 1) if sv else None,
                                target_db=round(target, 1))
        if sv and abs(np.median(sv) - target - 20 * math.log10(max(song.mix['sfx'], 1e-3))) > 2:
            song.warnings.append(f'{name}: {len(ps)} at {np.median(sv):+.1f} dB against the music, target {target:+g} (the levelling '
                                 f'stops {LEVEL_CLAMP_DB:g} dB from the static level): the music under them is unusually loud or quiet; check '
                                 'that section\'s level, or their weights')

    fx_low = S.filt(fx, S.lp(90, 2))
    fx_dry = S.filt(fx - fx_low * 0.45, S.hp(24, 2)) * 1.25 * song.mix['sfx']
    fxs = S.filt(fx, S.hp(250, 2))
    fx_wet = (S.reverb(fxs * 0.18, 'room') + S.reverb(fxs * 0.08 + hall, 'hall')) * song.mix['sfx']
    # keys, clicks and crisp ticks dry; the clock's tick and tock plus a small room (0.3 s) sent at
    # -22 dB and high-passed at 350 Hz
    dry = ui + keys + B['clicks'] + B['crisp']
    ui_dry = S.filt(dry, S.hp(24, 2)) * 1.25 * song.mix['sfx']
    ui_wet = S.reverb(S.filt(ui, S.hp(350, 2)) * 0.08, 'small') * song.mix['sfx']
    fx_dry = (fx_dry + ui_dry) * fade[:, None]
    fx_wet = (fx_wet + ui_wet) * fade[:, None]
    keys_dry = S.filt(keys, S.hp(24, 2)) * 1.25 * song.mix['sfx'] * fade[:, None]  # for the typing report
    seen = set()
    for p in placed:  # an effect that starts inside the fade is mostly lost: say so
        g_ = float(np.clip((song.dur - 0.03 - p['t']) / song.fade, 0, 1) ** 2)
        if g_ < 0.5 and (p['kind'], p['f']) not in seen:
            seen.add((p['kind'], p['f']))
            song.warnings.append(f"{p['kind']} {p.get('id', '')} at f={p['f']:g} starts inside the end fade "
                                 f"({20 * np.log10(g_ + 1e-9):.0f} dB): move it at least "
                                 f"{int(np.ceil((song.fade + 0.03) * song.fps))} f before the end or shorten master.fade")

    mix = (music_bus + fx_dry + fx_wet) * hold['all'][:, None]
    mix = mix[:n_out]

    y, info = M.finish(mix, song.lufs, song.ceiling, fade=0)

    # report: masking per event, payoff dynamics
    mb = (music_bus * hold['all'][:, None])[:n_out]
    trows, twarn = typing_levels(runs, plan, (keys_dry * hold['all'][:, None])[:n_out], mb)
    song.warnings.extend(twarn)
    styles = sorted({r['style'] for r in runs})
    typing = dict(style=song.typing, styles=styles, keys=sum(1 for e in events if e['kind'] == 'key'), sounded=len(plan),
                  thinned=len(thinned), duck_db=song.mix['typing_duck_db'], runs=trows)
    masked = []
    for p in placed:
        if p['kind'] in ('key', 'drop') or 'start' not in p:
            continue  # typing is judged as a texture; a drop IS the music's downbeat
        x = S.stereo(p['x']) * p['g'] * 1.25 * song.mix['sfx']
        k = p['kind']
        if k in ('whoosh', 'suck'):
            i0, i1 = int((p['t'] - 0.06) * SR), int((p['t'] + 0.06) * SR)
        elif k in ('riser', 'swell'):
            i0, i1 = int((p['t'] - 0.15) * SR), int(p['t'] * SR)
        else:  # clicks are heard in their first 20 ms, knocks in 30 ms, booms over 60 ms
            win = 0.06 if k in ('hit', 'drop') else 0.03 if k in ('snap', 'land', 'bell') else 0.02
            i0, i1 = int(p['t'] * SR), int((p['t'] + win) * SR)
        i0, i1 = max(0, i0), min(n_out, i1)
        seg, s0 = np.zeros((max(0, i1 - i0), 2)), int(round(p['start'] * SR))
        lo, hi = max(i0, s0), min(i1, s0 + len(x))
        if hi > lo:
            seg[lo - i0:hi - i0] = x[lo - s0:hi - s0]
        r = band_snr(seg, mb[i0:i1])
        if r is not None:
            p['snr'] = (r[0], round(r[1], 1))
            if r[1] < (0 if p.get('variant') == 'crisp' else 6):  # a crisp tick sits just over the bed by design
                masked.append(dict(f=p['f'], kind=p['kind'], id=p.get('id', ''), band_hz=r[0], snr_db=round(r[1], 1)))
    if stems_dir:
        import soundfile as sf
        os.makedirs(stems_dir, exist_ok=True)
        # stems sum exactly to the pre-master mix: each music part carries the bus automation
        for k, v in parts.items():
            sf.write(os.path.join(stems_dir, f'{k}.wav'), (v * music_gain[:, None])[:n_out].astype(np.float32), SR)
        sf.write(os.path.join(stems_dir, 'sfx.wav'), ((fx_dry + fx_wet) * hold['all'][:, None])[:n_out].astype(np.float32), SR)
        stale = os.path.join(stems_dir, 'music.wav')
        if os.path.exists(stale):
            os.remove(stale)  # an older layout; it would double-count in tools that sum the stems
    def fits(p):  # in the key, or a tone of the chord sounding at that moment (a V7's leading tone)
        ch = song.chord_at(p['t'] + 1e-3)
        pc = int(round(p['midi'])) % 12
        return pc in song.scale or (ch is not None and pc in ch.pcs)

    tuned = [dict(f=p['f'], kind=p['kind'], id=p.get('id', ''), note=note_name(p['midi']), in_key=fits(p))
             for p in placed if p.get('midi') is not None]
    return y, info, dict(placed=placed, skipped=skipped, masked=masked, tuned=tuned, typing=typing, sfx_levels=sfx_levels)


def main(argv=None):
    ap = argparse.ArgumentParser(description='Render the soundtrack from score.json + cues.json, mixed and mastered.')
    ap.add_argument('--cues', default='out/cues.json')
    ap.add_argument('--score', default='audio/score.json')
    ap.add_argument('--out', default='public/audio/soundtrack.wav')
    ap.add_argument('--stems', metavar='DIR', help='also write stems here; they sum to the pre-master mix')
    ap.add_argument('--json', metavar='PATH', help='write the report JSON here')
    ap.add_argument('--lufs', type=float, help='target LUFS; overrides master.lufs from score.json (default -14)')
    ap.add_argument('--ceiling', type=float, help='override master.ceiling (linear)')
    ap.add_argument('--max-tp', type=float, default=-1.5, help='gate: max true peak dBTP (default -1.5)')
    ap.add_argument('--tol', type=float, default=0.5, help='gate: LUFS tolerance (default 0.5)')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args(argv)
    try:
        cues = json.load(open(a.cues))
        score = json.load(open(a.score))
        song = Song(score, cues)
        if a.lufs is not None:
            song.lufs = a.lufs
        if a.ceiling is not None:
            song.ceiling = a.ceiling
        events = sorted(cues.get('events', []), key=lambda e: e['f'])
        progress = apply_progress(song, events) if song.progress else None
        y, info, ev = render(song, events, a.stems, os.path.dirname(os.path.abspath(a.score)))
        import soundfile as sf
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        sf.write(a.out, y.astype(np.float32), SR, subtype='PCM_24')
    except (ScoreError, KeyError, ValueError, FileNotFoundError, json.JSONDecodeError) as e:
        print(f'score.py: {type(e).__name__}: {e}', file=sys.stderr)
        return 1

    rep = M.measure(y)
    lim = info['limiter_gr_db']
    rep['limiter_max_gr_db'] = round(float(lim.max()), 2)
    hot, i = [], 0
    step = int(0.25 * SR)
    for i in range(0, len(lim), step):
        v = float(lim[i:i + step].max())
        if v > 1.5:
            hot.append(dict(t=round((i + int(np.argmax(lim[i:i + step]))) / SR, 3), gr_db=round(v, 2)))
    rep['limiter_hot'] = hot
    if hot:
        song.warnings.append('limiter over 1.5 dB at ' + ', '.join(f"{h['t']}s ({h['gr_db']} dB)" for h in hot[:6])
                             + ': lower the effect or music that peaks there')
    if song.payoff is not None:
        tm, mom = M.blocks(y, 0.4, 0.1)
        win = (tm >= song.payoff - 0.2) & (tm <= song.payoff + 1.0)
        i0, i1 = int(song.payoff * SR), int((song.payoff + 1.0) * SR)
        rep['payoff'] = dict(t=round(song.payoff, 3), momentary_max=round(float(mom[win].max()), 2) if win.any() else None,
                             limiter_gr_db=round(float(lim[i0:i1].max()), 2) if i1 > i0 else None)
        if win.any() and mom[win].max() < rep['momentary_max'] - 0.5:
            song.warnings.append(f'the payoff ({song.payoff:.2f}s) is not the loudest moment: '
                                 f'{mom[win].max():.1f} vs {rep["momentary_max"]} LUFS-M at {rep["momentary_max_t"]}s')
        if rep['payoff']['limiter_gr_db'] and rep['payoff']['limiter_gr_db'] > 1.5:
            song.warnings.append(f'limiter takes {rep["payoff"]["limiter_gr_db"]} dB off the payoff (keep it under 1.5)')
        # contrast: the payoff should stand clearly above the film's typical level, not just edge it
        audible = mom[mom > -70]
        if win.any() and len(audible):
            lift = float(mom[win].max() - np.median(audible))
            rep['payoff']['over_median_lu'] = round(lift, 2)
            if lift < 2.0:
                song.warnings.append(f'the payoff is only {lift:.1f} LU over the median momentary loudness (want 2-3+): '
                                     'thin the bars before it, leave true silence before the drop, give the hit more body')
    # the hook: the first half second is heard at intent, not faded in from nothing
    tm, mom = M.blocks(y, 0.4, 0.1)
    audible = mom[mom > -70]
    head = mom[tm <= 0.45]  # 0.4 s blocks inside the first ~0.65 s
    if len(audible) and len(head):
        med, opening = float(np.median(audible)), float(head.max())
        rep['hook'] = dict(opening_lufs_m=round(opening, 2), median_lufs_m=round(med, 2), below_median_db=round(med - opening, 2))
        if med - opening > 12:
            song.warnings.append(f'soft hook: the first 0.5 s sits {med - opening:.0f} dB under the median momentary loudness '
                                 f'({opening:.1f} vs {med:.1f} LUFS-M; an intro runs 5-12 LU under the body): enter with '
                                 'intent on frame 0 (a drone, a chord, the device\'s tick, at most a 150-450 ms entry; no slow '
                                 'swell or riser into the opening)')
    # the arc: measured films peak at the drop or hero reveal (30-60% of the runtime); the lockup is
    # the most resolved moment, not the loudest. A sting (8 s or less) is all lockup: exempt.
    if song.dur > 8 and rep.get('momentary_max_t') is not None:
        frac = rep['momentary_max_t'] / song.dur
        rep['loudest_frac'] = round(frac, 2)
        if frac > 0.8:
            song.warnings.append(f'the loudest moment is at {frac * 100:.0f}% of the film ({rep["momentary_max_t"]}s): the ending '
                                 'should subtract, not slam. Peak on the drop or hero reveal (30-60%) and point "payoff" '
                                 'there; stop or filter the music as the logo forms, then one soft resolved element')
    # the end: the effects follow the music's fade, so the last 50 ms are close to silence
    if rep.get('tail_50ms_db') is not None and rep['tail_50ms_db'] > -45:
        song.warnings.append(f'the ending is not silent: the last 50 ms measure {rep["tail_50ms_db"]} dB (want under -45)')
    # dynamics: a launch film of 20 s or more wants real contrast (sections that thin out, a silence, a drop)
    if song.dur >= 20 and rep.get('lra') is not None and rep['lra'] < 5:
        song.warnings.append(f'LRA {rep["lra"]} LU is flat for a {song.dur:.0f}s film (want 5-8): thin the section before the '
                             'turn, cut to silence before the drop, hold the bed back until the payoff')
    off = [x for x in ev['tuned'] if not x['in_key']]
    if off:
        song.warnings.append('out of key: ' + ', '.join(f"{x['kind']} {x['note']} at f={x['f']}" for x in off))
    by = {}
    for e in events:
        by[e['kind']] = by.get(e['kind'], 0) + 1
    fails = M.gate(rep, song.lufs, a.tol, a.max_tp)
    rep.update(out=a.out, bpm=song.bpm, key=f'{S_note(song.tonic)} {song.mode}', bars=song.nbars,
               events=dict(count=len(events), by_kind=by, skipped=ev['skipped'], masked=ev['masked'], tuned=ev['tuned']),
               chords=[dict(t=round(a_, 3), chord=c.name if c else 'N.C.') for a_, _, c in song.segs if a_ < song.dur],
               warnings=song.warnings, fails=fails)
    if progress:
        rep['progress'] = progress
    if ev['typing']['keys']:
        rep['typing'] = ev['typing']
    if ev['sfx_levels']:
        rep['sfx_levels'] = ev['sfx_levels']
    rep['pass'] = not fails
    if a.json:
        os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
        json.dump(rep, open(a.json, 'w'), indent=1)
    if not a.quiet:
        print(f"{'PASS' if not fails else 'FAIL'}  {a.out}  {rep['seconds']}s  {rep['lufs']} LUFS  TP {rep['true_peak_db']} dBTP  "
              f"LRA {rep['lra']} LU  loudest {rep['momentary_max']} LUFS-M at {rep['momentary_max_t']}s  "
              f"events {len(events)} ({len(ev['skipped'])} skipped, {len(ev['masked'])} masked)")
        ty = ev['typing']
        if ty['keys']:
            worst = max((r['vs_music_A_db'] for r in ty['runs'] if 'note' not in r and r['style'] != 'word'), default=None)
            ducked = any(r['duck_db'] for r in ty['runs'])
            print(f"  typing: {ty['style']} ({', '.join(ty['styles'])}), {ty['sounded']}/{ty['keys']} keys sound"
                  + (f", music ducked {ty['duck_db']:g} dB under the keys" if ducked else '')
                  + (f", loudest run {worst:+.1f} dB A vs the music" if worst is not None else ''))
        for k_, v_ in ev['sfx_levels'].items():
            if v_['vs_music_db'] is not None:
                print(f"  {k_}: {v_['count']} at one level, {v_['vs_music_db']:+.1f} dB vs the music (6 ms vs 250 ms RMS; "
                      f"target {v_['target_db']:+g})")
        if progress and progress.get('events'):
            print(f"  progress: {progress['events']} rungs {progress['rungs'][0]['note']} -> {progress['rungs'][-1]['note']}"
                  + (f", resolves on {progress['resolve']['note']} at {progress['resolve']['t']}s" if 'resolve' in progress else ''))
        for w in song.warnings:
            print('  warning:', w)
        for m in ev['masked']:
            print(f"  masked: {m['kind']} {m['id']} at f={m['f']}: {m['snr_db']} dB over the music in its best band ({m['band_hz']} Hz)")
        for f_ in fails:
            print('  FAIL:', f_)
    return 0 if not fails else 1


NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def S_note(pc):
    return NAMES[pc]


def note_name(m):
    k = int(round(m))
    return NAMES[k % 12] + str(k // 12 - 1)


if __name__ == '__main__':
    sys.exit(main())
