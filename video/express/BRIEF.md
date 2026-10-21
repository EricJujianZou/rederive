# rederive demo film: Express (brief)

**Spec:** `1920x1080@60, 38s, 120BPM, audio: synthesized bed + earshot kit effects` (-14 LUFS). 16:9 only: no 1:1, and 9:16 only when asked. Built at xhigh effort (cinetic Step 0).

- Product: rederive, an open source skill for coding agents. It teaches a codebase by making the user design it: it poses the problem a part of the code solves, the user proposes a design, a real constraint breaks it, the user revises, and when the revision matches the real design the tool names it.
- Repo on screen: Express, the Node.js web framework. The decision shown: where the login check lives. Per route handler (forty routes, one missed), one function before any route (then logging, body parsing and rate limits want the same spot), a list of functions that each do their job and call the next: the middleware chain.
- Who it is for: engineers on X and Instagram, muted in a feed first.
- Direction from Eric (2026-10-20): open on the one-line proposition, then make the example unmistakably Express (the slash command, a repo card, the header). Frame every turn as a numbered problem that ends in a question, and open the constraints with "But here's the problem:" and "That could work, but consider this new problem:". The drawing must show what each answer does. The sound must follow the drawing, not decorate it. Keep the ending where the avatar irises into the end card.
- Why 38 s and not the storyboard's 33 s: the three product bubbles run 18 to 19 words each and need their reading time (0.6 s plus 0.1 s a word after they finish streaming). Everything else is as storyboarded.
- End card practical fact: `github.com/EricJujianZou/rederive`, readable at least 1.7 s.
- Engine: Remotion 4.0.529, node_modules linked from video/demo.

## Brand supplied
- Mark: the ∂ glyph in assets/logo.png, traced in src/brand/Mark.tsx. It is cursive by nature; the italic ban does not apply to it (`cinetic:brand-supplied mark`).
- Wordmark: lowercase "rederive" in Geist (assets/banner-light.png).
- Stage: light. Ink #0D1117 from the brand, paper white, GitHub's light-theme green #1A7F37 as the one accent, meaning "resolved: your design matches the real one". It appears on the chain when the request reaches its handler (bar 16), on "middleware chain" in the payoff line, and as the iris seed.
- Product chrome on screen (not kickers): the "Problem n of 3" step line inside the rederive bubble, the header pill, the repo card, the route list, the routes counter.

## Hard bans (from cinetic; critics check these word for word)
- Words: eyebrow or kicker labels; stacked taglines; "Introducing"; text walls; filler text, decorative mono captions, fake metrics, lorem ipsum.
- Type: serif; italic or oblique (except the supplied ∂ mark). One sans (Geist) plus a mono for routes, the counter and the install line.
- Colour: orange, amber, beige, cream, tan, sand; neon, glows, bloom, halos; purple, violet, indigo; multi-hue gradients; glassmorphism. No red: the breach reads in ink (a thick outline, a thud), so the one green keeps its meaning.
- Decoration: emoji and stock icons; sparkles for "AI", particles, confetti, lens flares, code rain; bouncy overshoot on anything that is not landing.
- Eric's writing bans apply to every on-screen word: no parallel sentence pairs, no clipped dramatic fragments, no tagline pairs, no triples, no em dashes, subject first.
