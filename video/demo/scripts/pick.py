#!/usr/bin/env python3
"""Draw techniques from the library at random, so films don't converge on the same few moves.

An agent left to choose picks the first familiar option: the same fade-up, the same push-in, the
same end card. pick.py draws from assets/library/techniques.json instead, weighted toward what
fits the film (format, energy) and toward proven workhorses, and prints the build recipe for each
draw. The seed is printed, so a plan can be reproduced and written into TREATMENT.md.

Weights: role (workhorse 3, accent 2, signature 1) x proof (1 + evidence / 4, capped at 3) x
energy fit (same 1.0, "any" 0.7, other 0.25). Entries whose formats don't include the film's
format (or "any") are never drawn. Entries that rely on a house-banned look (ban_safe false)
are drawn with their ban-safe variant as the recipe, unless --brand-supplied names every look in
the entry's "bans" list.

Usage:
  python3 scripts/pick.py --format launch --energy high --seconds 25  # a whole-film plan (10 picks)
  python3 scripts/pick.py --format loop --energy calm --seed 41       # reproducible plan (10 s: 4 picks)
  python3 scripts/pick.py --category transition --n 3 --format launch # three transitions
  python3 scripts/pick.py --category logo_and_end_card --exclude le-hard-cut-lockup
  python3 scripts/pick.py --plan --avoid out/qa/picks-previous.json    # skip ids used before
  python3 scripts/pick.py --list [--category camera]                  # ids and names
  python3 scripts/pick.py --show tr-mask-wipe-swap                    # one entry in full
  python3 scripts/pick.py --validate                                  # check the library file
  python3 scripts/pick.py --markdown > references/technique-library.md # regenerate the readable library
  python3 scripts/pick.py ... --json out/qa/picks.json                # also write the draw as JSON

A plan holds about one technique per 2.5 s of film (--seconds), filled in the format's order of
need (a sting draws its end card and hook first, a walkthrough its product demo), with one
signature move, or two in a plan of 10 or more.

Rules for the agent (SKILL.md, Step 1): draw before you design; build the picks the concept can
carry, each retold in the film's objects; reroll a pick that fights the concept (--exclude it,
same --category) at most twice, or drop it, and write down why. Never add a technique the draw
did not give you: draw one with --category. A draw is a starting point, not a quota.

Exit 0 on success, 1 when nothing fits the filters, 2 on bad input or an invalid library.
"""
import argparse
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# The skill keeps the library in assets/library/; a film project made by new-film.sh carries its own
# copy next to this script, in scripts/library/.
_LIBRARIES = [os.path.normpath(os.path.join(HERE, '..', 'assets', 'library', 'techniques.json')),
              os.path.join(HERE, 'library', 'techniques.json')]
DEFAULT_LIBRARY = next((p for p in _LIBRARIES if os.path.isfile(p)), _LIBRARIES[0])

CATEGORIES = ['opening_hook', 'transition', 'camera', 'typography_motion', 'ui_choreography',
              'data_and_numbers', 'product_demo', 'logo_and_end_card', 'color_and_light',
              'texture_and_finish', 'layout_and_composition', 'pacing_structure',
              'micro_interaction', 'depth_and_3d']
FORMATS = ['launch', 'feature', 'loop', 'sting', 'walkthrough', 'vertical']
ENERGIES = ['calm', 'medium', 'high']
ROLE_WEIGHT = {'workhorse': 3.0, 'accent': 2.0, 'signature': 1.0}
REQUIRED = ['id', 'name', 'category', 'summary', 'recipe', 'timing', 'use_when', 'avoid_when',
            'formats', 'energy', 'role', 'ban_safe', 'evidence']

