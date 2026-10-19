import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useCurrentScale, useVideoConfig } from 'remotion';
import { C } from '../brand/tokens';
import { Insets, SafeSpec, presetFor, safeInsets } from './safe';

// Layout audit, mounted only when a composition gets the prop {audit: true}
// (scripts/layout-audit.sh renders stills that way). It measures every element tagged
// data-text="<id>" on the current frame and checks it against:
// - the safe zone: `safe` is a preset ('feed9x16', 'feed9x16Strict', 'square1x1', 'portrait4x5',
//   'wide16x9', 'title'), explicit insets {top, right, bottom, left}, or the older symmetric {x, y};
//   without it, the preset for the frame's aspect (lib/safe.ts presetFor: 9:16 gets the feed zones);
// - the other text boxes (overlap) and the minimum readable size (22 px at 1080p, 32 px in 9:16);
// - anything tagged data-mover="<id>" (a chip, card, cursor or device that travels) painted OVER
//   the text: sampled with elementsFromPoint, so z-order and transforms count as rendered.
// It draws the boxes and the safe zone, and logs one JSON line per frame:
//   CINETIC_AUDIT {"comp":"Film","frame":120,"safe":{...},"minPx":22,"boxes":[...],"issues":[...]}
// Each box carries its effective opacity (its own times its ancestors'); layout-audit.sh --speed
// pairs the boxes of frame f and f+1 by id to measure how fast readable text travels.
// Tag the element whose box IS the visible text (the line, not an oversized wrapper).

export const AUDIT_TAG = 'CINETIC_AUDIT';
/** Smallest text a viewer must read, px at 1080p (scaled by U for other sizes). */
export const MIN_TEXT_PX = 22;
/** The same in a tall (9:16) frame, which is watched full-screen on a phone next to feed UI. */
export const MIN_TEXT_PX_TALL = 32;

type Box = { id: string; text: string; x: number; y: number; w: number; h: number; px: number; opacity: number };
type Issue = { kind: 'safe-area' | 'overlap' | 'small-text' | 'covered'; id: string; detail: string };

const round = (v: number) => Math.round(v * 10) / 10;

const opacityOf = (el: Element | null) => {
  let o = 1;
  for (let e = el; e && e !== document.body; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || '1');
  return o;
};

/** Share of a 5 x 3 grid of points inside the text where a tagged mover is painted above the text. */
const coverOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  let hits = 0;
  const by = new Set<string>();
  for (let i = 1; i <= 5; i++)
    for (let j = 1; j <= 3; j++) {
      for (const hit of document.elementsFromPoint(r.left + (r.width * i) / 6, r.top + (r.height * j) / 4)) {
        if (hit === el || el.contains(hit)) break; // the text is on top at this point
        const m = hit.closest('[data-mover]');
        if (m && !m.contains(el) && opacityOf(m) >= 0.1) {
          hits++;
          by.add(m.getAttribute('data-mover') || '?');
          break;
        }
      }
    }
  return { hits, by: [...by] };
};

export const Audit: React.FC<{ safe?: SafeSpec }> = ({ safe }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const zoom = useCurrentScale(); // the Studio scales the canvas; renders are 1
  const { width, height, id: comp } = useVideoConfig();
  const SAFE: Insets = safeInsets(safe, width, height);
  const zone = typeof safe === 'string' ? safe : safe ? 'custom' : presetFor(width, height);
  const U = Math.min(width, height) / 1080;
  const minPx = (height / width > 1.5 ? MIN_TEXT_PX_TALL : MIN_TEXT_PX) * U;
  const [found, setFound] = useState<{ boxes: Box[]; issues: Issue[] }>({ boxes: [], issues: [] });

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const origin = host.getBoundingClientRect();
    const els = [...document.querySelectorAll<HTMLElement>('[data-text]')];
    const boxes: (Box & { el: HTMLElement })[] = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const opacity = opacityOf(el);
      if (r.width < 1 || r.height < 1 || opacity < 0.1) continue; // not on screen: nothing to read
      const k = el.offsetWidth > 0 ? r.width / zoom / el.offsetWidth : 1; // transform scale on the text
      boxes.push({
        el,
        id: el.dataset.text || '?',
        text: (el.textContent || '').trim().slice(0, 60),
        x: round((r.left - origin.left) / zoom),
        y: round((r.top - origin.top) / zoom),
        w: round(r.width / zoom),
        h: round(r.height / zoom),
        px: round(parseFloat(getComputedStyle(el).fontSize) * k),
        opacity: Math.round(opacity * 100) / 100,
      });
    }
    const issues: Issue[] = [];
    for (const b of boxes) {
      const out = [
        b.x < SAFE.left && `left ${b.x}px < ${SAFE.left}`,
        b.x + b.w > width - SAFE.right && `right ${round(b.x + b.w)}px > ${width - SAFE.right}`,
        b.y < SAFE.top && `top ${b.y}px < ${SAFE.top}`,
        b.y + b.h > height - SAFE.bottom && `bottom ${round(b.y + b.h)}px > ${height - SAFE.bottom}`,
      ].filter(Boolean);
      if (out.length) issues.push({ kind: 'safe-area', id: b.id, detail: `${out.join(', ')} (${zone})` });
      if (b.px < minPx) issues.push({ kind: 'small-text', id: b.id, detail: `${b.px}px < ${round(minPx)}px` });
      const cov = coverOf(b.el);
      if (cov.hits) issues.push({ kind: 'covered', id: b.id, detail: `${cov.hits}/15 sample points under ${cov.by.join(', ')}` });
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue; // nested tags describe the same text
        const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) - 2; // 2 px tolerance
        const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) - 2;
        if (ix > 0 && iy > 0) issues.push({ kind: 'overlap', id: `${a.id}+${b.id}`, detail: `${round(ix)}x${round(iy)}px` });
      }
    const clean = boxes.map(({ el: _el, ...b }) => b);
    console.log(`${AUDIT_TAG} ${JSON.stringify({ comp, frame, width, height, zone, safe: SAFE, minPx: round(minPx), boxes: clean, issues })}`);
    setFound({ boxes: clean, issues });
  }, [frame, zoom, width, height, comp, zone, SAFE.top, SAFE.right, SAFE.bottom, SAFE.left, minPx]);

  const bad = new Set(found.issues.flatMap((i) => i.id.split('+')));
  return (
    <AbsoluteFill ref={ref} style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: SAFE.left, top: SAFE.top, right: SAFE.right, bottom: SAFE.bottom, outline: `2px dashed ${C.mute}` }} />
      {found.boxes.map((b, i) => (
        <div key={i} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, outline: `2px solid ${bad.has(b.id) ? C.accent : C.mute}` }} />
      ))}
    </AbsoluteFill>
  );
};
