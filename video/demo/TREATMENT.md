# TREATMENT: rederive demo film

**Spec:** `1920x1080@60, 28s, 120BPM, audio: synthesized` · **Format:** product video, demo length (14 bars + 60 f tail) · **Engine:** Remotion
**Product:** a skill for coding agents that teaches a codebase by making you design it yourself · **Viewer:** engineers on X and Instagram, muted in a feed first.
**Reference note:** Muse launch film (recollected, not fetched): flat white stage, redrawn product rather than capture, captions popping in beside the element they describe, one canvas the camera moves over, light upbeat bed, ends on the wordmark on white. Taken: the white canvas, bubbles beside the thing, one continuous take, light bed. Left: pastel multi-accent (one green here), 60-90 s length (28 s here).

## 1. Inventory
- Name: rederive, to arrive at a known result by your own derivation. Mark ∂ (supplied).
- Non-obvious behaviour: unlike an explainer it never states the answer. It poses the problem, lets your design break on a real constraint, and names the result only when your revision matches the real code.
- Objects: the problem bubble (∂ avatar), your typed answer, the design drawn live (phones, routers, server, packets), the constraint, the bolded name.
- The decision on screen: Linphone's NAT traversal. Two phones behind home routers; straight send is dropped; relay works but detours; swap addresses via the server then send direct (ICE).
- Pain: you built it with AI (or you are learning a repo) and cannot explain why it is built that way.
- Category clichés banned: terminal, code rain, neural graphic, sparkles, a progress bar.

## 2. Concepts
- (a) Verb made literal: the design is drawn on the canvas as you type it, and the constraint physically breaks the drawing (a packet hits the router and drops). Owned: only rederive makes you draw the design before it names it. **Chosen.**
- (b) Pain made visible: the interview blank. Dropped by Eric (no interview hook).
- (c) Formal: one canvas, one continuous take, the chat lives on the canvas beside the diagram, the ∂ avatar ends as the mark via an iris. **Grafted** into (a).

