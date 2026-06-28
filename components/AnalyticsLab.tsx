'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { computePunterStats, computeCrowdStats, computeKnockoutStats, type PunterStat } from '@/lib/data';
import { Emoji, isDistortedFace, DISTORTED_FACE_SRC } from '@/components/Emoji';

// Distinct line colours for the race. Warm/editorial palette that sits inside
// the paper/gold/signal theme rather than fighting it.
const LINE_COLORS = ['#E8C547', '#E8743B', '#7FB069', '#5BC0BE', '#C46BAA', '#D98C5F', '#9FB4FF', '#E0584B'];

// Stable colour per punter, keyed off their position in the canonical `stats`
// order so a colour never shifts when lines are hidden/shown in the race.
const colorOf = (stats: PunterStat[], id: string) =>
  LINE_COLORS[Math.max(0, stats.findIndex(s => s.id === id)) % LINE_COLORS.length];

// Streak badge: 🔥 for a winning run, 🧊 for a losing run, with the count.
const StreakBadge = ({ stat, className }: { stat: PunterStat; className?: string }) => {
  // A single result isn't a streak — only surface a run once it reaches 2.
  if (stat.current.type === 'none' || stat.current.length < 2) return null;
  const hot = stat.current.type === 'hot';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 font-mono text-[11px] font-bold tabular-nums',
        hot ? 'text-signal' : 'text-paper/60',
        className,
      )}
      title={hot ? `On a ${stat.current.length}-pick winning streak` : `On a ${stat.current.length}-pick cold streak`}
    >
      <span>{hot ? '🔥' : '🧊'}</span>
      {stat.current.length}
    </span>
  );
};

// One headline stat card (hottest / coldest / records).
const StatCard = ({
  label, emoji, primary, secondary, tint,
}: { label: string; emoji: string; primary: React.ReactNode; secondary?: React.ReactNode; tint: 'hot' | 'cold' }) => (
  <div
    className={clsx(
      'flex flex-col gap-2 p-4 rounded border bg-pitch-800/30',
      tint === 'hot' ? 'border-signal/40' : 'border-chalk',
    )}
  >
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-paper/40">
      <span className="text-sm">{emoji}</span>
      {label}
    </div>
    <div className="font-serif text-lg leading-tight text-paper">{primary}</div>
    {secondary && <div className="font-mono text-[11px] text-paper/50">{secondary}</div>}
  </div>
);

// What's currently under the pointer on the race chart: a grid point identified
// by match step `i` and cumulative points `p` (which fix its sx/sy). Multiple
// punters can share it when their scores are tied at that match.
type HoverPoint = { i: number; p: number; sx: number; sy: number };

const GOLD = '#D4AF37';

