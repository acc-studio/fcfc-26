'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { clsx } from 'clsx';

// useLayoutEffect on the client (measure before paint, no flicker), useEffect on
// the server to avoid the SSR warning.
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// Renders text on a single line, shrinking the font just enough to fit its
// (flex) container instead of wrapping. Re-fits on container resize and once
// web fonts load.
export const FitText = ({ text, className, align = 'left' }: {
  text: string; className?: string; align?: 'left' | 'right';
}) => {
  const box = useRef<HTMLSpanElement>(null);
  const txt = useRef<HTMLSpanElement>(null);

  useIso(() => {
    const container = box.current, el = txt.current;
    if (!container || !el) return;
    const fit = () => {
      el.style.fontSize = '';                 // reset to the CSS (breakpoint) base
      const avail = container.clientWidth;
      const w = el.scrollWidth;
      if (avail > 0 && w > avail) {
        const base = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${Math.max((base * avail) / w, base * 0.5)}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [text]);

  return (
    <span ref={box} className={clsx('block flex-1 min-w-0 overflow-hidden', align === 'right' ? 'text-right' : 'text-left')}>
      <span ref={txt} className={clsx('inline-block whitespace-nowrap', className)}>{text}</span>
    </span>
  );
};