# The order in which a plan fills its slots, by format: the first slots go to what that format
# cannot do without. A film gets about one technique per 2.5 s (--seconds), so a 12 s vertical
# video draws 5 and a 30 s launch film 12: a short film carries a few moves done well, and a
# plan stuffed with one move per category reads as a showreel. A category may appear twice.
ORDER = {
    'launch': ['opening_hook', 'transition', 'typography_motion', 'product_demo', 'ui_choreography',
               'logo_and_end_card', 'camera', 'transition', 'data_and_numbers', 'micro_interaction',
               'color_and_light', 'pacing_structure', 'typography_motion', 'depth_and_3d',
               'layout_and_composition', 'texture_and_finish', 'transition', 'ui_choreography'],
    'feature': ['product_demo', 'ui_choreography', 'opening_hook', 'transition', 'micro_interaction',
                'typography_motion', 'logo_and_end_card', 'data_and_numbers', 'camera', 'color_and_light',
                'ui_choreography', 'layout_and_composition'],
    'loop': ['ui_choreography', 'product_demo', 'micro_interaction', 'typography_motion', 'transition',
             'camera', 'pacing_structure', 'color_and_light'],
    'sting': ['logo_and_end_card', 'opening_hook', 'typography_motion', 'micro_interaction', 'camera',
              'texture_and_finish'],
    'walkthrough': ['product_demo', 'ui_choreography', 'opening_hook', 'transition', 'micro_interaction',
                    'camera', 'typography_motion', 'logo_and_end_card', 'ui_choreography', 'product_demo',
                    'transition', 'pacing_structure', 'layout_and_composition', 'micro_interaction'],
    'vertical': ['opening_hook', 'product_demo', 'ui_choreography', 'typography_motion', 'transition',
                 'logo_and_end_card', 'micro_interaction', 'data_and_numbers', 'camera', 'color_and_light',
                 'transition', 'typography_motion'],
}
DEFAULT_SECONDS = {'launch': 30, 'feature': 15, 'loop': 10, 'sting': 6, 'walkthrough': 45, 'vertical': 15}
MIN_PICKS = {'launch': 6, 'feature': 5, 'loop': 4, 'sting': 4, 'walkthrough': 6, 'vertical': 5}
SECONDS_PER_PICK = 2.5


def plan_size(fmt, seconds):
    """How many techniques a film of this format and length draws."""
    n = int(round(seconds / SECONDS_PER_PICK))
    return max(MIN_PICKS[fmt], min(len(ORDER[fmt]), n))


def plan_slots(fmt, seconds):
    """{category: count} for the first plan_size() slots of the format's order."""
    slots = {}
    for cat in ORDER[fmt][:plan_size(fmt, seconds)]:
        slots[cat] = slots.get(cat, 0) + 1
    return slots


BANS = ['glass', 'glow', 'serif', 'italic', 'orange', 'beige', 'purple', 'gradient', 'filler-text',
        'emoji', 'sparkle', 'confetti', 'particles']


def fail(msg, code=2):
    print(f'pick.py: {msg}', file=sys.stderr)
    sys.exit(code)


def load(path):
    try:
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)
    except (OSError, ValueError) as e:
        fail(f'cannot read the library {path}: {e}')
    entries = data['techniques'] if isinstance(data, dict) else data
    problems = validate(entries)
    if problems:
        fail('invalid library:\n  ' + '\n  '.join(problems[:20]))
    return entries


