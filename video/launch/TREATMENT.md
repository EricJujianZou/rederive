# TREATMENT: rederive launch film

**Spec:** `1920x1080@60, 28s, 120BPM, audio: synthesized` · **Format:** launch film · **Engine:** Remotion
**Product:** a skill for coding agents that teaches a codebase by making the user design it, one withheld answer at a time · **Viewer:** engineers on X and Instagram, muted in a feed first
**Assumptions:** 1 bar = 2 s = 120 f at 60 fps; 14 bars, tail inside bar 14; dark stage; the hook and the rederive session share one chat container (reskinned, not two separate apps), so the film never cuts to an unrelated piece of software.

## 1. Inventory
| List | Entries |
|---|---|
| Name | rederive: to arrive again at a known result by your own derivation, the way a textbook makes you re-derive a formula instead of handing it to you. Gives the mark (∂, partial derivative) and the device (a derivation is a chain of steps, each one forced by the last) |
| Non-obvious behaviour | Unlike an explainer, it never states the answer. It poses the problem, adds one real constraint when the user's design breaks, and only names the result once the user's revision matches it |
| Value sentence | Before: you ask the AI to explain your own code and keep none of it. After: you propose the design yourself, a constraint breaks it, you fix it, and you keep what you built it against |
| Verbs (10) | ask, answer, break, constrain, retry, revise, hold, recognise, name, keep |
| The product's objects | the chat bubble, the ∂ avatar beside every rederive turn, the problem statement with no solution words, the user's typed answer, the constraint line, the bolded decision name in the payoff |
| The number | one function to one list of functions (the real middleware chain), not a metric: the product has no dashboard or count to flash |
| Pain scene | a video interview, the interviewer's cursor pointing at one function in the candidate's own project, and the candidate's reply box sitting empty |
| Category clichés (banned here) | terminal code rain, a glowing neural-net graphic, a sparkle standing in for "AI", a stock handshake photo, a progress bar climbing to 100% for no reason |
| World sound | a quiet mechanical keyboard, one soft tick per typed character, a single low chime when a design resolves |

## 2. Three concepts
| Lens | Logline (≤ 15 words) | Device | Ownership | Deletion | Specificity | Muted | Poster | Score /15 |
|---|---|---|---|---|---|---|---|---|
| (a) Verb made literal | He cannot explain his own code until the question forces him to design it again. (14) | the ∂ avatar beside every rederive turn, growing into the lockup mark | pass: the mark is the brand's own, used nowhere else | pass: remove the Q&A and only an interview and a logo are left, which is not the product | pass: shows the actual mechanic, withholding plus one real constraint, not a generic "AI tutor" claim | pass: the avatar and the bolded decision name read without sound | strong: the avatar mid-growth, mid-frame | 14 |
| (b) Pain made visible | You asked the AI to explain your own code, and none of it stayed. (12) | a muted, greyed-out "explained" bubble the user has already forgotten | fail: true of any tutor or summarizer, not specific to rederive's method | pass | fail: never shows the withhold-and-constrain mechanic, undersells the product | pass | weak: a faded bubble is not a strong still | 8 |
| (c) Formal device | One chat thread turns a dreaded interview into the moment he understands his own code. (15) | the one chat panel, never recast as a different app, that collapses into the URL at the end | pass: tied to our own collapsing-panel end card | pass | pass | pass | strong: the collapsed panel as a pill around the link | 14 |

**Chosen:** (a) · **Grafted:** from (c), the grammar: the interview and the rederive session share one chat container (reskinned avatar and palette, never a hard cut to a different piece of software), and that same container collapses into the URL pill at the end. From (b), only the feeling, not a beat: the empty reply box in the hook already says "nothing stayed" without adding a line for it.

