# rederive demo film: Express

A 38 s product video on a white canvas. It opens on the one-line proposition, the user runs `/rederive express`, and rederive walks them through where Express puts the login check by making them design it. Each turn is a numbered problem that ends in a question; the user types an answer, the drawing beneath draws it, a constraint breaks it ("But here's the problem:", "That could work, but consider this new problem:"), and when the third design matches the real one the tool names it: the middleware chain. One continuous take; the only cut is the iris from the ∂ avatar into the end card.

- Idea: you design it, it breaks, you fix it, then it gets its name.
- Device: the request, one ink dot. It passes a lock (bar 6), slips into the unguarded route (bar 7), passes the gate (bar 10), bounces without a token (bar 11), steps through the chain and lands green (bar 16).
- Grid: 1920x1080 at 60 fps, 120 BPM, 18.5 bars plus a 60 f tail (`src/timeline.ts`).
- Sound: the bed is `scripts/audio/score.py`'s synth in D major, climbing a scale degree on each answer and flat under each constraint; every physical sound is a take from an earshot kit (`audio/kit.json`, rendered to `audio/kit/`), placed on its measured onset. `score.json`'s `kit` block switches that on; an event's `role` picks the kit voice.
- 16:9 only: no 1:1, and 9:16 only when asked.

## Render

```
npm run check                 # tsc, lint, grid
npm run kit                   # audio/kit/ from audio/kit.json (earshot)
npm run cues && npm run audio # out/cues.json, public/audio/soundtrack.wav
bash scripts/render.sh Film out/preview.mp4 --preview --audio public/audio/soundtrack.wav
bash scripts/render.sh Film out/film.mp4 --blur --audio public/audio/soundtrack.wav
bash scripts/deliver.sh out/film.mp4
```

Deliverables land in `deliver/`: `Film.mp4` (16:9) and `poster.png`, with QA in `deliver/qa/`.