def validate(entries):
    problems, seen = [], set()
    if not isinstance(entries, list) or not entries:
        return ['the library holds no techniques']
    for i, e in enumerate(entries):
        where = e.get('id', f'#{i}') if isinstance(e, dict) else f'#{i}'
        if not isinstance(e, dict):
            problems.append(f'{where}: not an object')
            continue
        for k in REQUIRED:
            if k not in e or e[k] in ('', None):
                problems.append(f'{where}: missing {k}')
        if e.get('id') in seen:
            problems.append(f'{where}: duplicate id')
        seen.add(e.get('id'))
        if e.get('category') not in CATEGORIES:
            problems.append(f'{where}: unknown category {e.get("category")!r}')
        fm = e.get('formats') or []
        if not isinstance(fm, list) or not fm or any(f not in FORMATS + ['any'] for f in fm):
            problems.append(f'{where}: formats must be a non-empty list of {FORMATS + ["any"]}')
        if e.get('energy') not in ENERGIES + ['any']:
            problems.append(f'{where}: energy must be one of {ENERGIES + ["any"]}')
        if e.get('role') not in ROLE_WEIGHT:
            problems.append(f'{where}: role must be one of {list(ROLE_WEIGHT)}')
        if e.get('ban_safe') is False and not e.get('ban_safe_variant'):
            problems.append(f'{where}: ban_safe is false but there is no ban_safe_variant')
        if not isinstance(e.get('evidence', 0), (int, float)) or isinstance(e.get('evidence'), bool):
            problems.append(f'{where}: evidence must be a number')
        bans = e.get('bans', [])
        if not isinstance(bans, list) or any(b not in BANS for b in bans):
            problems.append(f'{where}: bans must be a list drawn from {BANS}')
        elif e.get('ban_safe') is True and bans:
            problems.append(f'{where}: ban_safe is true but bans lists {bans}')
        elif e.get('ban_safe') is False and not bans:
            problems.append(f'{where}: ban_safe is false, so bans must name the banned looks it relies on')
    return problems


def weight(e, energy):
    w = ROLE_WEIGHT[e['role']] * min(3.0, 1.0 + float(e.get('evidence') or 0) / 4.0)
    if energy:
        w *= 1.0 if e['energy'] == energy else (0.7 if e['energy'] == 'any' else 0.25)
    return w


def fits(e, fmt):
    return not fmt or 'any' in e['formats'] or fmt in e['formats']


def draw(pool, n, rng, energy, taken, signature_left):
    """Weighted draw without replacement. Returns (picks, signature_left)."""
    picks = []
    cand = [e for e in pool if e['id'] not in taken]
    while len(picks) < n and cand:
        if signature_left <= 0:
            cand = [e for e in cand if e['role'] != 'signature']
            if not cand:
                break
        ws = [weight(e, energy) for e in cand]
        e = rng.choices(cand, weights=ws, k=1)[0]
        picks.append(e)
        taken.add(e['id'])
        if e['role'] == 'signature':
            signature_left -= 1
        cand = [c for c in cand if c['id'] != e['id']]
    return picks, signature_left


def brand_allows(e, allowed):
    """True when the brand supplies every banned look this entry's original recipe relies on."""
    if not allowed:
        return False
    if e.get('bans'):
        return set(e['bans']) <= allowed
    note = (e.get('ban_note', '') + ' ' + e.get('recipe', '')).lower()
    return any(b in note for b in allowed)


def render(e, allowed):
    lines = [f"### {e['name']}  `{e['id']}`",
             f"*{e['category']} · {e['role']} · energy {e['energy']} · formats {', '.join(e['formats'])}*", '',
             e['summary'], '']
    if e.get('ban_safe') is False and not brand_allows(e, allowed):
        lines += [f"**Build (ban-safe variant):** {e['ban_safe_variant']}",
                  f"(The full look touches a house ban; use it only for a brand that supplies it: {e['recipe']})"]
    else:
        lines += [f"**Build:** {e['recipe']}"]
    lines += [f"**Timing:** {e['timing']}", f"**Use when:** {e['use_when']}", f"**Avoid when:** {e['avoid_when']}", '']
    return '\n'.join(lines)


CATEGORY_TITLES = {
    'opening_hook': 'Opening hooks', 'transition': 'Transitions', 'camera': 'Camera',
    'typography_motion': 'Typography in motion', 'ui_choreography': 'UI choreography',
    'data_and_numbers': 'Data and numbers', 'product_demo': 'Product demo', 'logo_and_end_card': 'Logo and end card',
    'color_and_light': 'Colour and light', 'texture_and_finish': 'Texture and finish',
    'layout_and_composition': 'Layout and composition', 'pacing_structure': 'Pacing and structure',
    'micro_interaction': 'Micro-interactions', 'depth_and_3d': 'Depth and 3D',
}


