# rederive demo film v2: Linphone (storyboard, awaiting approval)

16:9 only (1920x1080, 60 fps, 120 BPM, bar = 2 s). 16 bars + 1 s tail = 33 s. One continuous take; the only cut is the iris into the end card.

Changes from v1: an intro that states the product line before any example; the example is named on screen (repo card, slash command, header); each rederive turn is framed as a numbered problem that ends in a question; the two constraints open with "But here's the problem:" and "That could work, but consider this new problem:"; one sound bed that follows the state of the drawing instead of one effect per event.

| # | Bar | Time | Picture | Copy (verbatim) | Sound |
|---|---|---|---|---|---|
| 1 | 1 | 0:00-0:02 | White. The ∂ mark draws in at centre. The product line types beneath it, one word at a time. | Learn any codebase by re-designing it yourself from first principles. | bed enters on the tonic; one soft key per word |
| 2 | 2 | 0:02-0:04 | The line holds. A composer rises from the bottom; the user types the command and presses send. | /rederive linphone | keys, one send tap |
| 3 | 3 | 0:04-0:06 | A repo card lands under the command: name, one-line description, language. The card shrinks into the header pill top-left. The product line and composer clear. Two phones slide in from the edges, routers draw in. | BelledonneCommunications/linphone-desktop · open source SIP phone · C++ / header: rederive · linphone | card land; the bed opens to a second voice |
| 4 | 4 | 0:06-0:08 | A small label "PROBLEM 1 OF 3" pops above the avatar. The ring spins, then the problem types. It ends on a question, so the composer placeholder reads as an answer box. | Problem 1 of 3 / Two phones sit on two home networks. How does phone A's voice reach phone B? | the bed holds; keys per word; a short rise into the question mark |
| 5 | 5 | 0:08-0:10 | The user types the first answer and sends it. A straight arrow draws A → B. | Send the packets straight to the other phone. | keys; the bed steps up one scale degree as the arrow completes |
| 6 | 6 | 0:10-0:12 | Packets leave A, cross, hit router B and drop (squash, fall). The arrow turns dashed. Camera pushes 1.4x on router B. Label flips to "PROBLEM 2 OF 3". The constraint types. | Problem 2 of 3 / But here's the problem: phone B's router drops packets from addresses it never contacted. | the stepped-up note cuts out with the drop; a dull thud; the bed goes flat |
| 7 | 7 | 0:12-0:14 | Camera eases back. The user types the second answer. | Relay every packet through a server. | keys |
| 8 | 8 | 0:14-0:16 | Send. A server tile drops in at centre-top. Lines draw A → S → B. Packets flow through the server; both phones show a waveform. | | tile land; the bed steps up again but through a filter, with a slower pulse: the detour is audible |
| 9 | 9 | 0:16-0:18 | The detour stretches; a "+80 ms" label and bar grow on it. Label flips to "PROBLEM 3 OF 3". The second constraint types. | Problem 3 of 3 / That could work, but consider this new problem: every call now detours through your server. | the filtered pulse slows further; keys |
| 10 | 10 | 0:18-0:20 | The user types the third answer, with one pause mid-line, and sends. | Use the server only to swap addresses, then send direct. | keys; a breath of near-silence after send |
| 11 | 11 | 0:20-0:22 | Two address chips fly from the server to the phones; the server fades. Both phones send at once; the routers open; the packets cross at centre and land; the line turns green; one specular sweep. Camera pushes 1.3x. | 203.0.113.9 / 198.51.100.4 | two soft lands; the filter opens and the bed resolves to a clean tone on the landing (the drop) |
| 12 | 12 | 0:22-0:24 | Giant ICE punches in over the drawing, blur-swaps into the payoff bubble. "rederived" bold, "ICE" green. | You successfully rederived ICE. Linphone does exactly this. | one chime on the tonic; the bed sustains |
| 13 | 13 | 0:24-0:26 | Hold on the payoff line. Camera eases back. The drawing relaxes to mute. The iris seed grows on the avatar. | | breakdown, bed thins |
| 14 | 14 | 0:26-0:28 | The iris opens from the avatar into the ink end card. One ∂ grows to the lockup, the wordmark locks beside it. | rederive | music stops on the bar line; one resolved note |
| 15-16 | 15-16 | 0:28-0:32 + tail | Tagline and URL rise; a slow 16% push to the last frame. | Learn any codebase by re-designing it yourself from first principles. / github.com/EricJujianZou/rederive | tail |

## Sound design

- One bed, four states, driven by the drawing: silent until the straight arrow (bar 5), cut by the drop (bar 6), filtered and slow through the relay (bars 8-10), clean on the direct line (bar 11), resolved at the payoff (bar 12).
- Each user answer lifts the bed one scale degree. Each constraint holds it flat. The payoff lands the tonic. The exchange reads as a progression, not a sequence of pings.
- Keys sound once per word at low level. Sends, lands and the drop come from earshot's code-rendered bank instead of the in-house synth.
- Every render goes through earshot's critique for sync and smoothness before QA.
