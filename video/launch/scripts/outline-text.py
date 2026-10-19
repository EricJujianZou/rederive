#!/usr/bin/env python3
"""Outline a line of text as SVG path data, shaped the way the browser sets it (kerning, tracking,
a variable font's weight), so a wordmark ships as vector shapes that need no font installed.

It decodes the font (woff2, ttf or otf, variable or static), shapes the text with HarfBuzz at
the requested weight, adds CSS-style letter-spacing after every glyph, and draws each glyph's
outline at the requested size. The output is JSON: the path (baseline at y = 0, y pointing down,
x from 0 at the first glyph's origin), the advance width, and the ink box. scripts/brand-svg.ts
uses it for the lockup SVGs; use it alone for any lettering that must leave the browser.

Usage:
  python3 scripts/outline-text.py --font node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2 \\
      --text tarn --weight 440 --track -0.015 --size 200
  python3 scripts/outline-text.py --font brand.otf --text "tarn" --size 200 --svg out/wordmark.svg

Needs: fonttools, brotli (for woff2) and uharfbuzz (pip install fonttools brotli uharfbuzz).
Exit 0 on success, 1 on a font or shaping error, 2 on missing modules.
"""
import argparse
import io
import json
import sys


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--font', required=True, help='font file: .woff2, .woff, .ttf or .otf')
    ap.add_argument('--text', required=True)
    ap.add_argument('--size', type=float, default=100, help='font size in px (the em)')
    ap.add_argument('--weight', type=float, help="wght axis value for a variable font (e.g. 440)")
    ap.add_argument('--track', type=float, default=0, help='letter-spacing in em, as in CSS (e.g. -0.03)')
    ap.add_argument('--svg', help='also write a standalone SVG of the text, cropped to its ink')
    ap.add_argument('--fill', default='#000000', help='fill for --svg')
    a = ap.parse_args()
    try:
        from fontTools.ttLib import TTFont
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.pens.transformPen import TransformPen
        from fontTools.pens.boundsPen import BoundsPen
        import uharfbuzz as hb
    except ImportError as e:
        print(f'outline-text.py: {e}; pip install fonttools brotli uharfbuzz', file=sys.stderr)
        return 2
    try:
        font = TTFont(a.font)
        buf = io.BytesIO()
        font.flavor = None  # woff2 -> sfnt bytes that HarfBuzz can read
        font.save(buf)
        data = buf.getvalue()
        font = TTFont(io.BytesIO(data))
    except Exception as e:  # noqa: BLE001 - fontTools raises many types
        print(f'outline-text.py: cannot read {a.font}: {e}', file=sys.stderr)
        return 1
    axes = {ax.axisTag: (ax.minValue, ax.maxValue) for ax in font['fvar'].axes} if 'fvar' in font else {}
    loc = {}
    if a.weight is not None and 'wght' in axes:
        lo, hi = axes['wght']
        loc['wght'] = min(max(a.weight, lo), hi)
        if loc['wght'] != a.weight:
            print(f'outline-text.py: weight {a.weight:g} is outside the font axis {lo:g}-{hi:g}; using {loc["wght"]:g}', file=sys.stderr)
    glyphs = font.getGlyphSet(location=loc or None)
    order = font.getGlyphOrder()
    upem = font['head'].unitsPerEm

    face = hb.Face(data)
    hbfont = hb.Font(face)
    if loc:
        hbfont.set_variations(loc)
    hbuf = hb.Buffer()
    hbuf.add_str(a.text)
    hbuf.guess_segment_properties()
    hb.shape(hbfont, hbuf, {'kern': True, 'liga': True})

    k = a.size / upem
    track = a.track * upem  # CSS adds letter-spacing after every character
    pen = SVGPathPen(glyphs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    bounds = BoundsPen(glyphs)
    x = 0.0
    for info, pos in zip(hbuf.glyph_infos, hbuf.glyph_positions):
        name = order[info.codepoint]
        t = (k, 0, 0, -k, (x + pos.x_offset) * k, -pos.y_offset * k)  # y down, baseline at 0
        glyphs[name].draw(TransformPen(pen, t))
        glyphs[name].draw(TransformPen(bounds, t))
        x += pos.x_advance + track
    advance = (x - track) * k  # the ink ends one tracking before CSS's box does
    if bounds.bounds is None:
        print('outline-text.py: the text has no ink', file=sys.stderr)
        return 1
    x0, y0, x1, y1 = bounds.bounds
    out = dict(d=pen.getCommands(), size=a.size, weight=loc.get('wght'), track=a.track, advance=round(advance, 2),
               ink=[round(v, 2) for v in (x0, y0, x1, y1)], ascent=round(-y0, 2), descent=round(y1, 2),
               units_per_em=upem, text=a.text, font=a.font)
    if a.svg:
        pad = a.size * 0.02
        vb = f'{x0 - pad:.2f} {y0 - pad:.2f} {x1 - x0 + 2 * pad:.2f} {y1 - y0 + 2 * pad:.2f}'
        with open(a.svg, 'w') as fh:
            fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"><path fill="{a.fill}" d="{out["d"]}"/></svg>\n')
    print(json.dumps(out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
