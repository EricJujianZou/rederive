import React from 'react';
import { AbsoluteFill, getStaticFiles, Html5Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Act1 } from './acts/Act1';
import { Act2 } from './acts/Act2';
import { Act3 } from './acts/Act3';
import { Act4 } from './acts/Act4';
import { Act5 } from './acts/Act5';
import { C } from './brand/tokens';
import { Grain } from './fx/Grain';
import { Audit } from './lib/Audit';
import { FontGate } from './lib/FontGate';
import type { SafeSpec } from './lib/safe';
import { ACT } from './timeline';

/** Written by `npm run audio`. Renders are muted and scripts/render.sh muxes it with ffmpeg. */
export const SOUNDTRACK = 'audio/soundtrack.wav';

/** audit: draw and log the layout audit; safe: its safe zone (a lib/safe.ts preset or insets; default by aspect). */
export type FilmProps = { audit?: boolean; safe?: SafeSpec };

// The film: one Sequence per act, handing off on exact frames (each seam is designed inside the
// acts, not a crossfade here). hook -> turn -> proof -> payoff -> lockup (TREATMENT.md §4).
export const Film: React.FC<FilmProps> = ({ audit = false, safe }) => {
  const hasScore = getStaticFiles().some((s) => s.name === SOUNDTRACK);
  const frame = useCurrentFrame();
  return (
    <FontGate>
      <AbsoluteFill style={{ background: C.ink }}>
        <Sequence from={ACT.hook.from} durationInFrames={ACT.hook.dur} name="1 Hook">
          <Act1 />
        </Sequence>
        <Sequence from={ACT.turn.from} durationInFrames={ACT.turn.dur} name="2 Turn">
          <Act2 />
        </Sequence>
        <Sequence from={ACT.proof.from} durationInFrames={ACT.proof.dur} name="3 Proof">
          <Act3 />
        </Sequence>
        <Sequence from={ACT.payoff.from} durationInFrames={ACT.payoff.dur} name="4 Payoff">
          <Act4 />
        </Sequence>
        <Sequence from={ACT.lockup.from} durationInFrames={ACT.lockup.dur} name="5 Lockup">
          <Act5 />
        </Sequence>
        <Grain frame={frame} />
        {hasScore && <Html5Audio src={staticFile(SOUNDTRACK)} />}
        {audit && <Audit safe={safe} />}
      </AbsoluteFill>
    </FontGate>
  );
};
