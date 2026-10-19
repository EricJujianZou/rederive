#!/usr/bin/env python3
"""Build a film palette from one accent, check its contrast, or measure accent coverage on a still.

Neutrals come out tinted toward the accent's hue (or cool on request), for a light or a dark
stage, each with its OKLCH, hex and contrast against the stage, ready to paste into
src/brand/tokens.ts. The checks are the ones in references/brand-and-color.md:
  - the hard bans (SKILL.md, brand-and-color.md §8): an accent or paper that is orange/amber,
    beige/cream, purple/violet/indigo or neon is refused (exit 1, no palette) unless the user's
    brand supplied it (--brand-supplied; record it in BRIEF.md). The regions, in OKLCH:
      orange/amber  31 <= h < 96 and C >= 0.05 (orange, amber, gold, brass, brown, coral)
      beige/cream   31 <= h < 118, L >= 0.70 and 0.007 <= C < 0.10 (beige, cream, tan, sand)
      purple        270 <= h < 340 and C >= 0.02 (purple, violet, indigo, lavender, magenta)
      neon          C >= 0.27; or L >= 0.85 and C >= 0.15; or L >= 0.80 and C >= 0.18
                    (yellows, 96 <= h < 118: only L >= 0.91 with C >= 0.15)
  - statements (ink on the stage) >= 7:1; secondary text (mute) >= 4.5:1; graphics (accent) >= 3:1
  - accent chroma >= 0.08 (below that it reads as a grey, not a signal)
  - the accent's lightness band for the stage: 0.50-0.65 on a light stage, 0.70-0.82 on a dark
    one (a yellow, which only works on a dark stage: 0.84-0.90)

Usage:
  python3 scripts/palette.py --accent '#C92F33'                           # light stage, tinted to the accent
  python3 scripts/palette.py --accent 'oklch(0.86 0.165 100)' --stage dark  # dark stage, a yellow
  python3 scripts/palette.py --accent '#1F86CD' --temp cool --json out/qa/palette.json
  python3 scripts/palette.py --accent '#1F86CD' --paper '#F6F7F9'         # check your own paper
  python3 scripts/palette.py --accent '#F26B1D' --brand-supplied          # the user's orange: allowed
  python3 scripts/palette.py --cover out/stills/poster.png --accent '#C92F33'   # accent share of pixels

--temp: neutral (default) tints the greys with the accent's hue at a chroma too low to read as
warm; cool uses hue 250. warm (hue 75) makes a beige paper, so it needs --brand-supplied.
--stage-hue H [--stage-chroma C]: give the stage and the dark neutrals a hue from the brand's world
(pine-black 160, a green-black 145, a deep teal 200, an ink-navy with body 235) at chroma C
(default 0.014 on a dark stage, 0.008 on a light one); type and light panels stay near-neutral.
A stage hue in the purple range (270-340) is refused, and one in the warm range (31-118) is
warned about (it slides into brown or beige).
A dark stage in the cool blue-grey band (h 235-270, C < 0.02) gets a note: it is the stock
dev-tool dark theme and reads as "a screenshot of a tool" before anything moves.
Exit 0 when every check passes, 1 when one fails or a colour is refused, 2 on bad input.
"""
import argparse
import json
import math
import re
import sys


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin_to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def oklch_to_lin(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
            -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
            -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_)


def lin_to_oklch(r, g, b):
    l_ = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m_ = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s_ = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return L, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360


def in_gamut(lin):
    return all(-1e-4 <= v <= 1 + 1e-4 for v in lin)


def oklch_hex(L, C, h):
    """Hex for an OKLCH colour, reducing chroma until it fits sRGB. Returns (hex, C actually used)."""
    while C > 0 and not in_gamut(oklch_to_lin(L, C, h)):
        C = max(0.0, C - 0.002)
    rgb = [round(255 * lin_to_srgb(min(1.0, max(0.0, v)))) for v in oklch_to_lin(L, C, h)]
    return '#' + ''.join(f'{v:02X}' for v in rgb), C


def parse_colour(s):
    s = s.strip()
    m = re.fullmatch(r'#?([0-9a-fA-F]{6})', s)
    if m:
        x = m.group(1)
        return lin_to_oklch(*[srgb_to_lin(int(x[i:i + 2], 16) / 255) for i in (0, 2, 4)])
    m = re.fullmatch(r'oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)', s)
    if m:
        L = float(m.group(1)) / (100 if m.group(2) else 1)
        return L, float(m.group(3)), float(m.group(4))
    raise ValueError(f'cannot read colour {s!r} (want #RRGGBB or oklch(L C h))')


