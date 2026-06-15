'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { clsx } from 'clsx';

// useLayoutEffect on the client (measure before paint, no flicker), useEffect on
// the server to avoid the SSR warning.
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const RATIO = 1.12; // line-height multiple used for both layout and measurement

// Fits text into its (flex) container by preferring word wrapping up to
// `maxLines` lines, then shrinking the font. Words are never broken mid-word: a
// single word too wide for the container is scaled down instead. So "Bosnia and
// Herzegovina" wraps to two lines and only shrinks if two lines still overflow.
export const FitText = ({ text, className, align = 'left', maxLines = 2 }: {
  text: string; className?: string; align?: 'left' | 'right'; maxLines?: number;
}) => {
  const box = useRef<HTMLSpanElement>(null);
  const txt = useRef<HTMLSpanElement>(null);

  useIso(() => {
    const container = box.current, el = txt.current;
    if (!container || !el) return;
    const fit = () => {
      el.style.fontSize = '';                       // reset to CSS (breakpoint) base
      const avail = container.clientWidth;
      if (!avail) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      let size = base;
      el.style.fontSize = `${size}px`;
      // Shrink until the wrapped text fits maxLines AND no word overflows width.
      let guard = 0;
      while (guard++ < 24 && size > base * 0.5) {
        const fitsHeight = el.scrollHeight <= size * RATIO * maxLines + 1;
        const fitsWidth = el.scrollWidth <= avail + 1;
        if (fitsHeight && fitsWidth) break;
        size = Math.max(base * 0.5, size - base * 0.05);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [text, maxLines]);

  return (
    <span ref={box} className={clsx('block flex-1 min-w-0', align === 'right' ? 'text-right' : 'text-left')}>
      <span ref={txt} className={clsx('block break-normal', className)} style={{ lineHeight: RATIO }}>{text}</span>
    </span>
  );
};
