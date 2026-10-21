import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ACT } from '../timeline';
import { Session } from './Session';

/** Bars 1-7: the proposition, the repo, problem 1, a lock per handler, the breach. */
export const Act1: React.FC = () => {
  const f = useCurrentFrame() + ACT.propose.from;
  return <Session frame={f} />;
};