# The hard-ban regions (SKILL.md "Hard bans"; references/brand-and-color.md §8). lint-film.mjs
# carries the same numbers: change them in both places.
YELLOW = (96.0, 118.0)


def banned(L, C, h):
    """Which hard-ban region an OKLCH colour falls in, or None. Order matters: neon, then the
    light low-chroma warms (beige), then orange/amber, then purple."""
    if YELLOW[0] <= h < YELLOW[1]:  # yellow is light by nature: neon only at highlighter lightness
        neon = L >= 0.91 and C >= 0.15
    else:
        neon = (L >= 0.85 and C >= 0.15) or (L >= 0.80 and C >= 0.18)
    if neon or C >= 0.27:
        return 'neon (very bright and saturated)'
    if 31 <= h < 118 and L >= 0.70 and 0.007 <= C < 0.10:
        return 'beige/cream (warm, light, low chroma: beige, cream, tan, sand)'
    if 31 <= h < 96 and C >= 0.05:
        return 'orange/amber (orange, amber, gold, brass, brown, coral)'
    if 270 <= h < 340 and C >= 0.02:
        return 'purple/violet/indigo'
    return None


def luminance(c):
    """WCAG relative luminance of '#RRGGBB', 'RRGGBB', '#RGB' or an (r, g, b) tuple of 0-255 ints."""
    if isinstance(c, (tuple, list)):
        rgb = [v / 255 for v in c[:3]]
    else:
        h = str(c).strip().lstrip('#')
        if len(h) == 3:
            h = ''.join(ch * 2 for ch in h)
        if len(h) != 6:
            raise ValueError(f'not a hex colour: {c!r}')
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return sum(w * srgb_to_lin(v) for w, v in zip((0.2126, 0.7152, 0.0722), rgb))


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def cover(img, accent_hex, radius=0.08):
    import cv2
    import numpy as np
    im = cv2.imread(img)
    if im is None:
        raise ValueError(f'cannot read image {img}')
    rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M1 = np.array([[.4122214708, .5363325363, .0514459929], [.2119034982, .6806995451, .1073969566], [.0883024619, .2817188376, .6299787005]])
    M2 = np.array([[.2104542553, .7936177850, -.0040720468], [1.9779984951, -2.4285922050, .4505937099], [.0259040371, .7827717662, -.8086757660]])
    lab = np.cbrt(lin @ M1.T) @ M2.T
    ref = np.array([srgb_to_lin(int(accent_hex[i:i + 2], 16) / 255) for i in (1, 3, 5)], np.float32)
    ref_lab = np.cbrt(ref @ M1.T) @ M2.T
    return float((np.linalg.norm(lab - ref_lab, axis=-1) < radius).mean() * 100)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('--accent', required=True, help="the one accent: '#RRGGBB' or 'oklch(L C h)'")
    ap.add_argument('--stage', choices=['light', 'dark'], default='light', help='the ground most shots sit on')
    ap.add_argument('--temp', choices=['neutral', 'cool', 'warm'], default='neutral',
                    help='tint of the neutrals (warm makes a beige paper: needs --brand-supplied)')
    ap.add_argument('--stage-hue', type=float, help="the stage's own hue from the brand's world (OKLCH h, e.g. 160 for pine-black)")
    ap.add_argument('--stage-chroma', type=float, help='chroma for --stage-hue (default 0.014 dark, 0.008 light)')
    ap.add_argument('--paper', help="use this paper instead of the generated one (hex or oklch), and check it")
    ap.add_argument('--brand-supplied', action='store_true',
                    help="the user's brand supplied the accent or paper: skip the hard-ban refusal (record it in BRIEF.md)")
    ap.add_argument('--meaning', default='<one word>', help='what the accent means, for the token comment')
    ap.add_argument('--cover', metavar='IMG', help='only measure the share of pixels within OKLab 0.08 of the accent')
    ap.add_argument('--json', help='also write the palette and checks here')
    a = ap.parse_args()
    try:
        aL, aC, ah = parse_colour(a.accent)
    except ValueError as e:
        print(f'palette.py: {e}', file=sys.stderr)
        return 2
    acc_hex, _ = oklch_hex(aL, aC, ah)
    paper_in = None
    if a.paper:
        try:
            paper_in = parse_colour(a.paper)
        except ValueError as e:
            print(f'palette.py: {e}', file=sys.stderr)
            return 2

    if not a.cover:
        # the hard bans: refuse before building anything, unless the brand supplied the colour
        refusals = []
        why = banned(aL, aC, ah)
        if why:
            refusals.append(f'accent {acc_hex} (OKLCH {aL:.2f} {aC:.3f} {ah:.0f}) is {why}')
        if a.temp == 'warm':
            refusals.append('--temp warm makes a beige paper')
        if paper_in:
            why = banned(*paper_in)
            if why:
                refusals.append(f'paper {a.paper} (OKLCH {paper_in[0]:.2f} {paper_in[1]:.3f} {paper_in[2]:.0f}) is {why}')
        if refusals and not a.brand_supplied:
            for r in refusals:
                print(f'palette.py: refused: {r}.', file=sys.stderr)
            print('  That is a hard ban when you invent the look (SKILL.md "Hard bans"; references/brand-and-color.md §8).\n'
                  '  Choose the accent from red, green, teal, blue or yellow, and keep the paper neutral or cool.\n'
                  "  If the user's brand supplied this colour, pass --brand-supplied and record it in BRIEF.md.", file=sys.stderr)
            return 1
        for r in refusals:
            print(f'palette.py: brand-supplied: {r}; record it in BRIEF.md so the critics accept it.', file=sys.stderr)
        # not a ban, but the fastest way to look like a template: framework-default blues
        if not a.brand_supplied and 252 <= ah <= 268 and aC >= 0.17 and 0.50 <= aL <= 0.66:
            print(f'palette.py: note: accent {acc_hex} sits in the framework-default blue family (#3B82F6/#2563EB). '
                  'It reads as "default" before anything moves. Derive the accent from the brand\'s world '
                  '(references/brand-and-color.md §9: shift the hue, lower the chroma, or pick another family).', file=sys.stderr)

    if a.cover:
        try:
            pct = cover(a.cover, acc_hex)
        except ValueError as e:
            print(f'palette.py: {e}', file=sys.stderr)
            return 2
        ok = pct <= 8
        print(f'accent {acc_hex} covers {pct:.2f}% of {a.cover} ({"ok" if ok else "over 8%: fine only on the one designed flood"})')
        return 0 if ok else 1

    hue = {'neutral': ah, 'cool': 250.0, 'warm': 75.0}[a.temp]
    tint = 2.2 if a.temp == 'warm' else 1.0  # warm papers carry a little more chroma
    stage_hue = None
    if a.stage_hue is not None:
        stage_hue = a.stage_hue % 360
        if 270 <= stage_hue < 340 and not a.brand_supplied:
            print(f'palette.py: refused: --stage-hue {stage_hue:.0f} is in the purple range (270-340), '
                  'a hard ban (SKILL.md, "Hard bans"). Pick a green, teal, blue or neutral stage.', file=sys.stderr)
            return 1
        if 31 <= stage_hue < 118:
            print(f'palette.py: note: --stage-hue {stage_hue:.0f} is warm; a tinted stage there reads as brown or '
                  'beige. Prefer --temp neutral (a true charcoal or a neutral paper).', file=sys.stderr)
    stage_C = a.stage_chroma if a.stage_chroma is not None else (0.014 if a.stage == 'dark' else 0.008)
    # Toward a warm hue (a red or a yellow accent) the neutrals stay neutral: C <= 0.004, and <= 0.003
    # for light ones, so they never read as warm and 8-bit rounding can never push the paper or a
    # light grey into the beige region (C >= 0.007).
    warm_hue = 20 <= hue < 125 and a.temp != 'warm'
    if a.stage == 'light':
        spec = [('paper', 0.975, 0.004 * tint, 'the stage'), ('mist', 0.945, 0.005 * tint, 'canvas behind the product'),
                ('line', 0.885, 0.006, 'hairlines, >= 1.5 px on screen'), ('mute', 0.52, 0.012, 'secondary text'),
                ('ink2', 0.23, 0.008, 'raised dark surfaces'), ('ink', 0.17, 0.007, 'type and marks')]
        stage_key, text_key, band = 'paper', 'ink', (0.50, 0.65)
    else:
        spec = [('ink', 0.165, 0.008 * tint, 'the stage'), ('ink2', 0.215, 0.009 * tint, 'raised surfaces on the stage'),
                ('line', 0.31, 0.010, 'hairlines, >= 1.5 px on screen'), ('mute', 0.72, 0.012, 'secondary text'),
                ('mist', 0.90, 0.006, 'light panels, if any'), ('paper', 0.965, 0.004 * tint, 'type and marks')]
        stage_key, text_key, band = 'ink', 'paper', (0.84, 0.90) if YELLOW[0] <= ah < YELLOW[1] else (0.70, 0.82)
    tokens = {}
    for name, L, C, job in spec:
        h_use = hue
        if stage_hue is not None:
            # the stage and its surfaces carry the world's hue; type and light panels stay near-neutral
            carries = name in (('ink', 'ink2', 'line') if a.stage == 'dark' else ('paper', 'mist', 'line'))
            h_use = stage_hue
            C = stage_C * (1.0 if name == stage_key else 0.8) if carries else min(C, 0.006)
        elif warm_hue:
            C = min(C, 0.003 if L >= 0.7 else 0.004)
        hx, c_used = oklch_hex(L, C, h_use)
        tokens[name] = dict(hex=hx, oklch=[round(L, 3), round(c_used, 4), round(h_use, 1)], job=job)
    if paper_in:
        hx, c_used = oklch_hex(*paper_in)
        tokens['paper'] = dict(hex=hx, oklch=[round(paper_in[0], 3), round(c_used, 4), round(paper_in[2], 1)], job=tokens['paper']['job'] + ' (given)')
    if a.stage == 'dark' and not a.brand_supplied:
        sL, sC, sh = tokens['ink']['oklch']
        if 235 <= sh <= 270 and 0.004 <= sC < 0.02:
            print(f"palette.py: note: the stage {tokens['ink']['hex']} (OKLCH {sL} {sC} {sh:.0f}) is the stock dev-tool "
                  'dark theme (the GitHub / editor blue-grey). It reads as "a screenshot of a tool" before anything moves. '
                  'Take the stage from the brand\'s world instead: --temp neutral for a true charcoal, or --stage-hue '
                  '(pine-black 160, deep teal 200, an ink-navy with body: 235 with --stage-chroma 0.03). '
                  'references/brand-and-color.md §9.', file=sys.stderr)
    tokens['accent'] = dict(hex=acc_hex, oklch=[round(aL, 3), round(aC, 4), round(ah, 1)], job=f'MEANING: "{a.meaning}"')
    stage = tokens[stage_key]['hex']

    checks = []

    def check(name, ok, detail):
        checks.append(dict(check=name, pass_=bool(ok), detail=detail))

    r_text = contrast(tokens[text_key]['hex'], stage)
    r_mute = contrast(tokens['mute']['hex'], stage)
    r_acc = contrast(acc_hex, stage)
    check('statements', r_text >= 7, f'{text_key} on {stage_key} {r_text:.1f}:1 (>= 7)')
    check('secondary text', r_mute >= 4.5, f'mute on {stage_key} {r_mute:.1f}:1 (>= 4.5)')
    check('accent graphics', r_acc >= 3, f'accent on {stage_key} {r_acc:.1f}:1 (>= 3)')
    check('accent chroma', aC >= 0.08, f'C {aC:.3f} (>= 0.08, or it reads as a grey)')
    for k in ('ink', 'ink2', 'paper', 'mist', 'line', 'mute', 'accent'):
        h_ = parse_colour(tokens[k]['hex'])
        why = banned(*h_)
        if why and not a.brand_supplied:
            check(f'hard ban: {k}', False, f"{tokens[k]['hex']} reads as {why}")
    in_band = band[0] <= aL <= band[1]
    fix = ''
    if not in_band:
        L2 = min(max(aL, band[0]), band[1])
        fix = f'; try {oklch_hex(L2, aC, ah)[0]} (L {L2:.2f})'
    check('accent lightness', in_band, f'L {aL:.2f} for a {a.stage} stage ({band[0]}-{band[1]}){fix}')

    for k, v in tokens.items():
        r = contrast(v['hex'], stage) if k != stage_key else None
        v['contrast_on_stage'] = round(r, 2) if r else None
    width = max(len(k) for k in tokens)
    sh_arg = f' --stage-hue {a.stage_hue:g}' if a.stage_hue is not None else ''
    print(f'// palette.py --accent {a.accent} --stage {a.stage} --temp {a.temp}{sh_arg}')
    print('export const C = {')
    for k in ['ink', 'ink2', 'paper', 'mist', 'line', 'mute', 'accent']:
        v = tokens[k]
        L, C, h = v['oklch']
        r = f', {v["contrast_on_stage"]:.1f}:1 on {stage_key}' if v['contrast_on_stage'] else ''
        print(f"  {k}: '{v['hex']}',{' ' * (width - len(k))} // {v['job']} (OKLCH {L} {C} {h:.0f}{r})")
    print('};')
    for c in checks:
        print(f"  {'ok  ' if c['pass_'] else 'FAIL'} {c['check']}: {c['detail']}", file=sys.stderr)
    if a.json:
        json.dump(dict(stage=a.stage, temp=a.temp, tokens=tokens,
                       checks=[dict(check=c['check'], ok=c['pass_'], detail=c['detail']) for c in checks]),
                  open(a.json, 'w'), indent=1)
    return 0 if all(c['pass_'] for c in checks) else 1


if __name__ == '__main__':
    sys.exit(main())
