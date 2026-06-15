import { clsx } from 'clsx';
import { TeamLineup, LineupPlayer } from '@/lib/espn';

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

// y positions (% of pitch height) per team, GK nearest its own goal line.
function yFor(side: 'home' | 'away', rowIdx: number, rowCount: number): number {
  const span = 26; // how far the outfield lines spread toward the centre
  if (side === 'home') {
    const near = 80, step = rowCount > 1 ? span / (rowCount - 1) : 0;
    return near - rowIdx * step;
  }
  const near = 20, step = rowCount > 1 ? span / (rowCount - 1) : 0;
  return near + rowIdx * step;
}

const Chip = ({ p, x, y, side }: { p: LineupPlayer; x: number; y: number; side: 'home' | 'away' }) => (
  <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-12" style={{ left: `${x}%`, top: `${y}%` }}>
    <div className={clsx(
      "w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[9px] md:text-[10px] font-mono font-bold border border-pitch-900/40",
      side === 'home' ? "bg-paper text-pitch-900" : "bg-gold text-pitch-900"
    )}>
      {p.jersey}
    </div>
    <span className="mt-0.5 text-[7px] md:text-[8px] leading-none text-paper text-center truncate w-full [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
      {surname(p.name)}
    </span>
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
  <div
    className="relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-white/10"
    style={{ background: 'repeating-linear-gradient(to bottom, #16271E 0 8.33%, #1B2E23 8.33% 16.66%)' }}
  >
    {awayNote && (
      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 text-[8px] md:text-[10px] font-mono text-paper/80 bg-pitch-900/70 px-2 py-0.5 rounded-full whitespace-nowrap">
        {awayNote}
      </div>
    )}
    {homeNote && (
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 text-[8px] md:text-[10px] font-mono text-paper/80 bg-pitch-900/70 px-2 py-0.5 rounded-full whitespace-nowrap">
        {homeNote}
      </div>
    )}
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
);