## 3. Concept
- **Idea (≤ 8 words):** It makes you design the code, not explain it.
- **Device:** the ∂ avatar that sits beside every rederive message. It is the brand's own mark from frame one (small, in the chat chrome), and at the lockup it is the only thing that scales up, loses its chat-bubble badge, and becomes the standalone mark beside the wordmark.
- **Grammar:** one chat container runs the whole film. The interview and the rederive session are the same component, reskinned: a flat grey avatar and a colder, slightly desaturated version of the stage for the interview; the real ink, paper and green accent arrive the moment rederive's avatar appears. No other app, window or UI system appears.
- **Logline (≤ 15 words):** He cannot explain his own code until the question forces him to design it again. (14 words)
- **Personality:** exact, patient, quietly confident → Geist Variable at 560-650 for display (lowercase wordmark, as supplied), Geist Mono Variable for UI chrome and the typed command, dark stage (`#0D1117`), cool neutrals (GitHub's own dark palette, already the brand's), motion that holds still while a message is read and moves once, decisively, when a design resolves.
- **Mark:** supplied (`assets/logo.png`), not explored from scratch; recoloured to the paper token and used both as the small chat avatar and the large lockup mark, so it is one asset at two scales, never redrawn.
- **Accent:** `#3FB950` means "resolved, you got it", the exact green GitHub's own dark diff view uses for an added, correct line (green family; checked on `#0D1117` at 7.45:1 with `palette.py`) · **Stage:** dark · **Luminance plan:** a colder, slightly dimmed ink during the interview (no accent present) → full ink/paper/accent the moment rederive's avatar appears → the accent flashes once, on the payoff → the lockup holds on plain ink and paper, the accent appearing only as a thin resolved line under the tagline.
- **Signature move:** the glyph iris (`tr-iris-from-glyph`), a circle that grows from the ∂ avatar: full-frame swallow at the hook-to-session cut (open), a small pulse that does not leave the shot at the payoff (middle), and a full-frame grow that becomes the end card's ground (close).
- **Easing characters:** `cam` for the two pull-backs (hook settle, payoff reveal), `whip` for the container morphs (interview panel into session panel, session panel into the URL pill), `smooth` for every fade and palette shift.
- **Sonic signature:** one low, tuned chime (the tonic) every time a design resolves: once quietly under the naive answer (it does not resolve yet, so this chime is withheld, its absence is the point), once at the constraint, and the full, loudest version at the payoff.

## 3b. Drawn techniques
`<!-- pick.py --seed 456270156 --format launch --energy medium --seconds 28 -->`

| Pick (id) | Category | Beat # | How it is adapted to this concept and device |
|---|---|---|---|
| oh-cropped-word-pull-back | opening_hook | 1 | The hook opens cropped tight on the word "this" inside the interviewer's line, frame edge cutting the glyph, then pulls back over bar 1 to the full line in the chat bubble: "Walk me through this." |
| tr-subtract-reveal | transition | 2-3 | Window-minimize variant: the interview panel shrinks into the corner where the candidate's cursor sits, uncovering the rederive session panel that was already sitting behind it at full size |
| tr-iris-from-glyph | transition | 3, 9, 13-14 | The signature move: a circle grows from the ∂ avatar to swallow the frame at the hook-to-session cut (3), a small pulse that stays inside the shot at the payoff (9), and a full-frame grow that becomes the lockup's ground (13-14) |
| pd-terminal-burst-output | product_demo | 4-8 | Adapted from a raw terminal to the chat panel: the problem, the naive answer, the constraint and the better answer each appear as one whole message on its own frame (never typed character by character once sent), in uneven bursts, with the newest message in paper white and older ones relaxing to mute grey |
| mi-spinner-to-check | micro_interaction | 4, 6, 9 | Before each rederive message, a small dashed ring spins beside the avatar for a beat, then resolves: a plain settle before the problem and the constraint, and a bright accent settle at the payoff, because that is the one that is actually "done" |
| ui-container-morph | ui_choreography | 3 | The interview panel's rect tweens into the session panel's rect (same mounted element, new corner radius and avatar), so there is no navigation cut to explain the switch |
| cam-detail-first-pullback | camera | 9-10 | Tight on the bolded decision name ("middleware chain") the instant it lands, then the camera pulls back over bar 10 to show the whole exchange at once |
| cl-context-palette-shift | color_and_light | 1-3 | The interview act sits in a colder, slightly dimmed version of the stage with no accent present; the moment rederive's avatar appears (bar 3), the full ink, paper and green accent arrive |
| le-clone-stack-morph | logo_and_end_card | 12-14 | Ban-safe variant only (plain 1.5 px stroke echoes, one tonal step, no rim light): the session panel collapses into a slim pill around the URL as the lockup assembles |
| ty-reading-order-exit | typography_motion | 14 | The end-card tagline clears word by word in reading order as the tail plays out, rather than fading all at once |