## 3. Concept
- Idea: you design it, it breaks, you fix it, then it gets its name.
- Device: the packet, one ink dot that is the user's design in motion. It is dropped at the router (bar 3), detours through the server (bars 5-6), crosses direct and turns green (bar 9), and its last position seeds the iris that becomes the ∂ lockup.
- Accent #1A7F37 means "resolved: your design matches the real one". It appears only when the direct path works (bar 9), on "ICE" (bar 10) and nowhere on the end card except the mark's seed.
- Stage: white paper (#FFFFFF, tinted neutrals from palette.py), ink #0D1117 (brand). Geist 500/650. Bubble text 34 px at 1080p so it reads on a phone.
- Grammar: one canvas, one take. The ∂ bubble sits above the diagram, the composer below it; a sent answer becomes a bubble that docks bottom-right of the diagram; the previous bubbles leave as the next arrives. No hard cut until the iris.
- Signature move: the glyph iris from the ∂ avatar, used once at the end (the film has one cut).
- Easing: `out` for arrivals, `cam` for the two push-ins, `smooth` for fades, `contact` for the packet into the router, `snap` spring for the two landings (server tile drop, direct packets arriving).

## 3b. Drawn techniques
`<!-- pick.py --seed 2734980742 --format feature --energy high --seconds 30 -->` plus one reroll `<!-- pick.py --seed 2656838106 --category opening_hook -->`
| Pick | Beat | Adaptation |
|---|---|---|
| oh-quiet-intro-drop (reroll of oh-pile-up-freeze-turn: the pain is not volume) | 1-2, drop at 9 | plucks under the first bars; the kick lands when the direct packets arrive |
| pd-hard-swap-on-cause | 2, 5, 8 | each send press swaps the diagram state in one frame, then the drawing animates from it |
| lc-hub-spoke-diagram | 5-6 | the relay literally: server tile centre-top, both phones as spokes, packets orbit through it |
| mi-guide-cursor-hover-press | 2 | one cursor moment on the first send only; later sends on Enter |
| ty-blur-swap-rescale | 10 | giant "ICE" blurs out and re-forms as the start of the payoff bubble |
| cl-specular-sweep | 9 | one sweep along the settled green direct line |
| tr-iris-from-glyph | 12 | the ∂ avatar seeds the iris into the end card |
| dn-answer-card-bars | 6 | the "+80 ms" detour label with a small bar, the one number in the film |
| ui-clutter-pileup-strip | dropped | no overload story here |
| ui-discard-into-bin | dropped | comic tone, and both landings are spent |
| cam-zoom-out-hop | dropped | bubbles replace in place, there is no second area to hop to |

## 4. Arc
hook 1 → proof 2-9 (propose, break, propose, break, propose, works) → payoff 10 → promise 11 → lockup 12-14.
Device path: packet dropped at router (3) → packet detours via server (5-6) → packet goes direct and turns green (9) → the green dot settles on the ∂ avatar and irises to the end card (12).

## 5. Beat sheet (bar = 2 s)
| Bar | Time | Picture | Copy | Sound |
|---|---|---|---|---|
| 1 | 0-2 | frame 0: header pill "rederive · linphone" already in; phones slide in from both edges, routers draw in; ∂ problem bubble types | ∂: Two phones on two home networks need to send voice to each other. | plucks, keys per word |
| 2 | 2-4 | composer types the first answer; cursor presses send; the bubble docks; a straight arrow draws A→B | you: Send the packets straight to the other phone. | ticks, send tap |
| 3 | 4-6 | packets launch from A, cross, hit router B and drop (squash, fall); arrow turns dashed; camera pushes 1.4x on router B; ∂ constraint types | ∂: Its router drops packets from addresses it never contacted. | thud on the drop |
| 4 | 6-8 | camera eases back; composer types the second answer | you: Relay every packet through a server. | ticks |
| 5 | 8-10 | send; a server tile drops in centre-top (landing 1); lines draw A→S→B; packets flow through it; both phones show a waveform | | tile landing, soft |
| 6 | 10-12 | the path stretches as a "+80 ms" label and bar grow on the detour; ∂ constraint types | ∂: That works, but every call now detours through your server. | ticks |
| 7 | 12-14 | composer types the third answer, longer, with one pause | you: Use the server only to swap addresses, then send direct. | ticks |
| 8 | 14-16 | send; two address chips fly from the server to the phones; the server fades out | chips: 203.0.113.9 / 198.51.100.4 | two soft lands |
| 9 | 16-18 | both phones send at once; routers open; packets cross at centre and arrive (landing 2); the direct line turns green; sweep; camera pushes 1.3x | | the drop: kick on the arrival |
| 10 | 18-20 | giant ICE punches in, blur-swaps into the payoff bubble, "rederived" bold, "ICE" green | ∂: You successfully rederived ICE. Linphone does exactly this. | chime |
| 11 | 20-22 | camera eases back under the payoff line; the drawing relaxes to mute | | breakdown |
| 12 | 22-24 | the ∂ avatar's seed irises to white; mark scales up; wordmark locks | rederive | music stops on the bar, one resolved note |
| 13-14 | 24-28 | tagline and URL in; slow push; tail | Learn any codebase by re-designing it yourself. / github.com/EricJujianZou/rederive | tail |

Copy budget: 8 budgeted words (tagline + name). Bubble text, chips, header and URL are product strings (kind ui): 75 words.
Tests: deletion (remove the proof, the tagline alone is a claim: fails as intended, the proof is the film). Specificity (a simpler tutor would state ICE on bar 1; this one withholds it for nine bars). Feature-word (muted, a stranger sees a design drawn, broken and renamed: "it quizzes you into the design"). Logline: You design the code yourself, it breaks, you fix it, then it gets named. (14)
