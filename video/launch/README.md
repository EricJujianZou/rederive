# rederive launch film

A 28 second launch film for rederive, an open source skill for coding agents. It teaches a codebase by making the user design it themselves instead of explaining it to them.

## The idea

A candidate cannot explain his own code in an interview until the question forces him to design it again. The film opens on that moment, then shows the actual product running: a chat session where rederive poses a problem with no solution words, lets the candidate's naive answer break on a real constraint, and only names the result once his revised answer matches it.

## The device

A ∂ avatar sits beside every message rederive sends, from the first frame it appears to the last. At the turn, a circle grows from that avatar and swallows the frame, carrying the cut from the cold interview into the real session. The same circle pulses once at the payoff and floods the frame once at the end, where the avatar detaches from the chat panel, scales up, and becomes the standalone mark beside the wordmark.

## On-screen copy

Lines 1 through 6 are the product's own chat text. Line 7 is the wordmark. Line 8 is the end card's URL. Line 9 is the film's own one line, the only sentence that is not the product talking.

1. "Walk me through this." (the interviewer, bar 1)
2. "One function handles every request." (rederive, bar 4, the problem, no solution words)
3. "One big function with if statements." (the candidate, bar 5, the naive answer)
4. "Forty routes need it. Miss one, it's open." (rederive, bar 6, the constraint that breaks the naive answer)
5. "Put the check in one function every route calls first." (the candidate, bar 8, the revised answer)
6. "Yes, exactly. You rederived a middleware chain." (rederive, bar 9, the payoff; "middleware chain" bolds in the accent green)
7. "rederive" (the wordmark, bar 13)
8. "github.com/EricJujianZou/rederive" (the end card, bar 14)
9. "Learn any codebase by re-designing it yourself from first principles." (the end card's own line, 10 words)

## How to render

Everything reads from `src/timeline.ts`, the one file that sets the film's timing. A change there, or to any act, needs these steps in order:

```bash
npm run check                 # type check, lint, grid check
npx tsx scripts/export-cues.ts
npm run audio                 # rebuilds public/audio/soundtrack.wav from the cues

bash scripts/render.sh Film out/preview.mp4 --preview --audio public/audio/soundtrack.wav
bash scripts/render.sh Film out/film.mp4 --blur --audio public/audio/soundtrack.wav

bash scripts/render.sh Film9x16 out/film-9x16.mp4 --audio public/audio/soundtrack.wav
bash scripts/render.sh Film1x1 out/film-1x1.mp4 --audio public/audio/soundtrack.wav

bash scripts/deliver.sh out/film.mp4 --variants Film9x16,Film1x1 --out-dir deliver --audio public/audio/soundtrack.wav
python3 scripts/audio/sfx-only.py --stems out/stems --master public/audio/soundtrack.wav --out public/audio/sfx-only.wav
```

The 16:9 master takes true motion blur (`--blur`); the 9:16 and 1:1 re-layouts hold a wide, gently breathing frame throughout (no move in either one passes 12 pixels per frame), so they render sharp. The `<name>-sfx-only.mp4` files each come from muxing `public/audio/sfx-only.wav` onto the already-rendered picture with `-c:v copy`, so they carry no music, only the effects, at the level they have in the full mix.

## File list

All under `deliver/`. QA reports are in `deliver/qa/`.

| File | Spec | What it is |
|---|---|---|
| `Film.mp4` | 1920x1080@60, 28.0s | The 16:9 master, true motion blur, full mix |
| `Film-sfx-only.mp4` | 1920x1080@60, 28.0s | The same picture, effects only, no music |
| `Film9x16.mp4` | 1080x1920@60, 28.0s | The Instagram-reel re-layout, full mix |
| `Film9x16-sfx-only.mp4` | 1080x1920@60, 28.0s | The same, effects only |
| `Film1x1.mp4` | 1080x1080@60, 28.0s | The square re-layout, full mix |
| `Film1x1-sfx-only.mp4` | 1080x1080@60, 28.0s | The same, effects only |
| `poster.png` / `poster.jpg` | 1920x1080 | The final frame |

`deliver/qa/manifest.json` has every delivered file's probe facts. `forensics-*.json` and `av-*.json` are the per-file pixel and sound checks; `layout-Film9x16.json` and `layout-Film1x1.json` are the safe-area and text-size audits for the two re-layouts.

## What is still open

The 9:16 and 1:1 re-layouts shrink the chat panel to 0.72 of its 16:9 size so it fits the narrower frame without any text running past the safe margin. That leaves the chat bubble and URL text at 19 to 22 pixels on screen, under cinetic's own 28 to 32 pixel target for a phone-width frame watched up close. Hitting that target needs the chat panel's own row layout redesigned narrower for these two formats, not just rescaled, which this pass did not have time for.

The two re-layouts also hold a plain, gently breathing frame rather than the master's tuned camera moves. The hook's cropped-word pull-back, the proof act's push-in onto the constraint line, and the payoff's tight shot on the bolded decision name were each tuned in 1920x1080 pixel math across two critique rounds. Redoing that tuning for a frame two-thirds as narrow was out of scope for this pass.
