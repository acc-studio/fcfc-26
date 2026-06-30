'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import clsx from 'clsx';

// A small themed date picker: a trigger that always shows the selected weekday
// (so you know what day you're inviting for) and a month-grid popup with weekday
// column headers. Works on plain YYYY-MM-DD strings (no timezone math — these are
// calendar dates, not instants). `min` (YYYY-MM-DD) greys out earlier days.
//
// The popup renders in a portal with fixed positioning so it can't be clipped by
// the create form's overflow-hidden wrapper — it always sits frontmost.

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const POPUP_W = 256; // matches w-64

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`; // m 0-based
// Monday-first column index from a JS day (0=Sun..6=Sat).
const colOf = (jsDay: number) => (jsDay + 6) % 7;
const dayOfWeek = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).getUTCDay();

interface DatePickerProps {
  value: string;            // YYYY-MM-DD
  min?: string;             // YYYY-MM-DD — earliest selectable
  onChange: (v: string) => void;
}

export const DatePicker = ({ value, min, onChange }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [vy, vm, vd] = value.split('-').map(Number);
  const [view, setView] = useState({ y: vy, m: vm - 1 }); // 0-based month

  // Anchor the fixed popup under the trigger, clamped to the viewport.
  const place = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, left: Math.min(Math.max(8, r.left), window.innerWidth - POPUP_W - 8) });
  }, []);

  // Keep it anchored while open if the page scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  const toggle = () => { if (!open) place(); setOpen(o => !o); };

  const label = `${DOW[dayOfWeek(vy, vm - 1, vd)]} ${vd} ${MONTHS[vm - 1]}`;

  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const lead = colOf(dayOfWeek(view.y, view.m, 1));
  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const viewYm = `${view.y}-${pad(view.m + 1)}`;
  const canPrev = !min || viewYm > min.slice(0, 7);

  const step = (delta: number) => setView(v => {
    const m = v.m + delta;
    return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
  });

  const pick = (d: number) => { onChange(iso(view.y, view.m, d)); setOpen(false); };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 bg-pitch-900 border border-chalk hover:border-gold/50 rounded px-3 py-2 font-mono text-sm text-paper transition-colors"
      >
        <span aria-hidden>📅</span>{label}
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[100] w-64 rounded-lg border border-gold/30 bg-pitch-800 p-3 shadow-2xl"
          >
            {/* month nav */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={!canPrev}
                className="px-2 py-1 font-mono text-paper/60 hover:text-gold disabled:opacity-20 disabled:hover:text-paper/60"
              >‹</button>
              <span className="font-mono text-xs uppercase tracking-widest text-gold">{MONTHS[view.m]} {view.y}</span>
              <button
                type="button"
                onClick={() => step(1)}
                className="px-2 py-1 font-mono text-paper/60 hover:text-gold"
              >›</button>
            </div>

            {/* weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map(w => (
                <span key={w} className="text-center font-mono text-[9px] uppercase text-paper/30">{w}</span>
              ))}
            </div>

            {/* day grid */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const ds = iso(view.y, view.m, d);
                const disabled = !!min && ds < min;
                const selected = ds === value;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(d)}
                    className={clsx(
                      'aspect-square rounded font-mono text-xs transition-colors',
                      selected
                        ? 'bg-gold text-pitch-900 font-bold'
                        : disabled
                          ? 'text-paper/15'
                          : 'text-paper/80 hover:bg-paper/10',
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>,
        document.body,
      )}
    </div>
  );
};