**Rerolls and drops:** opening_hook rerolled twice (`oh-pile-up-freeze-turn`, then `oh-macro-scramble-snap-out`): both assume the pain is volume or a flashy metric, and rederive's pain is a single question the candidate cannot answer, not a pile or a number; `oh-cropped-word-pull-back` was the second reroll and is used. `dn-bar-sweep-lit-caps` dropped: rederive has no chart, volume or histogram data to show, so a bar sweep would be decoration with no product truth behind it.

## 4. Arc and device path
- **Arc:** hook 1-2 → turn 3 → proof 4-8 → payoff 9-10 → promise 11-12 → lockup 13-14 (incl. tail).
- **Device path:** a flat grey avatar in the interview bubble (hook, no accent) → the interview panel shrinks into the corner, uncovering the session panel already behind it (turn) → the glyph iris grows from the newly-arrived ∂ avatar to swallow the frame, carrying the cut → the ∂ avatar sits beside the problem, the naive answer gets none (it is the user's bubble, no avatar), the constraint, and the better answer (proof) → a small iris pulse on the avatar as the payoff's decision name bolds in green (payoff) → camera pulls back to the whole exchange, the session panel begins to shrink (promise) → the panel finishes collapsing into a pill around the URL while the avatar separately scales up and loses its chat badge to become the standalone mark beside the wordmark, the glyph iris growing one last time to become the end card's ground (lockup).

## 5. Beat sheet
| # | Bars | Time | Beat | Picture | Copy (words) | Sound | Device |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 0:00-0:02 | hook | frame 0: cropped tight on "this", glyph cut by the frame edge, already drifting; pulls back over the bar to the full interviewer line in a chat bubble | "Walk me through this." (ui, 4) | a quiet room tone, one keyboard tick per character as the line finished typing (already done at f0), a soft intake of breath-timed pad | flat grey avatar beside the interviewer's bubble, no accent anywhere |
| 2 | 2 | 0:02-0:04 | hook | holds on the candidate's empty reply box, cursor blinking, nothing sent; a beat of true silence | - | the pad holds, then cuts to near-silence for the last 15 f | the empty reply box itself (no avatar yet on the candidate's side) |
| 3 | 3 | 0:04-0:06 | turn | the interview panel shrinks into the corner where the cursor sits (tr-subtract-reveal), uncovering the rederive session panel already behind it at full size; the ∂ avatar arrives and the glyph iris grows from it to swallow the frame; stage warms from cold to full ink/paper/accent | - | the shrink plays one soft mechanical fold; the iris grows on a rising tonal sweep that lands on the downbeat | the ∂ avatar's first appearance; the iris is the signature move's first use |
| 4 | 4 | 0:06-0:08 | proof | a dashed ring spins beside the avatar, resolves plain; rederive's problem lands whole, no solution words. The product is named here (chat header reads "rederive"), at bar 4 of 14, about a quarter in | "One function handles every request." (ui, 5) | the ring's spin is silent; the message lands with one soft tick | avatar beside the message |
| 5 | 5 | 0:08-0:10 | proof | the user's answer appears in the paper-coloured bubble, no avatar | "One big function with if statements." (ui, 6) | typed ticks at human speed, then a flat non-chime: this one does not resolve | no avatar on this bubble (it is the human's) |
| 6 | 6 | 0:10-0:12 | proof | the ring spins and resolves plain again; the constraint lands, camera pushes in 1.3x on the line as it breaks the naive answer | "Forty routes need it. Miss one, it's open." (ui, 9) | the low chime plays here too, but damped and short, a design that is not yet the real one | avatar beside the message; push-in is the proof's one hero move |
| 7 | 7 | 0:12-0:14 | proof | a held beat: the reply box sits with the cursor moving, thinking, no line sent yet (the one beat with no new text, so the revision reads as real work, not instant) | - | ticks start and stop twice, false starts | the empty reply box, now with history behind it |
| 8 | 8 | 0:14-0:16 | proof | the user's better answer lands, no avatar | "Put the check in one function every route calls first." (ui, 10) | typed ticks, then quiet | no avatar |
| 9 | 9 | 0:16-0:18 | payoff | the ring resolves bright (accent green) this time; the payoff lands, "middleware chain" bolds in green the instant it's said; camera holds tight on just that phrase (cam-detail-first-pullback begins); a small iris pulse on the avatar that stays inside the shot | "Yes, exactly. You rederived a middleware chain." (ui, 7) | the full chime, the loudest moment in the film, 60-65% in | avatar's brightest moment; iris pulse, the signature move's second use |
| 10 | 10 | 0:18-0:20 | payoff | the camera pulls back over the bar to show the whole exchange at once, problem through payoff, small and complete | - | the chime's tail rings out under a thinning pad | the full thread, device visible at both ends |
| 11 | 11 | 0:20-0:22 | promise | the session panel begins to shrink from its corners, unhurried; nothing new is said, the exchange just settles into something smaller and kept | - | pad thins further, a single sustained note | panel in motion, avatar untouched |
| 12 | 12 | 0:22-0:24 | promise | the panel keeps collapsing (le-clone-stack-morph, ban-safe echoes) toward a slim rectangle; the avatar detaches from its bubble position and begins to scale up, independent of the shrinking panel | - | a rising tone tracks the avatar's scale | avatar separating from the panel it came from |
| 13 | 13 | 0:24-0:26 | lockup | the panel finishes as a pill around the URL; the avatar's glyph iris grows one last time and becomes the end card's ground; the standalone mark and the lowercase wordmark "rederive" settle together | "rederive" (wordmark, ui) | the last chime rings and starts to decay | the iris's third and final use, now the frame's own ground |
| 14 | 14 | 0:26-0:28 | lockup | holds; the tagline clears in behind the lockup, reading-order exit timed to the tail; the URL pill sits below, readable for the full bar | "Learn any codebase by re-designing it yourself from first principles." (10) + `github.com/EricJujianZou/rederive` (ui) | tail decays to digital silence by the last frame | mark and wordmark, still, at rest |

