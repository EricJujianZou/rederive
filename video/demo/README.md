# rederive demo film

A 28 s product video on a white canvas: rederive walks a user through Linphone's NAT traversal by making them design it. The problem appears in a bubble, the user types a design, the drawing beneath draws it live, a constraint breaks it, the user revises, and when the direct path works the tool names it (ICE). One continuous take; the only cut is the iris from the ∂ avatar into the end card.

- Idea: you design the code yourself, it breaks, you fix it, then it gets its name.
- Device: the packet, one ink dot. Dropped at the router (bar 3), detoured through the server (bars 5-8), direct and green (bar 10).
- Grid: 1920x1080 at 60 fps, 120 BPM, 14 bars plus a 60 f tail (`src/timeline.ts`).
- Re-layouts: `Film9x16` and `Film1x1` share the timeline; `src/ui/layout.ts` places everything per frame size.

## Render

```
npm run check                 # tsc, lint, grid
npm run cues && npm run audio # out/cues.json, public/audio/soundtrack.wav
bash scripts/render.sh Film out/preview.mp4 --preview --audio public/audio/soundtrack.wav
bash scripts/render.sh Film out/film.mp4 --blur --audio public/audio/soundtrack.wav
bash scripts/deliver.sh out/film.mp4 --variants Film9x16,Film1x1
```

Deliverables land in `deliver/`: `Film.mp4` (16:9), `Film9x16.mp4`, `Film1x1.mp4`, `poster.png`, with QA in `deliver/qa/`.