def library_markdown(entries, path):
    """The readable library: generated from the JSON so the two never drift (CI checks it)."""
    try:
        with open(path, encoding='utf-8') as fh:
            data = json.load(fh)
        intros = data.get('intros', {}) if isinstance(data, dict) else {}
    except (OSError, ValueError):
        intros = {}
    by = {c: [e for e in entries if e['category'] == c] for c in CATEGORIES}
    out = ['# Technique library', '',
           '<!-- Generated by `python3 scripts/pick.py --markdown` from assets/library/techniques.json. Edit the JSON, then regenerate. -->', '',
           f'{len(entries)} techniques in {sum(1 for v in by.values() if v)} categories, each with a build recipe, default timing at 60 fps, '
           'and when to use it. Don\'t choose from this list by hand: draw with `scripts/pick.py` (SKILL.md, Step 1), then come here '
           'to read an entry in full or to find an alternative after a reroll. Roles: a **workhorse** carries a film and can recur, '
           'an **accent** spices one moment, a **signature** is a hero move used once (at most 2 per launch film).', '',
           '## Contents', '']
    for c in CATEGORIES:
        if by[c]:
            title = CATEGORY_TITLES[c]
            out.append(f"- [{title}](#{title.lower().replace(' ', '-')}) ({len(by[c])})")
    out.append('')
    for c in CATEGORIES:
        if not by[c]:
            continue
        out += [f'## {CATEGORY_TITLES[c]}', '']
        if intros.get(c):
            out += [intros[c], '']
        for e in sorted(by[c], key=lambda e: (list(ROLE_WEIGHT).index(e['role']), e['name'].lower())):
            out += [f"### {e['name']}", '',
                    f"`{e['id']}` · {e['role']} · energy {e['energy']} · {', '.join(e['formats'])}", '',
                    e['summary'], '', f"- **Build:** {e['recipe']}"]
            if e.get('ban_safe') is False:
                out.append(f"- **Ban-safe variant (the default):** {e['ban_safe_variant']} The full look relies on "
                           f"{', '.join(e.get('bans', []))}; use it only when the brand supplies that look.")
            out += [f"- **Timing:** {e['timing']}", f"- **Use when:** {e['use_when']}", f"- **Avoid when:** {e['avoid_when']}", '']
    return '\n'.join(out).rstrip() + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__.split('\n\n', 1)[1])
    ap.add_argument('--library', default=DEFAULT_LIBRARY, help='techniques JSON (default: assets/library/techniques.json in the skill, scripts/library/techniques.json in a film project)')
    ap.add_argument('--format', choices=FORMATS, help='the film format; filters entries and sets the plan shape')
    ap.add_argument('--energy', choices=ENERGIES, help='weights entries toward this energy')
    ap.add_argument('--seconds', type=float, help='the film length: about one technique per 2.5 s (default per format)')
    ap.add_argument('--category', choices=CATEGORIES, help='draw only from this category')
    ap.add_argument('--n', type=int, default=1, help='how many to draw with --category (default 1)')
    ap.add_argument('--plan', action='store_true', help='draw a whole-film plan (the default without --category)')
    ap.add_argument('--seed', type=int, help='seed for a reproducible draw (default: random, printed)')
    ap.add_argument('--exclude', default='', help='comma-separated ids never to draw (e.g. a reroll)')
    ap.add_argument('--avoid', help='a JSON from an earlier --json run; its ids are not drawn again')
    ap.add_argument('--brand-supplied', default='', help=f'comma-separated banned looks the brand supplies: {",".join(BANS)}')
    ap.add_argument('--json', help='also write the draw here')
    ap.add_argument('--list', action='store_true', help='list ids and names (optionally one --category)')
    ap.add_argument('--show', metavar='ID', help='print one entry in full')
    ap.add_argument('--validate', action='store_true', help='check the library file and exit')
    ap.add_argument('--markdown', action='store_true', help='print the whole library as Markdown (references/technique-library.md)')
    a = ap.parse_args()

    entries = load(a.library)
    if a.validate:
        by = {c: sum(1 for e in entries if e['category'] == c) for c in CATEGORIES}
        print(f'pick.py: {len(entries)} techniques in {sum(1 for v in by.values() if v)} categories: '
              + ', '.join(f'{c} {n}' for c, n in by.items()))
        empty = [c for c, n in by.items() if n == 0]
        if empty:
            fail(f'categories with no entries: {", ".join(empty)}')
        return 0
    if a.markdown:
        print(library_markdown(entries, a.library))
        return 0
    if a.list:
        for e in entries:
            if not a.category or e['category'] == a.category:
                print(f"{e['id']:<34} {e['category']:<22} {e['role']:<9} {e['name']}")
        return 0
    if a.show:
        hit = [e for e in entries if e['id'] == a.show]
        if not hit:
            fail(f'no technique {a.show!r} (run --list)', 1)
        print(render(hit[0], set()))
        return 0
    if a.n < 1:
        fail('--n must be at least 1')

    seed = a.seed if a.seed is not None else int.from_bytes(os.urandom(4), 'big')
    rng = random.Random(seed)
    allowed = {b.strip().lower() for b in a.brand_supplied.split(',') if b.strip()}
    unknown = allowed - set(BANS)
    if unknown:
        fail(f'--brand-supplied: unknown look(s) {", ".join(sorted(unknown))}; choose from {", ".join(BANS)}')
    taken = {x.strip() for x in a.exclude.split(',') if x.strip()}
    if a.avoid:
        try:
            prev = json.load(open(a.avoid, encoding='utf-8'))
            taken |= {p['id'] for p in prev.get('picks', [])}
        except (OSError, ValueError, KeyError, TypeError) as e:
            fail(f'--avoid {a.avoid}: {e}')
    pool = [e for e in entries if fits(e, a.format)]

    picks = []
    if a.category and not a.plan:
        cat_pool = [e for e in pool if e['category'] == a.category]
        picks, _ = draw(cat_pool, a.n, rng, a.energy, taken, signature_left=a.n)
    else:
        fmt = a.format or 'launch'
        seconds = a.seconds if a.seconds else DEFAULT_SECONDS[fmt]
        sig = 2 if plan_size(fmt, seconds) >= 10 else 1  # signature moves per film
        for cat, n in plan_slots(fmt, seconds).items():
            got, sig = draw([e for e in pool if e['category'] == cat], n, rng, a.energy, taken, sig)
            picks += got
    if not picks:
        if a.category and not a.plan:
            left = [e['id'] for e in pool if e['category'] == a.category and e['id'] not in taken]
            fail(f'no {a.category} technique is left for --format {a.format or "any"} '
                 f'({len(taken)} excluded, {len(left)} left). That pick has run out: drop it, with a reason in the '
                 'treatment, or take the slot from another category', 1)
        fail('nothing fits these filters (try a broader --format)', 1)

    head = (f"<!-- pick.py --seed {seed}"
            + (f" --format {a.format}" if a.format else '') + (f" --energy {a.energy}" if a.energy else '')
            + (f" --seconds {a.seconds:g}" if a.seconds and not (a.category and not a.plan) else '')
            + (f" --category {a.category} --n {a.n}" if a.category and not a.plan else '') + ' -->')
    print(head)
    print(f"# Drawn techniques (seed {seed})\n")
    print('Build the picks the concept can carry, each retold in its objects. Reroll a pick at most twice, or drop it, with a written reason.\n')
    if len(picks) > 1:
        for e in picks:
            print(f"- {e['category']}: {e['name']} (`{e['id']}`, {e['role']})")
        print()
    for e in picks:
        print(render(e, allowed))
    if a.json:
        os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
        with open(a.json, 'w', encoding='utf-8') as fh:
            json.dump({'seed': seed, 'format': a.format, 'energy': a.energy, 'category': a.category,
                       'picks': [{'id': e['id'], 'name': e['name'], 'category': e['category'], 'role': e['role']}
                                 for e in picks]}, fh, indent=1)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BrokenPipeError:  # `pick.py | head`: the reader closed early
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)
