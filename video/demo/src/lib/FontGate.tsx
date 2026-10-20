import React, { useEffect, useState } from 'react';
import { useDelayRender } from 'remotion';
import '../brand/fonts';
import { FACES } from '../brand/tokens';

/**
 * Renders nothing until every face is decoded, then lets the frame render. No frame ever shows a
 * fallback face, and DOM/canvas text measurement (lib/measure.ts) always sees the real metrics:
 * a width measured before the font loads would be cached with the fallback's width.
 * `faces` are CSS font shorthands, one per weight/style in use: '600 16px "Geist Variable"'.
 */
export const FontGate: React.FC<{ faces?: string[]; children: React.ReactNode }> = ({ faces = FACES, children }) => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender('FontGate: loading fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .then(() => document.fonts.ready)
      .then(() => {
        const missing = faces.filter((f) => !document.fonts.check(f));
        if (missing.length) throw new Error(`FontGate: not loaded: ${missing.join(', ')} (is the @fontsource import in brand/fonts.ts?)`);
        setReady(true);
        // One more frame so layout runs with the real font before the capture.
        requestAnimationFrame(() => continueRender(handle));
      })
      .catch((err) => cancelRender(err));
  }, [faces, handle, continueRender, cancelRender]);
  return ready ? <>{children}</> : null;
};
