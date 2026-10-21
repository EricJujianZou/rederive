import React from 'react';
import { useCurrentFrame } from 'remotion';
import { ACT } from '../timeline';
import { Session } from './Session';

/** Bars 8-17: the gate, the crowd, the chain, the name, the hold. */
export const Act2: React.FC = () => {
  const f = useCurrentFrame() + ACT.resolve.from;
  return <Session frame={f} />;
};
