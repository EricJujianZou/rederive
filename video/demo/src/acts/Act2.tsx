import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ACT } from '../timeline';
import { Session } from './Session';

/** Bars 6-12: the relay lands, the detour, the address swap, the direct path, ICE, the next problems. */
export const Act2: React.FC = () => {
  const f = useCurrentFrame() + ACT.resolve.from;
  return <Session frame={f} />;
};