## 6. Copy
| Line | Words | Where | Callback role |
|---|---|---|---|
| Learn any codebase by re-designing it yourself from first principles. | 10 | 14 (end card) | resolution: answers the hook's "walk me through this" with what to do instead, without repeating it |
| **Total (film's own voice)** | **10 / 35** | | |

UI-kind lines (the product's own text: the chat, the typed command, the URL; exempt from the word budget per `references/copy-and-type.md` §1, but listed here in full so Eric can approve or change them):
1. "Walk me through this." (interviewer, bar 1)
2. "One function handles every request." (rederive, bar 4, the problem, no solution words)
3. "One big function with if statements." (user, bar 5, the naive answer)
4. "Forty routes need it. Miss one, it's open." (rederive, bar 6, the constraint that breaks it)
5. "Put the check in one function every route calls first." (user, bar 8, the better answer)
6. "Yes, exactly. You rederived a middleware chain." (rederive, bar 9, the payoff)
7. "rederive" (the wordmark, bar 13)
8. "github.com/EricJujianZou/rederive" (the end card, bar 14)

Checks: the film's own line is 10 words (one line, one idea); every UI line is ≤ 10 words and ≤ 2 lines; no stock phrasing; no line uses "lands," "the same shape," "the machine," an em or en dash, or a mirrored construction.

## 7. Final frame (the poster)
The ink stage (`#0D1117`), ground in the last glyph-iris's soft green-black gradient (dithered, no banding). The ∂ mark, in the paper token, sits left of the lowercase wordmark "rederive" in Geist, the lockup centred on an eye line a little above frame centre. Below it, in Geist Mono at the secondary size, the tagline, and below that, the URL in a thin pill with a 1.5 px hairline edge. Nothing else is in frame.

## 8. Gate
- [x] logline 14 words, one idea
- [x] ownership, deletion and specificity pass (§2): the device is the brand's own mark; deleting the Q&A leaves no product; the proof is the actual withhold-and-constrain mechanic, not a generic tutor claim
- [x] word total: film's own voice 10 words, well inside the 35 cap; every UI line ≤ 10 words, ≤ 2 lines
- [x] the device (the ∂ avatar) appears in every beat row where rederive speaks, and its last link is the mark
- [x] every drawn technique is placed in §3b or dropped with a reason; two rerolls used and recorded
- [x] the final frame contains the mark and the name
- [x] no hard ban: one sans (Geist) plus a mono, a green accent on a dark cool stage, no glow or glass, overshoot nowhere in the film (every landing uses a dead stop, not a spring overshoot); the one italic-feeling shape (the ∂ mark) is the supplied brand exception, recorded in BRIEF.md
