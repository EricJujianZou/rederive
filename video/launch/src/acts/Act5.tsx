import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Mark } from '../brand/Mark';
import { C, FONT, TYPE, U, typeStyle } from '../brand/tokens';
import { E, hitPulse, lmix, mix, prog } from '../lib/anim';
import { baselineOf, inkBox, measureTracked } from '../lib/measure';
import { MaskRise } from '../fx/MaskRise';
import { ACT, copy, CUE, f60, H, W } from '../timeline';
import { Avatar } from '../ui/Chat';
import { SessionCard, Thread } from '../ui/SessionPanel';
import { avatarCenter, SESSION } from '../ui/layout';

// ACT 5 - LOCKUP. The thread clears, the session panel collapses into a slim pill around the
// URL (le-clone-stack-morph, ban-safe: no echo trails, this film's own simplification), and the
// avatar detaches from the panel at the exact pose Act 4 left it in, scaling up to become the
// standalone mark beside the wordmark. The glyph iris's third and final use is this film's one
// designed accent flood (law 3): a brief wash from the mark's own position, which decays before
// the wordmark needs the ink stage back under it.

const NAME = copy('wordmark');
const TAGLINE = copy('tagline');
const URL = copy('url');

export const Act5: React.FC = () => {
  const f = useCurrentFrame() + ACT.lockup.from;

  // --- the thread clears, the panel collapses ---------------------------------------------
  const contentOpacity = 1 - prog(f, CUE.shrinkStart2, CUE.shrinkTick1, E.smooth);
  const collapse = prog(f, CUE.shrinkStart2, CUE.collapseEnd, E.whip);

  // --- the lockup geometry (mirrors Act2's own math: the mark as tall as the name's ascent) ---
  const disp = TYPE.display;
  const nameSize = TYPE.display.size * 1.25 * U;
  const per100 = { w: measureTracked(NAME.text, 100, disp.weight, disp.track) / 100, asc: inkBox(NAME.text, 100, disp.weight).ascent / 100 };
  const nameW = per100.w * nameSize;
  const M1 = per100.asc * nameSize; // the mark's height
  const gap = 0.3 * M1;
  const lockW = M1 + gap + nameW;
  const lockCY = H / 2 - 70 * U;
  const markEnd = { x: (W - lockW) / 2, y: lockCY - M1 / 2 };
  const nameEnd = { x: markEnd.x + M1 + gap, baseline: lockCY + M1 / 2 };

  // --- the URL pill: the panel's own collapse target ---------------------------------------
  const urlSize = TYPE.mono.size * U;
  // Measured in the face it actually renders in (typeStyle('mono', ...) below); the default
  // display face is narrower, which undersized the pill and let the URL poke past its right edge.
  const urlW = measureTracked(URL.text, urlSize, TYPE.mono.weight, TYPE.mono.track, FONT.mono);
  const pillW = urlW + 64 * U;
  const pillH = urlSize * TYPE.mono.lead + 30 * U;
  // 300 (was 250): the tagline block itself moved down 70 px (60 -> 130, see above) to clear the
  // wordmark's own ink on exit, so the pill has to move down with it or the tagline's second line
  // runs into the pill's own top edge instead (verified: pillH ~= 72 px, so the pill's real top
  // sits at pillCY - 36, not at pillCY itself).
  const pillCY = lockCY + 300 * U;
  const pillEnd = { x: (W - pillW) / 2, y: pillCY - pillH / 2, w: pillW, h: pillH, radius: pillH / 2 };
  const start = { x: SESSION.x, y: SESSION.y, w: SESSION.w, h: SESSION.h, radius: SESSION.radius };
  const rect = {
    x: mix(start.x, pillEnd.x, collapse),
    y: mix(start.y, pillEnd.y, collapse),
    w: lmix(start.w, pillEnd.w, collapse),
    h: lmix(start.h, pillEnd.h, collapse),
    radius: mix(start.radius, pillEnd.radius, collapse),
  };

  // --- the avatar detaches and becomes the mark ---------------------------------------------
  const pa = avatarCenter('payoff');
  const badgeOut = prog(f, CUE.detachStart, CUE.detachStart + f60(18), E.in);
  const travel = prog(f, CUE.detachStart + f60(8), CUE.lockupIrisStart - f60(10), E.inOut);
  const mx = mix(pa.x - SESSION.avatar / 2, markEnd.x, travel);
  const my = mix(pa.y - SESSION.avatar / 2, markEnd.y, travel);
  const msize = lmix(SESSION.avatar, M1, travel);

  // --- the one designed accent flood: the iris's third and final use ------------------------
  const floodT = f - CUE.lockupIrisStart;
  const flood = floodT <= 0 ? 0 : hitPulse(floodT, 5, 9) * 0.55;

  // --- wordmark, tagline, URL ----------------------------------------------------------------
  const nameP = prog(f, CUE.wordmarkIn, CUE.wordmarkResolved, E.smooth);
  const urlP = prog(f, CUE.urlIn, CUE.urlIn + f60(26), E.smooth);

  return (
    <AbsoluteFill style={{ background: C.ink, overflow: 'hidden' }}>
      <SessionCard rect={rect} />
      <Thread
        frame={f}
        text={{
          problem: 'One function handles every request.',
          naive: 'One big function with if statements.',
          constraint: "Forty routes need it. Miss one, it's open.",
          better: 'Put the check in one function every route calls first.',
          payoff: (
            <>
              Yes, exactly. You rederived a <span style={{ color: C.accent, fontWeight: 650 }}>middleware chain</span>.
            </>
          ),
        }}
        cue={CUE}
        showPayoffAvatar={false}
        contentOpacity={contentOpacity}
      />

      {badgeOut < 1 && <Avatar x={pa.x} y={pa.y} size={SESSION.avatar} kind="rederive" opacity={1 - badgeOut} />}
      <Mark size={msize} color={C.paper} opacity={badgeOut} style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${mx}px, ${my}px)` }} />

      {flood > 0.004 && <div style={{ position: 'absolute', inset: 0, background: C.accent, opacity: flood }} />}

      {nameP > 0 && (
        <span
          data-text="wordmark"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            ...typeStyle('display', nameSize),
            color: C.paper,
            opacity: nameP,
            transform: `translate(${nameEnd.x}px, ${nameEnd.baseline - baselineOf(nameSize, disp.weight, 1)}px)`,
          }}
        >
          {NAME.text}
        </span>
      )}

      {f >= CUE.taglineIn && (
        // 96 * U (was 60): MaskRise's exit rises each word up through the top of its own clip on
        // E.in before it fades (depart()), so during taglineExitStart the departing glyphs travel
        // up past this box's top edge. At 60 * U that travel crossed into the wordmark's own ink
        // (verified at f1635-1640: "Learn" visibly touching the mark). The URL pill at
        // lockCY + 250 * U still clears this with room to spare.
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, transform: `translate(0, ${lockCY + 130 * U}px)` }}>
          <MaskRise
            text={TAGLINE.text}
            frame={f}
            start={CUE.taglineIn}
            out={CUE.taglineExitStart}
            stagger={f60(3)}
            dur={f60(24)}
            by="word"
            role="secondary"
            align="center"
            style={{ color: C.mute, alignItems: 'center' }}
          />
        </div>
      )}

      {urlP > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: pillEnd.w,
            height: pillEnd.h,
            borderRadius: pillEnd.radius,
            border: `1.5px solid ${C.line}`,
            opacity: urlP,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `translate(${pillEnd.x}px, ${pillEnd.y}px)`,
          }}
        >
          <span data-text="url" style={{ ...typeStyle('mono', urlSize), color: C.mute }}>{URL.text}</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
