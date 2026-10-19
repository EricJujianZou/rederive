# rederive launch video: brief

Spec: 1920x1080@60 master, 25 to 30 s, 120 BPM, audio: synthesized (score plus UI effects), -14 LUFS. Plus 9:16 (1080x1920, Instagram feed9x16 safe zones) and 1:1 (1080x1080) re-layouts from the same timeline.

- Product: rederive, an open source skill for coding agents (Claude Code plugin, also Codex, Cursor, Gemini CLI and others). It teaches you a codebase by making you design it yourself. It finds the decisions that shaped the code and gives you each one as a problem, adding the real constraints one at a time. It never tells you the answer. When your design reaches the real one it says so by the general name engineers know ("you rederived a middleware chain").
- Who it is for: people who built a project with AI and cannot explain it, people preparing to walk through their own work in an interview, and people who want to learn how a famous repo (Express, Redis) works.
- The smart part, which the film must show: unlike an explainer, it withholds the answer. The user proposes a design, the skill adds one constraint that breaks it, the user fixes it, repeat, until the user arrives at the real design and the skill names it. The chat in README.md (assets/session-dark.png and session-light.png) is the real session shape: a problem stated without solution words, the user's answer, a constraint, a better answer, "yes, exactly, you rederived X".
- Where it runs: X (the launch post, 16:9 or 1:1 autoplaying muted in the feed) and an Instagram reel (9:16, muted autoplay with captions burned in).
- Install line for the end card: `/plugin marketplace add EricJujianZou/rederive` is too long for a card. Use the repo name `github.com/EricJujianZou/rederive` or `npx skills add EricJujianZou/rederive`.
- Engine: Remotion 4.0.529. Reuse node_modules from /home/ubuntu/projects/watnow/video/reel/node_modules with --link-modules.

## Viral format rules (from docs/research in content-machine, pulled 2026-10-18)

These come from how taste-skill (99k stars) and mattpocock/skills (296k stars) launched on X, and from the reel hook research. Follow them.

1. Open on the problem or the payoff, never on the logo or "Introducing". The winning launch posts stated the problem first ("LLMs default to the probable, that is where slop comes from"), then the fix, then the link. The strongest hook formats that need no borrowed footage: (a) open on the payoff already on screen, then show how; (b) before and after split, the generic version next to the one the skill produces; (c) face to camera, which is out here.
2. The demo is the product actually running: a real session, real agent chrome, real text. Cursor's and Matt Pocock's viral clips were raw workflow recordings, not motion graphics around a claim. The film should read as "this is what happens when you type /rederive".
3. The problem the viewer feels: you built it with AI and cannot explain it, and the interviewer says "walk me through this". Or: you asked the AI to explain the code and it did, and you remember nothing.
4. One idea. The viewer should leave able to say "it makes you design the code yourself instead of explaining it".
5. Reads fully muted. Every feed variant has the key lines on screen.
6. End card carries the repo link, readable 1.7 s or more.

## Brand (supplied, the brand wins)

- Name: rederive, all lowercase. Mark: a partial derivative sign (∂), see assets/logo.png. Wordmark set in Geist, see assets/banner-dark.png and banner-light.png. Take the exact colours from those PNGs. Dark stage preferred (the README's dark variant is the one X link cards show, assets/social-preview.png).
- One accent only, from the assets. If the assets have no accent, pick one from the allowed families with a stated reason (green for "yes, you rederived it" is the natural meaning).

## Writing rules from Eric (hard bans, on-screen and in every file)

No em or en dashes anywhere. No two sentences built on the same frame with swapped nouns. No clipped dramatic fragments ("That's the whole thing."). No tagline pairs ("Five rounds, one question."). No triples. No "the machine", "lands", "the same shape". No dramatic adverbs (quietly, seamlessly). Subject first, then verb, then object. Plain sentences a student would say to a friend.

## Hard bans (cinetic)

No eyebrow labels, stacked taglines, "Introducing", text walls or filler text. No serif or italic. No orange, amber, beige, cream, neon, purple, violet, indigo, multi-hue gradients or glass. No emoji, stock icons, sparkles, particles, confetti, lens flares, code rain. No bouncy overshoot except on a landing.

## Deliverables

- out/film.mp4 (16:9 master, motion blurred), 9:16 and 1:1 variants, poster.
- For every video file, a second copy with the sound effects only and no music, named `<name>-sfx-only.mp4`, made with cinetic's scripts/audio/sfx-only.py from the score stems, effects at the same level as the full mix.
- README.md in the film folder: the idea, the device, how to render, the file list.
