'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { computePunterStats, type PunterStat } from '@/lib/data';
import { Emoji, isDistortedFace, DISTORTED_FACE_SRC } from '@/components/Emoji';

// Distinct line colours for the race. Warm/editorial palette that sits inside
// the paper/gold/signal theme rather than fighting it.
const LINE_COLORS = ['#E8C547', '#E8743B', '#7FB069', '#5BC0BE', '#C46BAA', '#D98C5F', '#9FB4FF', '#E0584B'];

// Streak badge: 🔥 for a winning run, 🧊 for a losing run, with the count.
const StreakBadge = ({ stat, className }: { stat: PunterStat; className?: string }) => {
  if (stat.current.type === 'none' || stat.current.length === 0) return null;
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

// SVG race chart: cumulative points (y) over finished matches (x), one line per
// punter, with their emoji parked at the leading edge.
const RaceChart = ({ stats, steps }: { stats: PunterStat[]; steps: number }) => {
  const W = 360, H = 220;
  const EMOJI = 16;

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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Points race over time">
      {ticks.map(p => (
        <g key={p}>
          <line x1={padL} x2={endX} y1={y(p)} y2={y(p)} stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} />
          <text x={padL - 2} y={y(p) + 3} fontSize={8} fill="#ffffff" fillOpacity={0.3} fontFamily="monospace" textAnchor="end">{p}</text>
        </g>
      ))}
      {stats.map((s, idx) => {
        const color = LINE_COLORS[idx % LINE_COLORS.length];
        const pts = s.timeline.map((p, i) => `${x(i)},${y(p)}`).join(' ');
        const endY = y(s.points);
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
              animate={{ pathLength: 1, opacity: 1 }}
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
    </svg>
  );
};

export const AnalyticsLab = ({ users, bets, matches, onBack }: any) => {
  const { finished, stats } = useMemo(
    () => computePunterStats(users, bets, matches),
    [users, bets, matches],
  );

  // Leaderboard order for the legend / streak list.
  const ranked = useMemo(() => [...stats].sort((a, b) => b.points - a.points), [stats]);

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
          <div className="bg-pitch-800/20 border border-chalk rounded p-2 mb-8">
            <RaceChart stats={stats} steps={finished.length} />
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

          {/* Per-punter streak legend */}
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
            Form Guide
          </div>
          <div className="flex flex-col gap-2">
            {ranked.map((s, idx) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded border border-transparent bg-pitch-800/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: LINE_COLORS[stats.findIndex(x => x.id === s.id) % LINE_COLORS.length] }}
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