// SVG race chart: cumulative points (y) over finished matches (x), one line per
// punter, with their emoji parked at the leading edge. `visible` is the subset
// to draw (the chart re-scales to it); `allStats` keeps colours stable.
const RaceChart = ({ visible, allStats, steps }: { visible: PunterStat[]; allStats: PunterStat[]; steps: number }) => {
  const stats = visible;
  const W = 360, H = 220;
  const EMOJI = 16;
  const [hover, setHover] = useState<HoverPoint | null>(null);

  // Every line ends at the same x (the right edge), so punters on the same score
  // would stack their emoji at the same point. Count how many share each score
  // and reserve room on the right so we can fan them out side by side.
  const sharing: Record<number, number> = {};
  stats.forEach(s => { sharing[s.points] = (sharing[s.points] ?? 0) + 1; });
  const maxStack = Math.max(1, ...Object.values(sharing));

  const padL = 10, padR = 12 + maxStack * EMOJI, padT = 14, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxPts = Math.max(1, ...stats.map(s => s.points));
  const maxX = Math.max(1, steps);

  const x = (i: number) => padL + (i / maxX) * plotW;
  const y = (p: number) => padT + plotH - (p / maxPts) * plotH;

  // Horizontal gridlines at each integer point value (capped so it stays readable).
  const tickEvery = maxPts > 8 ? Math.ceil(maxPts / 6) : 1;
  const ticks: number[] = [];
  for (let p = 0; p <= maxPts; p += tickEvery) ticks.push(p);

  // Assign each punter a slot within its score group (0, 1, 2, …) for fan-out.
  const slotUsed: Record<number, number> = {};
  const slot = stats.map(s => {
    const k = slotUsed[s.points] ?? 0;
    slotUsed[s.points] = k + 1;
    return k;
  });
  const endX = x(maxX);

  // Everyone sitting on the hovered point (tied scores at the same match).
  const members = hover ? stats.filter(s => s.timeline[hover.i] === hover.p) : [];
  const memberIds = new Set(members.map(s => s.id));

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Points race over time">
        {/* Tapping empty space dismisses an open tooltip (touch has no mouse-leave). */}
        <rect x={0} y={0} width={W} height={H} fill="transparent" onClick={() => setHover(null)} />
        {ticks.map(p => (
          <g key={p}>
            <line x1={padL} x2={endX} y1={y(p)} y2={y(p)} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} />
            <text x={padL - 2} y={y(p) + 3} fontSize={8} fill="#ffffff" fillOpacity={0.3} fontFamily="monospace" textAnchor="end">{p}</text>
          </g>
        ))}
        {stats.map((s, idx) => {
          const color = colorOf(allStats, s.id);
          const pts = s.timeline.map((p, i) => `${x(i)},${y(p)}`).join(' ');
          const endY = y(s.points);
          const dim = hover && !memberIds.has(s.id);
          return (
            <g key={s.id}>
              <motion.polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: dim ? 0.25 : 1 }}
                transition={{ duration: 0.9, delay: idx * 0.08, ease: 'easeOut' }}
              />
              <circle cx={endX} cy={endY} r={2.5} fill={color} />
              {isDistortedFace(s.avatar) ? (
                <image
                  href={DISTORTED_FACE_SRC}
                  x={endX + 3 + slot[idx] * EMOJI}
                  y={endY - EMOJI / 2}
                  width={EMOJI}
                  height={EMOJI}
                />
              ) : (
                <text x={endX + 3 + slot[idx] * EMOJI} y={endY + 4} fontSize={13}>{s.avatar}</text>
              )}
            </g>
          );
        })}
        {/* Hover targets last so they sit on top of every line. One invisible,
            generously-sized dot per data point feeds the tooltip. */}
        {stats.map(s => {
          const color = colorOf(allStats, s.id);
          return s.timeline.map((p, i) => {
            const cx = x(i), cy = y(p);
            const active = hover?.sx === cx && hover?.sy === cy;
            return (
              <g key={`${s.id}-${i}`}>
                {active && <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#0f1a14" strokeWidth={1.5} />}
                <circle
                  cx={cx}
                  cy={cy}
                  r={7}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHover({ i, p, sx: cx, sy: cy })}
                  onMouseLeave={() => setHover(prev => (prev?.sx === cx && prev?.sy === cy ? null : prev))}
                  onClick={e => {
                    // Tap toggles the same tooltip hover shows; stop the click
                    // from reaching the background dismiss layer.
                    e.stopPropagation();
                    setHover(active ? null : { i, p, sx: cx, sy: cy });
                  }}
                />
              </g>
            );
          });
        })}
      </svg>

      {hover && members.length > 0 && (() => {
        // One colour when a single punter is on the point; gold when it's a tie.
        const accent = members.length === 1 ? colorOf(allStats, members[0].id) : GOLD;
        return (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
            style={{ left: `${(hover.sx / W) * 100}%`, top: `calc(${(hover.sy / H) * 100}% - 8px)` }}
          >
            <div
              className="flex flex-col gap-1 whitespace-nowrap rounded border bg-pitch-900/95 px-2.5 py-1.5"
              style={{ borderColor: accent }}
            >
              {members.map(m => {
                const c = colorOf(allStats, m.id);
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: c }} />
                    <span className="text-sm leading-none"><Emoji emoji={m.avatar} /></span>
                    <span className="font-sans text-xs font-bold leading-none text-paper">{m.name}</span>
                    <span className="ml-auto pl-1 font-mono text-xs font-bold leading-none tabular-nums" style={{ color: c }}>
                      {hover.p} pt{hover.p === 1 ? '' : 's'}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* little caret pointing at the data point */}
            <div
              className="mx-auto h-0 w-0"
              style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${accent}` }}
            />
          </div>
        );
      })()}
    </div>
  );
};

export const AnalyticsLab = ({ users, bets, matches, onBack }: any) => {
  const { finished, stats } = useMemo(
    () => computePunterStats(users, bets, matches),
    [users, bets, matches],
  );

  // Leaderboard order for the legend / streak list.
  const ranked = useMemo(() => [...stats].sort((a, b) => b.points - a.points), [stats]);

  // Punters hidden from the race chart (toggled off via the legend). Stored by
  // id so the set survives re-renders / order changes.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const visible = useMemo(() => stats.filter(s => !hidden.has(s.id)), [stats, hidden]);

  // Headline stats.
  const hottest = useMemo(
    () => stats.filter(s => s.current.type === 'hot').sort((a, b) => b.current.length - a.current.length)[0],
    [stats],
  );
  const coldest = useMemo(
    () => stats.filter(s => s.current.type === 'cold').sort((a, b) => b.current.length - a.current.length)[0],
    [stats],
  );
  const recordHot = useMemo(
    () => [...stats].sort((a, b) => b.longestHot - a.longestHot).find(s => s.longestHot > 0),
    [stats],
  );
  const recordCold = useMemo(
    () => [...stats].sort((a, b) => b.longestCold - a.longestCold).find(s => s.longestCold > 0),
    [stats],
  );

  // Group-betting tendencies (crowd wisdom, underdogs, risk-takers).
  const crowd = useMemo(() => computeCrowdStats(users, bets, matches), [users, bets, matches]);

  // Knockout-only records (Knockout Hero / Bottler).
  const ko = useMemo(() => computeKnockoutStats(users, bets, matches), [users, bets, matches]);

  return (
    <div className="w-full max-w-md mx-auto mt-8">
      {/* Header + back control */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-serif text-xl text-gold leading-tight">Analytics Lab</h2>
        <button
          onClick={onBack}
          className="font-mono text-[10px] uppercase tracking-widest text-paper/50 hover:text-paper border border-chalk px-3 py-1.5 rounded transition-colors"
        >
          ← Table
        </button>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-paper/40 mb-6">
        {finished.length} matches scored
      </p>

      {finished.length === 0 ? (
        <div className="text-center py-16 font-mono text-xs text-paper/40">
          No finished matches yet — the lab needs results to crunch.
        </div>
      ) : (
        <>
          {/* The race */}
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
            The Race
          </div>
          <div className="bg-pitch-800/20 border border-chalk rounded p-2 mb-3">
            <RaceChart visible={visible} allStats={stats} steps={finished.length} />
          </div>

          {/* Toggleable legend: tap a punter to drop their line, tap again to
              bring it back. Defaults to everyone shown. */}
          <div className="flex flex-wrap gap-2 mb-8">
            {ranked.map(s => {
              const off = hidden.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  aria-pressed={!off}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border font-mono text-[11px] transition-colors',
                    off
                      ? 'border-chalk/40 text-paper/30 bg-transparent'
                      : 'border-chalk text-paper bg-pitch-800/40',
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: off ? 'transparent' : colorOf(stats, s.id), boxShadow: off ? 'inset 0 0 0 1.5px rgba(255,255,255,0.25)' : undefined }}
                  />
                  <span className={clsx('text-sm', off && 'opacity-40')}><Emoji emoji={s.avatar} /></span>
                  <span className={clsx('font-sans font-bold', off && 'line-through')}>{s.name}</span>
                </button>
              );
            })}
          </div>

          {/* Headline cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard
              label="Hottest"
              emoji="🔥"
              tint="hot"
              primary={hottest ? <><Emoji emoji={hottest.avatar} /> {hottest.name}</> : '—'}
              secondary={hottest ? `${hottest.current.length}-pick winning streak` : 'nobody on a run'}
            />
            <StatCard
              label="Coldest"
              emoji="🧊"
              tint="cold"
              primary={coldest ? <><Emoji emoji={coldest.avatar} /> {coldest.name}</> : '—'}
              secondary={coldest ? `${coldest.current.length}-pick cold streak` : 'nobody slumping'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-10">
            <StatCard
              label="Longest ever hot"
              emoji="🏆"
              tint="hot"
              primary={recordHot ? <>{recordHot.longestHot} picks</> : '—'}
              secondary={recordHot ? <><Emoji emoji={recordHot.avatar} /> {recordHot.name}</> : 'no streaks yet'}
            />
            <StatCard
              label="Longest ever cold"
              emoji="❄️"
              tint="cold"
              primary={recordCold ? <>{recordCold.longestCold} picks</> : '—'}
              secondary={recordCold ? <><Emoji emoji={recordCold.avatar} /> {recordCold.name}</> : 'no slumps yet'}
            />
          </div>

          {/* Crowd & risk */}
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
            Crowd & Risk
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatCard
              label="Wisdom of the Crowd"
              emoji="🧠"
              tint="hot"
              primary={crowd.wisdomPct !== null ? `${crowd.wisdomPct}%` : '—'}
              secondary={crowd.wisdomGames > 0
                ? `majority right · ${crowd.wisdomGames} game${crowd.wisdomGames === 1 ? '' : 's'}`
                : 'no 4+ majorities yet'}
            />
            <StatCard
              label="Dark Horse"
              emoji="🐎"
              tint="cold"
              primary={crowd.darkHorsePct !== null ? `${crowd.darkHorsePct}%` : '—'}
              secondary={crowd.darkHorseGames > 0
                ? `underdog won · ${crowd.darkHorseGames} game${crowd.darkHorseGames === 1 ? '' : 's'}`
                : 'no underdog races yet'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-10">
            <StatCard
              label="Dark Jockey"
              emoji="🏇"
              tint="hot"
              primary={crowd.jockey ? <><Emoji emoji={crowd.jockey.avatar} /> {crowd.jockey.name}</> : '—'}
              secondary={crowd.jockey
                ? `${Math.round((crowd.jockey.hits / crowd.jockey.risky) * 100)}% hit · ${crowd.jockey.hits}/${crowd.jockey.risky} risky paid off`
                : 'no dark horses called yet'}
            />
            <StatCard
              label="Gambler"
              emoji="🎲"
              tint="cold"
              primary={crowd.gambler ? <><Emoji emoji={crowd.gambler.avatar} /> {crowd.gambler.name}</> : '—'}
              secondary={crowd.gambler
                ? `${crowd.gambler.risky} risky bet${crowd.gambler.risky === 1 ? '' : 's'} · ${Math.round((crowd.gambler.hits / crowd.gambler.risky) * 100)}% hit`
                : 'no risky bets yet'}
            />
          </div>

          {/* Knockout records — only once the bracket has produced results */}
          {ko.koFinished > 0 && (
            <>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
                Knockout
              </div>
              <div className="grid grid-cols-2 gap-3 mb-10">
                <StatCard
                  label="Knockout Hero"
                  emoji="🦸"
                  tint="hot"
                  primary={ko.hero ? <><Emoji emoji={ko.hero.avatar} /> {ko.hero.name}</> : '—'}
                  secondary={ko.hero
                    ? `${ko.hero.koHits}/${ko.hero.koPlayed} knockouts right`
                    : 'no knockout picks right yet'}
                />
                <StatCard
                  label="Bottler"
                  emoji="🍾"
                  tint="cold"
                  primary={ko.bottler ? <><Emoji emoji={ko.bottler.avatar} /> {ko.bottler.name}</> : '—'}
                  secondary={ko.bottler
                    ? `backed the loser ${ko.bottler.bottles}× — out of the cup`
                    : 'nobody backed a loser yet'}
                />
              </div>
            </>
          )}

          {/* Per-punter streak legend */}
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
            Form Guide
          </div>
          <div className="flex flex-col gap-2">
            {ranked.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded border border-transparent bg-pitch-800/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: colorOf(stats, s.id) }}
                  />
                  <span className="text-lg"><Emoji emoji={s.avatar} /></span>
                  <span className="font-sans font-bold text-sm text-paper">{s.name}</span>
                  <StreakBadge stat={s} />
                </div>
                <span className="font-mono text-sm text-gold font-bold w-8 text-center">{s.points}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export { StreakBadge };
