# rederive launch video: brief

**Spec:** `1920x1080@60, 28s, 120BPM, audio: synthesized` (score plus UI effects, -14 LUFS). Plus a 9:16 (1080x1920, Instagram feed9x16 safe zones, captions burned in) and a 1:1 (1080x1080) re-layout from the same timeline, and a poster.

Effort: this film is built at xhigh per the cinetic Step 0 rule for new launch films.

- Product: rederive, an open source skill for coding agents (a Claude Code plugin, also installable for Codex, Cursor, Gemini CLI and others). It teaches a codebase by making the user design it themselves. It finds the decisions that shaped the code and gives each one back as a problem, adding the real constraints one at a time. It never states the answer; when the user's design reaches the real one, it names it by the term engineers already know.
- Who it is for: people who built a project with AI and cannot explain it, people about to walk through their own work in an interview, and people learning how a well-known repo (Express, Redis) works.
- The smart part the film must show: unlike an explainer, it withholds the answer. The user proposes a design, a constraint breaks it, the user revises, and when the revision matches the real design the skill names it. The chat shape in the real README (`assets/session-dark.png`) is the ground truth for this: a problem with no solution words, a naive answer, one constraint, a better answer, "yes, exactly, you rederived X."
- Where it runs: X (the launch post, 16:9 or 1:1, autoplaying muted in the feed) and an Instagram reel (9:16, muted autoplay, captions burned in).
- End card practical fact: the repo, `github.com/EricJujianZou/rederive`, readable at least 1.7 s (the marketplace install line is too long for a card).
- Engine: Remotion 4.0.529, `--link-modules` to `/home/ubuntu/projects/watnow/video/reel/node_modules`.

## Viral format rules (from docs/research in content-machine, pulled 2026-10-18)

1. Open on the problem or the payoff, never on the logo or "Introducing." The winning launch posts stated the problem first, then the fix, then the link.
2. The demo is the product actually running: a real session, real agent chrome, real text. The film should read as "this is what happens when you type /rederive."
3. The problem the viewer feels: built it with AI, cannot explain it, the interviewer says "walk me through this." Or: asked the AI to explain the code, and remembers none of it.
4. One idea: it makes you design the code yourself instead of explaining it.
5. Reads fully muted. Every feed variant has the key lines on screen.
6. End card carries the repo link, readable 1.7 s or more.

## Brand (supplied, exact values pulled from the asset files)

- Name: rederive, all lowercase. Mark: a partial derivative sign (∂), `assets/logo.png` (ink `#0D0D0D`, mark pure white).
- Wordmark set in Geist, `assets/banner-dark.png`. Exact pixel-sampled colours from that file: stage `#0D1117`, wordmark/type `#F0F3F6`, the banner's subtitle grey `#9198A1`.
- `assets/session-dark.png` (the real product chat chrome): page `#0D1117`, assistant bubble `#161B22`, user bubble and avatar badge `#E6EDF3`/`#F0F3F6`, the same ink/paper pair as the banner. This is GitHub's own dark palette, fitting for a dev tool that teaches people to read repos.
- The brand ships no accent colour (every sampled asset is ink, paper or grey). Per this brief's own instruction, the film adds one: **green, `#3FB950`**, the exact value GitHub's dark diff view uses for an added, correct line. Meaning: "resolved, you got it." Contrast on `#0D1117` is 7.45:1. Recorded here as the film's own invented token, not a brand-supplied exception, so lint and the critics check it against the normal hard-ban rule (green is an allowed family).
- Fonts: Geist Variable (display, already the wordmark's face) and Geist Mono Variable (UI chrome, timestamps, the typed command, the install line), both vendored from the shared node_modules with `scripts/add-font.mjs`.
- Stage: dark (`#0D1117`), per the brief's preference and the brand's own dark README variant.

## Writing rules from Eric (hard bans, on-screen and in every file, including this one)

No em or en dashes anywhere. No two sentences built on the same frame with swapped nouns. No clipped dramatic fragments. No tagline pairs. No triples. No "the machine", "lands", "the same shape". No dramatic adverbs (quietly, seamlessly, effortlessly, silently). Subject first, then verb, then object. Plain sentences a student would say to a friend.

## Hard bans (cinetic)

No eyebrow labels, stacked taglines, "Introducing", text walls or filler text. No serif or italic typeface for the wordmark or body text. No orange, amber, beige, cream, neon, purple, violet, indigo, multi-hue gradients or glass. No emoji, stock icons, sparkles, particles, confetti, lens flares, code rain. No bouncy overshoot except on a true landing (at most 2 in the film).

### Brand-supplied exception

The ∂ mark itself is a cursive, italic-feeling stroke (see `assets/logo.png`). This is the supplied brand mark, not an invented display typeface, so the hard ban on italic styles does not apply to it. It is marked `// cinetic:brand-supplied mark stroke` wherever it is drawn in code. No other italic or serif appears anywhere else in the film.

## Copy budget

Cinetic's own rule (`references/copy-and-type.md` §1): strings the product itself shows, a typed command, the chat dialogue, a URL, a UI label, are not the film talking and do not count against the word budget; they still have to be real, readable and held long enough. Only the film's own voice (the end-card line) is budgeted here, and it comes in at 10 words against a 15-35 target, by design: the demo carries the idea, and the film adds only one sentence of its own.

## Deliverables

All under `/home/ubuntu/projects/rederive/video/launch/deliver/`, QA material in `deliver/qa/`.

- 16:9 master with true motion blur (`out/film.mp4`), 9:16 and 1:1 variants from the same timeline, poster (final frame).
- For every mp4, an `<name>-sfx-only.mp4` copy (effects only, no music) via `scripts/audio/sfx-only.py` from the score stems, effects at the same level as the full mix.
- Every file passes `probe.py` at its own spec.
- `README.md` in the film folder: the idea, the device, how to render, the file list, the numbered copy.
