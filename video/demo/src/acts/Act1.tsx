import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ACT } from '../timeline';
import { Session } from './Session';

/** Bars 1-5: the problem, the straight send dropped, the relay proposed. */
export const Act1: React.FC = () => {
  const f = useCurrentFrame() + ACT.propose.from;
  return <Session frame={f} />;
};
