import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Mark } from './brand/Mark';
import { C, TYPE, U, typeStyle } from './brand/tokens';
import { FontGate } from './lib/FontGate';
import { baselineOf, inkBox, measureTracked } from './lib/measure';
import { copy } from './timeline';

// Style frames: rendered with `npm run stills` and looked at before any animation is built.
// The mark must hold up at favicon size and at full screen, on ink (the film's stage) and on paper.

export const MarkStill: React.FC<{ size: number; surface: 'paper' | 'ink' }> = ({ size, surface }) => (
  <AbsoluteFill style={{ background: surface === 'ink' ? C.ink : C.paper, alignItems: 'center', justifyContent: 'center' }}>
    <Mark size={size} color={surface === 'ink' ? C.paper : C.ink} />
  </AbsoluteFill>
);

const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** The mark at every working size on both surfaces: the loop and the bowl must both stay open. */
export const MarkSizes: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    {(['ink', 'paper'] as const).map((surface) => (
      <div
        key={surface}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 64 * U, background: surface === 'ink' ? C.ink : C.paper }}
      >
        {SIZES.map((s) => (
          <Mark key={s} size={s * U} color={surface === 'ink' ? C.paper : C.ink} />
        ))}
      </div>
    ))}
  </AbsoluteFill>
);

// ---- Brand kit: rendered by scripts/brand-kit.sh (transparent PNGs unless a ground colour is set) ----
type Ground = 'light' | 'dark' | 'accent';
const inkOn = (g: Ground) => (g === 'light' ? C.ink : C.paper);
const groundOf = (g: Ground) => (g === 'light' ? C.paper : g === 'dark' ? C.ink : C.accent);

/** The lockup as the film ends on it: the mark as tall as the name's ink ascent, a 0.3 gap, one baseline, centred. */
const Lockup: React.FC<{ nameSize: number; ink: string; cx: number; cy: number }> = ({ nameSize, ink, cx, cy }) => {
  const name = copy('wordmark').text;
  const { weight, track } = TYPE.display;
  const M = inkBox(name, nameSize, weight).ascent;
  const nameW = measureTracked(name, nameSize, weight, track);
  const gap = 0.3 * M;
  const x = cx - (M + gap + nameW) / 2;
  const base = cy + M / 2;
  return (
    <>
      <Mark size={M} color={ink} style={{ position: 'absolute', left: x, top: base - M }} />
      <span style={{ ...typeStyle('display', nameSize), lineHeight: 1, color: ink, position: 'absolute', left: 0, top: 0, transform: `translate(${x + M + gap}px, ${base - baselineOf(nameSize, weight, 1)}px)` }}>
        {name}
      </span>
    </>
  );
};

export const BrandMark: React.FC<{ size: number; ground: Ground }> = ({ size, ground }) => (
  <AbsoluteFill>
    <Mark size={size} color={inkOn(ground)} />
  </AbsoluteFill>
);

export const BrandLockup: React.FC<{ ground: Ground }> = ({ ground }) => (
  <FontGate>
    <AbsoluteFill>
      <Lockup nameSize={240} ink={inkOn(ground)} cx={1200} cy={400} />
    </AbsoluteFill>
  </FontGate>
);

/** A social avatar: the platform crops it to a circle, so the mark stays inside 55% of the width. */
export const BrandAvatar: React.FC<{ ground: Ground }> = ({ ground }) => (
  <AbsoluteFill style={{ background: groundOf(ground), alignItems: 'center', justifyContent: 'center' }}>
    <Mark size={220} color={ground === 'accent' ? C.paper : inkOn(ground)} />
  </AbsoluteFill>
);

/** An X header (1500 x 500): the lockup centred; the avatar covers the bottom-left, so nothing lives there. */
export const BrandHeader: React.FC<{ ground: Ground }> = ({ ground }) => (
  <FontGate>
    <AbsoluteFill style={{ background: groundOf(ground) }}>
      <Lockup nameSize={120} ink={inkOn(ground)} cx={750} cy={230} />
    </AbsoluteFill>
  </FontGate>
);
