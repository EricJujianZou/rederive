import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C } from '../brand/tokens';
import { E, hitPulse, mix, prog } from '../lib/anim';
import { camera } from '../lib/camera';
import { ACT, CUE, H, W } from '../timeline';
import { SessionCard, Thread } from '../ui/SessionPanel';
import { rowCenterY, ROW, SESSION } from '../ui/layout';

// ACT 3 - PROOF. The problem lands with no solution words, the naive answer, the constraint that
// breaks it (the camera's one hero move here: a push onto the line that breaks it), a held beat
// while the user revises, the better answer. The product has been named in its own chrome since
// the turn (Act 2's header), well inside the brief's "about a quarter of the runtime".
//
// Cue frames below are absolute (CUE.*); Thread and the ring/bubble components all take the
// absolute frame directly, so nothing here re-derives act-local timing by hand.

export const Act3: React.FC = () => {
  const f = useCurrentFrame() + ACT.proof.from;

  const cardCX = SESSION.x + SESSION.w / 2;
  const cardCY = SESSION.y + SESSION.h / 2;
  const push = hitPulse(f - CUE.pushInPeak, 20, 24);
  // Anchored closer to the panel's own centre than the constraint line's exact column (was 0.4):
  // at the old anchor and peak scale, the push carried the far-right typed answer past the right
  // safe margin and over the 20 px/f text-speed ceiling at its own peak (f660, f690). Nudged again
  // (0.46 -> 0.49, see the drift note below) after the breathing widened.
  const ax = mix(cardCX, SESSION.x + SESSION.w * 0.49, push);
  const ay = mix(cardCY, rowCenterY(ROW.constraint), push);
  // A slow breathing arc under the whole act (peaks mid-act, returns to 1 by the last frame), so
  // the long reading pauses between messages still drift instead of reading as a stalled player,
  // and the act both opens and closes at k = 1 to match its neighbours (Act 2's hold, Act 4's cut).
  const dt = prog(f, ACT.proof.from, ACT.proof.from + ACT.proof.dur, E.linear);
  const denv = 4 * dt * (1 - dt);
  // Wider than before (0.05 / 9 px): the naive-answer read (f459-606, dt 0.17-0.41, denv already
  // 0.55-0.97 here, not actually near zero) still averaged under forensics' own "hold" floor at
  // the old amplitude. A flat additive floor would pop the f360 seam with Act2 (denv = 0 there
  // only, so a constant breaks the match); a bigger multiplier on the same envelope does not,
  // since it still returns to exactly 1 at both ends. Tapered by (1 - push) so it does not stack
  // with the hero push at its own peak (denv and push are both near max around f680): at full
  // amplitude the two together clipped the far-right typed bubble flush against the frame's right
  // edge for 6 frames (f676-681, verified on decoded pixels).
  const drift = 1 + 0.09 * denv * (1 - push);
  const k = (1 + 0.18 * push) * drift;
  // A pan carries the real measurable motion (a pure zoom around frame centre barely displaces
  // content that close to the anchor); same envelope, so it also returns to 0 by the act's end.
  const cam = camera({ ax, ay, sx: W / 2 + 15 * denv, sy: H / 2, k });

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <div style={cam}>
        <SessionCard />
        <Thread
          frame={f}
          text={{
            problem: 'One function handles every request.',
            naive: 'One big function with if statements.',
            constraint: "Forty routes need it. Miss one, it's open.",
            better: 'Put the check in one function every route calls first.',
            payoff: '',
          }}
          cue={CUE}
          showPayoffAvatar={false}
        />
      </div>
    </AbsoluteFill>
  );
};
