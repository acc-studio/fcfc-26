'use client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { TeamLineup, LineupPlayer } from '@/lib/espn';

const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// A single-line player name that shrinks its font to fit the chip width instead
// of ellipsing. Base size is the cqw clamp below; it only scales down if needed.
const PitchName = ({ name }: { name: string }) => {
  const box = useRef<HTMLSpanElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useIso(() => {
    const container = box.current, el = txt.current;
    if (!container || !el) return;
    const fit = () => {
      el.style.fontSize = '';
      const avail = container.clientWidth;
      if (!avail) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      let size = base, guard = 0;
      el.style.fontSize = `${size}px`;
      while (guard++ < 28 && size > base * 0.4 && el.scrollWidth > avail + 1) {
        size = Math.max(base * 0.4, size - base * 0.04);
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [name]);
  return (
    <span ref={box} className="mt-1 w-full overflow-hidden text-center">
      <span ref={txt} className="inline-block whitespace-nowrap leading-tight text-[#E8E6D9] text-[clamp(10px,3.3cqw,20px)] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {name}
      </span>
    </span>
  );
};

// Draws both XIs on a vertical pitch: home defends the bottom (attacks up), away
// defends the top. Players are laid out from the formation string ("4-2-3-1")
// with starters in formation order (GK first); within a line we nudge L/R from
// the position abbreviation so wingers/full-backs sit on the correct side.

const surname = (name: string) => name.split(' ').slice(-1)[0] || name;

// -1 left, +1 right, 0 central — from ESPN position abbreviations (LB, CM-R, RW…).
const sideScore = (pos: string) => {
  if (/(^L|-L$|LW|LB|LM|LWB)/.test(pos)) return -1;
  if (/(^R|-R$|RW|RB|RM|RWB)/.test(pos)) return 1;
  return 0;
};

function buildRows(lineup: TeamLineup): { gk: LineupPlayer | null; rows: LineupPlayer[][] } {
  const starters = lineup.starters;
  if (!starters.length) return { gk: null, rows: [] };
  const gk = starters[0];
  const outfield = starters.slice(1);
  let lines = lineup.formation.split('-').map(Number).filter((n) => n > 0);
  if (!lines.length || lines.reduce((a, b) => a + b, 0) === 0) lines = [4, 3, 3];

  const rows: LineupPlayer[][] = [];
  let idx = 0;
  for (const n of lines) {
    const row = outfield.slice(idx, idx + n);
    if (row.length) rows.push(row.slice().sort((a, b) => sideScore(a.pos) - sideScore(b.pos)));
    idx += n;
  }
  if (idx < outfield.length && rows.length) rows[rows.length - 1].push(...outfield.slice(idx));
  return { gk, rows };
}

// y positions (% of pitch height) per team, GK nearest its own goal line. The
// outfield spreads across most of each half so lines don't crowd vertically.
function yFor(side: 'home' | 'away', rowIdx: number, rowCount: number): number {
  // Keep each team in its own half with a buffer around the centre line so the
  // two front lines don't collide: home front ~57%, away front ~43%.
  const span = 26; // how far the outfield lines spread toward the centre
  if (side === 'home') {
    const near = 83, step = rowCount > 1 ? span / (rowCount - 1) : 0;
    return near - rowIdx * step;
  }
  const near = 17, step = rowCount > 1 ? span / (rowCount - 1) : 0;
  return near + rowIdx * step;
}

// Sizes are in container-query units (cqw = 1% of pitch width) so chips and
// names scale with the pitch, clamped so they never get tiny or overlap.
const Chip = ({ p, x, y, side }: { p: LineupPlayer; x: number; y: number; side: 'home' | 'away' }) => (
  <div
    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-[clamp(44px,16cqw,96px)]"
    style={{ left: `${x}%`, top: `${y}%` }}
  >
    <div className={clsx(
      // Fixed colours: the pitch is always dark green in both themes, so these
      // must not flip with the theme (home bone jersey, away gold, dark numbers).
      "rounded-full flex items-center justify-center font-mono font-bold border border-black/40 w-[clamp(20px,8cqw,48px)] h-[clamp(20px,8cqw,48px)] text-[clamp(10px,3.6cqw,22px)]",
      side === 'home' ? "bg-[#E8E6D9] text-[#0F1A15]" : "bg-[#D4AF37] text-[#0F1A15]"
    )}>
      {p.jersey}
    </div>
    <PitchName name={surname(p.name)} />
  </div>
);

const placeTeam = (lineup: TeamLineup | null, side: 'home' | 'away') => {
  if (!lineup) return null;
  const { gk, rows } = buildRows(lineup);
  const nodes: React.ReactNode[] = [];
  if (gk) nodes.push(<Chip key={`${side}-gk`} p={gk} x={50} y={side === 'home' ? 94 : 6} side={side} />);
  rows.forEach((row, r) => {
    row.forEach((p, i) => {
      nodes.push(<Chip key={`${side}-${r}-${i}`} p={p} x={(i + 1) / (row.length + 1) * 100} y={yFor(side, r, rows.length)} side={side} />);
    });
  });
  return nodes;
};

export const Pitch = ({ home, away, homeNote, awayNote }: {
  home: TeamLineup | null; away: TeamLineup | null; homeNote?: string; awayNote?: string;
}) => (
  <div className="w-full">
    {/* Away's last opponent — behind the top (away) goal line, off-centre */}
    {awayNote && (
      <div className="pb-1 pr-3 text-right font-mono text-[10px] md:text-xs text-paper/70 truncate">{awayNote}</div>
    )}

    <div
      className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-paper/10"
      style={{
        background: 'repeating-linear-gradient(to bottom, #16271E 0 8.33%, #1B2E23 8.33% 16.66%)',
        containerType: 'inline-size',
      }}
    >
      {/* Markings */}
      <svg viewBox="0 0 100 133" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" stroke="rgba(255,255,255,0.22)" strokeWidth="0.4" fill="none">
        <rect x="2" y="2" width="96" height="129" />
        <line x1="2" y1="66.5" x2="98" y2="66.5" />
        <circle cx="50" cy="66.5" r="11" />
        <circle cx="50" cy="66.5" r="0.7" fill="rgba(255,255,255,0.22)" stroke="none" />
        <rect x="22" y="2" width="56" height="17" />
        <rect x="37" y="2" width="26" height="6" />
        <rect x="22" y="114" width="56" height="17" />
        <rect x="37" y="125" width="26" height="6" />
      </svg>

      {placeTeam(home, 'home')}
      {placeTeam(away, 'away')}
    </div>

    {/* Home's last opponent — behind the bottom (home) goal line, off-centre */}
    {homeNote && (
      <div className="pt-1 pr-3 text-right font-mono text-[10px] md:text-xs text-paper/70 truncate">{homeNote}</div>
    )}
  </div>
);
