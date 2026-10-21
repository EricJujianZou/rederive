#!/usr/bin/env python3
"""Bake soft backdrops (pools of light, vignettes, tabletop falloffs, floors) as dithered PNGs from a JSON spec.

Chromium renders CSS gradients in 8 bits. A ramp that spans only a few code values (a pool of light
on ink going 11 -> 29, a light table going 231 -> 247) shows as contour rings, and nothing downstream
(motion blur, encoder, grain added later) can remove bands that were quantized in the browser.
This script evaluates the same gradient in float, adds a +-1 LSB triangular (TPDF) dither and
quantizes once. Load the PNG with <Img src={staticFile('fx/NAME.png')}> (Remotion) or <img> in
HyperFrames, full-frame, instead of the CSS gradient.

Usage:
  python3 scripts/dither-gradient.py --spec backdrops.json --out public/fx [--preview out/qa/bands]
  python3 scripts/dither-gradient.py --example > backdrops.json    # print a starter spec

Spec (positions are fractions; colours are #RGB, #RRGGBB, #RRGGBBAA, rgb(), rgba() or 'transparent'):
  {"size": [1920, 1080], "seed": 11,
   "backdrops": [
     {"name": "pool-ink", "type": "radial", "at": [0.5, 0.45], "radius": [0.7, 0.6],
      "stops": [["rgba(255,255,255,0.075)", 0], ["transparent", 0.7]]},
     {"name": "table", "base": "#E7E8EC", "type": "radial", "at": [0.5, 0.4], "radius": [0.65, 0.6],
      "stops": [["#F7F8FA", 0], ["#F7F8FA00", 0.75]]},
     {"name": "floor", "type": "linear", "angle": 180, "space": "oklab",
      "stops": [["#0B0C0E", 0], ["#16181C", 1]]},
     {"name": "stage", "base": "#0B0C0E", "layers": [ {...gradient...}, {...gradient...} ]}]}

  type radial: CSS 'radial-gradient(ellipse RX RY at CX CY, ...)' with RX/RY as fractions of width/
               height (or "radius": R px for a circle); stop positions along the ray (1 = ellipse edge).
  type linear: CSS 'linear-gradient(ANGLEdeg, ...)' (180 = top to bottom), stop positions along the
               CSS gradient line.
  space:       srgb (CSS default, premultiplied), linear (linear light) or oklab (smoothest ramps).
  base:        opaque colour under the layers -> RGB PNG; without base -> RGBA PNG (alpha dithered).

Options: --dither LSB (1.0; 0 = off to see the bands), --size WxH (override), --preview DIR (writes
a x12 contrast-stretched copy per backdrop so bands would be obvious), --quiet.
Prints a JSON report (files, code-value span per backdrop, banding risk as a CSS gradient).
Exit 0 on success, 1 on a spec error.
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image

EXAMPLE = {
    'size': [1920, 1080], 'seed': 11,
    'backdrops': [
        {'name': 'pool-ink', 'type': 'radial', 'at': [0.5, 0.45], 'radius': [0.7, 0.6],
         'stops': [['rgba(255,255,255,0.075)', 0], ['transparent', 0.7]]},
        {'name': 'table', 'base': '#E7E8EC', 'type': 'radial', 'at': [0.5, 0.4], 'radius': [0.65, 0.6],
         'stops': [['#F7F8FA', 0], ['#F7F8FA00', 0.75]]},
        {'name': 'floor', 'type': 'linear', 'angle': 180, 'space': 'oklab', 'stops': [['#0B0C0E', 0], ['#16181C', 1]]},
    ],
}


def fail(msg):
    sys.stderr.write(f'dither-gradient.py: {msg}\n')
    sys.exit(1)


def parse_color(c):
    """-> (r, g, b, a) floats, rgb in 0..1 gamma-encoded sRGB."""
    s = str(c).strip().lower()
    if s == 'transparent':
        return (0.0, 0.0, 0.0, 0.0)
    m = re.fullmatch(r'#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})', s)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = ''.join(ch * 2 for ch in h)
        v = [int(h[i:i + 2], 16) / 255 for i in range(0, len(h), 2)]
        return tuple(v[:3]) + ((v[3],) if len(v) == 4 else (1.0,))
    m = re.fullmatch(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)', s)
    if m:
        al = m.group(4)
        alpha = 1.0 if al is None else (float(al[:-1]) / 100 if al.endswith('%') else float(al))
        return (float(m.group(1)) / 255, float(m.group(2)) / 255, float(m.group(3)) / 255, alpha)
    fail(f'unknown colour {c!r}')


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])


def to_space(rgb, space):
    if space == 'srgb':
        return rgb
    lin = to_linear(rgb)
    if space == 'linear':
        return lin
    return np.cbrt(lin @ M1.T) @ M2.T  # oklab


def from_space(v, space):
    if space == 'srgb':
        return np.clip(v, 0, 1)
    if space == 'oklab':
        v = (v @ np.linalg.inv(M2).T) ** 3 @ np.linalg.inv(M1).T
    return from_linear(v)


def gradient_t(layer, W, H, x, y):
    kind = layer.get('type', 'radial')
    if kind == 'radial':
        cx, cy = layer.get('at', [0.5, 0.5])
        r = layer.get('radius', [0.5, 0.5])
        if isinstance(r, (int, float)):
            return np.hypot(x - cx * W, y - cy * H) / float(r)
        return np.hypot((x - cx * W) / (r[0] * W), (y - cy * H) / (r[1] * H))
    if kind == 'linear':
        th = np.radians(float(layer.get('angle', 180)))
        dx, dy = np.sin(th), -np.cos(th)
        length = abs(W * dx) + abs(H * dy)
        return ((x - W / 2) * dx + (y - H / 2) * dy) / length + 0.5
    fail(f"unknown gradient type {kind!r} (radial or linear)")


def render_layer(layer, W, H, x, y):
    """-> premultiplied (H, W, 3) colour in gamma sRGB and (H, W) alpha."""
    stops = layer.get('stops')
    if not stops or len(stops) < 2:
        fail(f"layer needs >= 2 stops: {layer}")
    space = layer.get('space', 'srgb')
    if space not in ('srgb', 'linear', 'oklab'):
        fail(f'unknown space {space!r}')
    cols = [parse_color(s[0]) for s in stops]
    pos = [float(s[1]) if len(s) > 1 else i / (len(stops) - 1) for i, s in enumerate(stops)]
    if any(b < a for a, b in zip(pos, pos[1:])):
        fail(f'stop positions must not decrease: {pos}')
    t = gradient_t(layer, W, H, x, y)
    rgb = np.array([c[:3] for c in cols], dtype=np.float64)
    al = np.array([c[3] for c in cols], dtype=np.float64)
    # CSS: a fully transparent stop takes its neighbour's colour (premultiplied interpolation)
    for i in range(len(cols)):
        if al[i] == 0:
            nb = [j for j in (i - 1, i + 1) if 0 <= j < len(cols) and al[j] > 0]
            if nb:
                rgb[i] = rgb[nb[0]]
    comp = to_space(rgb, space) * al[:, None]  # premultiplied in the interpolation space
    tc = np.clip(t, pos[0], pos[-1])
    out = np.empty(t.shape + (3,))
    for ch in range(3):
        out[..., ch] = np.interp(tc, pos, comp[:, ch])
    a = np.interp(tc, pos, al)
    safe = np.where(a > 1e-9, a, 1.0)[..., None]
    straight = from_space(out / safe, space)
    return straight * a[..., None], a


def build(bd, W, H, rng, dither):
    y, x = np.mgrid[0:H, 0:W].astype(np.float64) + 0.5
    layers = bd.get('layers') or [bd]
    base = bd.get('base')
    if base is not None:
        b = parse_color(base)
        col = np.broadcast_to(np.array(b[:3]), (H, W, 3)).copy()
        alpha = np.ones((H, W))
    else:
        col = np.zeros((H, W, 3))
        alpha = np.zeros((H, W))
    for layer in layers:
        c, a = render_layer(layer, W, H, x, y)
        col = c + col * (1 - a[..., None])  # source-over, premultiplied
        alpha = a + alpha * (1 - a)
    tpdf = (rng.random((H, W)) + rng.random((H, W)) - 1.0) * dither
    if base is not None or alpha.min() >= 1 - 1e-9:  # opaque result -> RGB PNG
        v = col * 255 + tpdf[..., None]
        img = np.clip(np.round(v), 0, 255).astype(np.uint8)
        return Image.fromarray(img, 'RGB'), img, col * 255
    safe = np.where(alpha > 1e-9, alpha, 1.0)[..., None]
    straight = col / safe * 255
    clear = alpha <= 1e-9
    if clear.any() and (~clear).any():  # fully clear pixels keep the ramp's colour: no dark fringe when scaled
        straight[clear] = straight[~clear].mean(axis=0)
    varies = (straight.max(axis=(0, 1)) - straight.min(axis=(0, 1))).max() >= 0.5
    tpdf2 = (rng.random((H, W)) + rng.random((H, W)) - 1.0) * dither if varies else np.zeros((H, W))
    rgb = np.clip(np.round(straight + tpdf2[..., None]), 0, 255).astype(np.uint8)
    a8 = np.clip(np.round(alpha * 255 + tpdf), 0, 255).astype(np.uint8)
    img = np.dstack([rgb, a8])
    return Image.fromarray(img, 'RGBA'), img, np.dstack([straight, alpha * 255])


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--spec', help='backdrops JSON spec')
    ap.add_argument('--out', default='public/fx', help='output directory (default public/fx)')
    ap.add_argument('--size', help='WxH, overrides the spec size')
    ap.add_argument('--dither', type=float, default=1.0, help='TPDF amplitude in LSB (0 = off)')
    ap.add_argument('--preview', help='directory for x12 contrast-stretched previews')
    ap.add_argument('--example', action='store_true', help='print an example spec and exit')
    ap.add_argument('--quiet', action='store_true')
    a = ap.parse_args()
    if a.example:
        print(json.dumps(EXAMPLE, indent=1))
        return
    if not a.spec:
        ap.error('--spec is required (or --example)')
    try:
        spec = json.load(open(a.spec))
    except (OSError, ValueError) as e:
        fail(f'cannot read spec {a.spec}: {e}')
    W, H = spec.get('size', [1920, 1080])
    if a.size:
        W, H = (int(v) for v in a.size.lower().split('x'))
    rng = np.random.default_rng(int(spec.get('seed', 11)))
    os.makedirs(a.out, exist_ok=True)
    if a.preview:
        os.makedirs(a.preview, exist_ok=True)
    report = {'out': a.out, 'size': [W, H], 'backdrops': []}
    for bd in spec.get('backdrops', []):
        name = bd.get('name')
        if not name or not re.fullmatch(r'[\w.-]+', name):
            fail(f'backdrop needs a file-safe "name": {bd}')
        im, arr, exact = build(bd, W, H, rng, a.dither)
        path = os.path.join(a.out, f'{name}.png')
        im.save(path, compress_level=6)
        ch = exact.reshape(-1, exact.shape[-1])
        ch = ch[:, 3:] if im.mode == 'RGBA' else ch  # a translucent layer's ramp lives in its alpha
        span = float((ch.max(0) - ch.min(0)).max())
        entry = {'name': name, 'file': path, 'mode': im.mode, 'code_span': round(span, 1),
                 'css_banding_risk': bool(0 < span < 30),
                 'mean': [round(float(v), 2) for v in arr.reshape(-1, arr.shape[-1]).mean(0)]}
        if a.preview:
            if im.mode == 'RGBA':  # composite over mid grey so the alpha ramp is visible
                rgb = arr[..., :3].astype(np.float64) * (arr[..., 3:] / 255) + 128 * (1 - arr[..., 3:] / 255)
            else:
                rgb = arr.astype(np.float64)
            m = rgb.mean(axis=(0, 1))
            st = np.clip((rgb - m) * 12 + 128, 0, 255).astype(np.uint8)
            pp = os.path.join(a.preview, f'{name}.stretch.png')
            Image.fromarray(st).resize((W // 2, H // 2), Image.BILINEAR).save(pp)
            entry['preview'] = pp
        report['backdrops'].append(entry)
        if not a.quiet:
            sys.stderr.write(f"  {path}: {im.mode}, span {span:.1f} code values"
                             + (' (would band as a CSS gradient: use this PNG)' if entry['css_banding_risk'] else '') + '\n')
    if not report['backdrops']:
        fail('spec has no backdrops')
    print(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
