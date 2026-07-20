'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { clsx } from 'clsx';
import {
  computeWrappedStats,
  type WrappedStats, type WrappedPersonal, type PunterStat,
  type Player, type Bet, type Match,
} from '@/lib/data';
import { Emoji, isDistortedFace, DISTORTED_FACE_SRC } from '@/components/Emoji';
import { Flag } from '@/components/Flag';

// Warm editorial line palette, shared with the Analytics Lab race so a punter's
// colour is consistent across the app.
const PALETTE = ['#E8C547', '#E8743B', '#7FB069', '#5BC0BE', '#C46BAA', '#D98C5F', '#9FB4FF', '#E0584B'];
const GOLD = '#E8C547';
const colorOf = (standings: PunterStat[], id: string) =>
  PALETTE[Math.max(0, standings.findIndex(s => s.id === id)) % PALETTE.length];

// ---------------------------------------------------------------------------
// Little animated primitives
// ---------------------------------------------------------------------------

// Eased count-up from 0 to `to`. Replays on mount, so each story slide animates
// its headline number fresh every time it's shown.
function CountUp({ to, duration = 1.6, delay = 0.15, className, format }: {
  to: number; duration?: number; delay?: number; className?: string; format?: (n: number) => string;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration, delay, ease: [0.16, 1, 0.3, 1],
      onUpdate: x => setV(x),
    });
    return () => controls.stop();
  }, [to, duration, delay]);
  return <span className={className}>{format ? format(v) : Math.round(v)}</span>;
}

const Kicker = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={clsx('font-mono text-[10px] uppercase tracking-[0.3em] text-paper/45', className)}>{children}</p>
);

// Sweeping accuracy gauge. The arc animates from empty to `pct`, number counting
// up inside it.
function Ring({ pct, color, size = 208 }: { pct: number; color: string; size?: number }) {
  const stroke = 12;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-paper))" strokeOpacity={0.1} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - Math.min(1, pct / 100)) }}
          transition={{ duration: 1.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-6xl font-black text-paper leading-none">
          <CountUp to={pct} duration={1.7} delay={0.35} />
          <span className="text-3xl align-top" style={{ color }}>%</span>
        </span>
        <Kicker className="mt-2">Accuracy</Kicker>
      </div>
    </div>
  );
}

// The replay stretches with the size of the tournament (so a long season still
// unfolds slowly enough to follow) but stays bounded. Kept in one place so the
// chart animation and the slide's on-screen hold agree.
const RACE_START = 0.6;
const raceAnimSec = (steps: number) => Math.min(11, Math.max(5, steps * 0.18));

// An avatar riding the race — either the native emoji or the bundled SVG for
// the one glyph Windows can't render.
function RaceAvatar({ avatar, x, y, size = 15 }: { avatar: string; x: number; y: number; size?: number }) {
  if (isDistortedFace(avatar)) {
    return <image href={DISTORTED_FACE_SRC} x={x} y={y - size / 2} width={size} height={size} />;
  }
  return <text x={x} y={y + size * 0.34} fontSize={size}>{avatar}</text>;
}

// The points race, replayed as a tracking shot. A wide camera follows the
// leading edge toward the finish line (holding still through the early matches,
// then panning gently so nothing whips past), while the vertical window fits the
// *pack* — the spread between last and first place — so the tips always fill the
// height and stay clearly separated, zooming out only as the field spreads.
function MiniRace({ standings, steps }: { standings: PunterStat[]; steps: number }) {
  const maxX = Math.max(1, steps);
  const [xf, setXf] = useState(0);
  useEffect(() => {
    const controls = animate(0, maxX, {
      duration: raceAnimSec(maxX), delay: RACE_START, ease: 'linear',
      onUpdate: v => setXf(v),
    });
    return () => controls.stop();
  }, [maxX]);

  // The viewBox is a fixed, TALL frame (portrait-ish) so the chart fills the
  // screen vertically and the emoji/numbers render at a legible size — its
  // dimensions are the on-screen window, NOT the whole world, so a wide season
  // never squashes it. Match spacing (STEP_W) is decoupled from that frame, so
  // we can show plenty of context without shrinking anything.
  const VW = 360, VH = 470, LEFT = 26, GUTTER = 106, TOP = 34, BOT = 38;
  const plotH = VH - TOP - BOT;

  // Show ~16 matches of context in the window; STEP_W falls out of that.
  const visibleSteps = Math.min(maxX, 16);
  const STEP_W = (VW - LEFT - GUTTER) / visibleSteps;
  const worldX = (i: number) => LEFT + i * STEP_W;
  const finishX = worldX(maxX);
  const worldW = finishX + GUTTER;

  // Camera holds still until the frontier reaches ~60% across, then pans gently
  // to keep the leading edge in view — so the opening matches play on a still
  // frame and nothing whips past.
  const headX = worldX(xf);
  const vbX = Math.max(0, Math.min(worldW - VW, headX - VW * 0.6));

  // Cumulative points partway between two matches (linear glide between steps).
  const at = (tl: number[], f: number) => {
    const i0 = Math.floor(f);
    const i1 = Math.min(tl.length - 1, i0 + 1);
    return tl[i0] + (tl[i1] - tl[i0]) * (f - i0);
  };
  const floorX = Math.floor(xf);

  // Frontier value per punter; overlapping tips fan sideways so both are legible.
  const stack: Record<string, number> = {};
  const frontier = standings.map(s => {
    const p = at(s.timeline, xf);
    const key = p.toFixed(1);
    const slot = stack[key] ?? 0;
    stack[key] = slot + 1;
    return { s, p, slot };
  });

  // Vertical window fits the pack (min → max of the current tips) with headroom,
  // held to a minimum span so a tied field isn't absurdly magnified. The tips
  // therefore span the full height and only bunch when scores genuinely bunch.
  let lo = Math.min(...frontier.map(f => f.p));
  let hi = Math.max(...frontier.map(f => f.p));
  if (hi - lo < 3) { const c = (hi + lo) / 2; lo = c - 1.5; hi = c + 1.5; }
  const pad = (hi - lo) * 0.2;
  lo -= pad; hi += pad;
  const y = (p: number) => TOP + plotH - ((p - lo) / (hi - lo)) * plotH;

  const tickEvery = Math.max(1, Math.round((hi - lo) / 4));
  const ticks: number[] = [];
  for (let p = Math.ceil(lo); p <= hi; p += tickEvery) if (p >= 0) ticks.push(p);

  return (
    <svg viewBox={`${vbX} 0 ${VW} ${VH}`} className="w-full h-full" role="img" aria-label="Points race replay" preserveAspectRatio="xMidYMid meet">
      {/* gridlines span the world; labels pin to the camera's left edge */}
      {ticks.map(p => (
        <g key={p}>
          <line x1={LEFT} x2={finishX} y1={y(p)} y2={y(p)} stroke="rgb(var(--c-paper))" strokeOpacity={0.08} strokeWidth={1} />
          <text x={vbX + 4} y={y(p) - 3} fontSize={12} fill="rgb(var(--c-paper))" fillOpacity={0.35} fontFamily="monospace">{p}</text>
        </g>
      ))}

      {/* finish line */}
      <line x1={finishX} x2={finishX} y1={TOP} y2={TOP + plotH} stroke={GOLD} strokeOpacity={0.55} strokeWidth={2} strokeDasharray="3 5" />
      <text x={finishX} y={TOP - 10} fontSize={13} fill={GOLD} fillOpacity={0.75} fontFamily="monospace" textAnchor="middle" letterSpacing={1}>FT</text>

      {standings.map(s => {
        const color = colorOf(standings, s.id);
        const pts: string[] = [];
        for (let i = 0; i <= floorX; i++) pts.push(`${worldX(i)},${y(s.timeline[i])}`);
        pts.push(`${headX},${y(at(s.timeline, xf))}`);
        return (
          <polyline key={s.id} points={pts.join(' ')} fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        );
      })}

      {frontier.map(({ s, p, slot }) => {
        const color = colorOf(standings, s.id);
        const cy = y(p);
        const ax = headX + 9 + slot * 46;
        const shown = Math.floor(p + 1e-6);
        return (
          <g key={s.id}>
            <circle cx={headX} cy={cy} r={5} fill={color} />
            <RaceAvatar avatar={s.avatar} x={ax} y={cy} size={24} />
            <text x={ax + 26} y={cy + 6} fontSize={19} fontWeight={700} fill={color} fontFamily="monospace">{shown}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Final table as growing bars — leader in gold, everyone else in their race colour.
function StandingsBars({ standings }: { standings: PunterStat[] }) {
  const max = Math.max(1, ...standings.map(s => s.points));
  return (
    <div className="flex flex-col gap-2.5 w-full">
      {standings.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3">
          <span className="font-mono text-xs text-paper/40 w-4 text-right tabular-nums">{i + 1}</span>
          <span className="text-lg w-6 text-center leading-none"><Emoji emoji={s.avatar} /></span>
          <div className="flex-1 h-8 relative rounded-sm overflow-hidden bg-pitch-800/50">
            <motion.div
              className="absolute inset-y-0 left-0"
              style={{ backgroundColor: i === 0 ? GOLD : colorOf(standings, s.id), opacity: i === 0 ? 0.85 : 0.45 }}
              initial={{ width: 0 }}
              animate={{ width: `${(s.points / max) * 100}%` }}
              transition={{ duration: 0.9, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="absolute inset-y-0 left-2.5 flex items-center font-sans font-bold text-xs text-paper truncate pr-2">
              {s.name}
            </span>
          </div>
          <span className={clsx('font-mono text-sm font-bold w-6 text-right tabular-nums', i === 0 && 'text-gold')}>
            {s.points}
          </span>
        </div>
      ))}
    </div>
  );
}

// A small scoreline strip (used for the match-of-the-tournament + rarest call).
function ScoreStrip({ m, highlight }: { m: Match; highlight?: 'HOME' | 'AWAY' | 'DRAW' }) {
  const rh = m.result_home as number, ra = m.result_away as number;
  return (
    <div className="flex items-center justify-center gap-3 w-full">
      <div className={clsx('flex-1 flex items-center justify-end gap-2 min-w-0', highlight === 'HOME' && 'text-gold')}>
        <span className="font-sans font-bold text-sm truncate">{m.home}</span>
        <Flag team={m.home} className="w-7 h-5 shrink-0" />
      </div>
      <div className="font-serif text-3xl font-black tabular-nums shrink-0 px-1">
        {rh}<span className="text-paper/30 px-1">–</span>{ra}
      </div>
      <div className={clsx('flex-1 flex items-center gap-2 min-w-0', highlight === 'AWAY' && 'text-gold')}>
        <Flag team={m.away} className="w-7 h-5 shrink-0" />
        <span className="font-sans font-bold text-sm truncate">{m.away}</span>
      </div>
    </div>
  );
}

// Falling gold/signal confetti behind the champion reveal.
function Confetti() {
  const specks = Array.from({ length: 26 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {specks.map(i => {
        const left = (i * 37) % 100;
        const delay = (i % 8) * 0.18;
        const size = 5 + (i % 4) * 2;
        const color = i % 3 === 0 ? '#FF4500' : GOLD;
        return (
          <motion.span
            key={i}
            className="absolute top-0 rounded-[1px]"
            style={{ left: `${left}%`, width: size, height: size * 1.6, backgroundColor: color }}
            initial={{ y: -30, opacity: 0, rotate: 0 }}
            animate={{ y: '105vh', opacity: [0, 1, 1, 0.6], rotate: 360 + i * 20 }}
            transition={{ duration: 2.6 + (i % 5) * 0.3, delay, ease: 'easeIn', repeat: Infinity, repeatDelay: 1.2 }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide content builders
// ---------------------------------------------------------------------------

type Slide = { accent: string; node: React.ReactNode; duration?: number };

function accuracyGrade(p: WrappedPersonal): string {
  if (p.rank === 1) return 'Aga of agas. Nobody laid a glove on you. 👑';
  if (p.rank === p.total && p.total > 1) return 'Someone had to prop up the table. It was you. 🪑';
  if (p.rank <= Math.ceil(p.total / 2)) return 'Top half. Respectable punting, aga.';
  return 'Room to grow. 2030 has your name on it.';
}

function buildSlides(stats: WrappedStats): Slide[] {
  const slides: Slide[] = [];
  const p = stats.personal;

  // — Cover —
  slides.push({
    accent: GOLD,
    node: (
      <div className="flex flex-col items-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Kicker>2026 World Cup · The Aga Edition</Kicker>
        </motion.div>
        <motion.h1
          className="mt-6 font-serif font-black leading-[0.85] text-paper text-7xl md:text-8xl"
          initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 120, damping: 14 }}
        >
          FCFC<br />&rsquo;26
        </motion.h1>
        <motion.div
          className="mt-4 font-serif text-4xl md:text-5xl italic text-gold"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        >
          Wrapped
        </motion.div>
        <motion.p
          className="mt-10 font-mono text-xs text-paper/50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
        >
          {stats.finishedCount} matches · {stats.totalGoals} goals · one long summer
        </motion.p>
        <motion.p
          className="mt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-paper/30 animate-pulse"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
        >
          tap to begin →
        </motion.p>
      </div>
    ),
  });

  // — Personal block —
  if (p && p.picks > 0) {
    const color = colorOf(stats.standings, p.id);

    slides.push({
      accent: color,
      node: (
        <div className="flex flex-col items-center">
          <Kicker>Let&rsquo;s rewind your summer</Kicker>
          <motion.div
            className="mt-8 text-8xl"
            initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 12, delay: 0.2 }}
          >
            <Emoji emoji={p.avatar} />
          </motion.div>
          <motion.h2
            className="mt-8 font-serif text-5xl md:text-6xl font-black text-paper"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
          >
            {p.name}
          </motion.h2>
          <motion.p
            className="mt-4 font-mono text-sm text-paper/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          >
            this is how you punted.
          </motion.p>
        </div>
      ),
    });

    slides.push({
      accent: color,
      node: (
        <div className="flex flex-col items-center">
          <Kicker>You committed</Kicker>
          <div className="mt-6 font-serif font-black leading-none text-paper text-[7rem] md:text-[9rem]">
            <CountUp to={p.picks} />
          </div>
          <p className="mt-2 font-serif text-3xl italic text-gold">predictions</p>
          <motion.p
            className="mt-8 font-mono text-sm text-paper/50 max-w-xs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}
          >
            locked in, no takebacks. {p.picks >= stats.finishedCount ? 'You called every single one.' : 'Some you dodged. Wise.'}
          </motion.p>
        </div>
      ),
    });

    slides.push({
      accent: color,
      node: (
        <div className="flex flex-col items-center">
          <Ring pct={p.accuracy ?? 0} color={color} />
          <motion.p
            className="mt-8 font-serif text-2xl text-paper"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}
          >
            <span className="font-black text-gold">{p.points}</span> right out of {p.picks}
          </motion.p>
          <motion.p
            className="mt-2 font-mono text-xs text-paper/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}
          >
            finished <span className="text-paper font-bold">#{p.rank}</span> of {p.total}
          </motion.p>
          <motion.p
            className="mt-6 font-serif text-lg italic text-paper/70 max-w-xs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
          >
            {accuracyGrade(p)}
          </motion.p>
        </div>
      ),
    });

    slides.push({
      accent: color,
      node: (
        <div className="flex flex-col items-center w-full">
          <Kicker>Your streaks</Kicker>
          <div className="mt-10 grid grid-cols-2 gap-4 w-full max-w-sm">
            <motion.div
              className="flex flex-col items-center gap-2 p-5 rounded border border-signal/40 bg-signal/5"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            >
              <span className="text-3xl">🔥</span>
              <span className="font-serif text-6xl font-black text-signal leading-none"><CountUp to={p.longestHot} delay={0.5} /></span>
              <Kicker>hot streak</Kicker>
            </motion.div>
            <motion.div
              className="flex flex-col items-center gap-2 p-5 rounded border border-chalk bg-pitch-800/40"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}
            >
              <span className="text-3xl">🧊</span>
              <span className="font-serif text-6xl font-black text-paper/70 leading-none"><CountUp to={p.longestCold} delay={0.65} /></span>
              <Kicker>cold streak</Kicker>
            </motion.div>
          </div>
          <motion.p
            className="mt-8 font-serif text-lg italic text-paper/70 max-w-xs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          >
            {p.longestHot >= p.longestCold
              ? `You reeled off ${p.longestHot} on the bounce. Genuinely warm.`
              : `${p.longestCold} losses in a row. We don't talk about that week.`}
          </motion.p>
        </div>
      ),
    });

    if (p.topTeam) {
      slides.push({
        accent: color,
        node: (
          <div className="flex flex-col items-center">
            <Kicker>You rode with</Kicker>
            <motion.div
              className="mt-8"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 140, damping: 13, delay: 0.2 }}
            >
              <Flag team={p.topTeam.team} className="w-40 h-auto shadow-xl" />
            </motion.div>
            <motion.h2
              className="mt-6 font-serif text-4xl md:text-5xl font-black text-paper"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            >
              {p.topTeam.team}
            </motion.h2>
            <motion.p
              className="mt-3 font-mono text-sm text-paper/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            >
              backed <span className="text-gold font-bold">{p.topTeam.count}</span> time{p.topTeam.count === 1 ? '' : 's'}
            </motion.p>
            {p.topConfed && (
              <motion.p
                className="mt-8 font-serif text-xl italic text-paper/80 max-w-xs"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
              >
                That makes you a card-carrying {p.topConfed.emoji} <span className="text-gold not-italic font-bold">{p.topConfed.title}</span>
                <span className="block mt-1 font-mono text-[10px] not-italic tracking-widest text-paper/40 uppercase">
                  {p.topConfed.count} picks backing {p.topConfed.confed}
                </span>
              </motion.p>
            )}
          </div>
        ),
      });
    }

    if (p.nemesis && p.nemesis.losses >= 2) {
      const n = p.nemesis;
      slides.push({
        accent: '#FF4500',
        node: (
          <div className="flex flex-col items-center">
            <Kicker>Your biggest heartbreak</Kicker>
            <motion.div
              className="relative mt-8"
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 140, damping: 13, delay: 0.2 }}
            >
              <Flag team={n.team} className="w-40 h-auto grayscale-[0.35] shadow-xl" />
              <motion.span
                className="absolute -bottom-4 -right-4 text-5xl"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 10, delay: 0.7 }}
              >
                💔
              </motion.span>
            </motion.div>
            <motion.h2
              className="mt-8 font-serif text-4xl md:text-5xl font-black text-paper"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            >
              {n.team}
            </motion.h2>
            <motion.p
              className="mt-3 font-mono text-sm text-paper/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            >
              you backed them & lost <span className="text-signal font-bold"><CountUp to={n.losses} delay={0.9} /></span> time{n.losses === 1 ? '' : 's'}
            </motion.p>
            <motion.p
              className="mt-8 font-serif text-lg italic text-paper/70 max-w-xs"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}
            >
              {p.topTeam?.team === n.team
                ? 'Loyalty is a beautiful thing. It cost you dearly.'
                : 'You never learned your lesson. They never repaid the faith.'}
            </motion.p>
          </div>
        ),
      });
    }

    if (p.rarest) {
      const r = p.rarest;
      const hl = r.pick;
      const backed = r.pick === 'HOME' ? r.match.home : r.pick === 'AWAY' ? r.match.away : 'the draw';
      slides.push({
        accent: '#C46BAA',
        node: (
          <div className="flex flex-col items-center w-full">
            <Kicker>Your boldest call</Kicker>
            <motion.div
              className="mt-10 w-full"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            >
              <ScoreStrip m={r.match} highlight={hl} />
            </motion.div>
            <motion.p
              className="mt-8 font-serif text-2xl text-paper max-w-xs"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            >
              You backed <span className="text-gold font-black">{backed}</span> when almost nobody else would.
            </motion.p>
            <motion.p
              className="mt-3 font-mono text-xs text-paper/50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
            >
              rarity value banked: <span className="text-gold font-bold">{r.score.toFixed(2)}</span>
            </motion.p>
          </div>
        ),
      });
    }

    if (stats.koFinishedCount > 0 && (p.koHits > 0 || p.bottles > 0)) {
      slides.push({
        accent: color,
        node: (
          <div className="flex flex-col items-center w-full">
            <Kicker>In the knockouts</Kicker>
            <div className="mt-10 flex items-end justify-center gap-10">
              <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <span className="font-serif text-7xl font-black text-gold leading-none"><CountUp to={p.koHits} delay={0.5} /></span>
                <Kicker>called right 🦸</Kicker>
              </motion.div>
              <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <span className="font-serif text-7xl font-black text-signal leading-none"><CountUp to={p.bottles} delay={0.7} /></span>
                <Kicker>doomed 🍾</Kicker>
              </motion.div>
            </div>
            <motion.p
              className="mt-10 font-serif text-lg italic text-paper/70 max-w-xs"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            >
              {p.bottles > p.koHits
                ? `You sent ${p.bottles} teams home that stayed alive. Cruel.`
                : `You read the big nights. ${p.koHits} on the money.`}
            </motion.p>
          </div>
        ),
      });
    }
  } else if (p) {
    // Logged in but never committed a pick.
    slides.push({
      accent: GOLD,
      node: (
        <div className="flex flex-col items-center">
          <div className="text-8xl"><Emoji emoji={p.avatar} /></div>
          <h2 className="mt-6 font-serif text-4xl font-black text-paper">{p.name}</h2>
          <p className="mt-6 font-serif text-2xl italic text-paper/70 max-w-xs">
            You watched the whole thing from the stands. <span className="text-gold">Zero</span> predictions.
          </p>
          <p className="mt-4 font-mono text-xs text-paper/40">bold strategy. see you in 2030.</p>
        </div>
      ),
    });
  }

  // — Group block —
  slides.push({
    accent: '#7FB069',
    node: (
      <div className="flex flex-col items-center w-full">
        <Kicker>The tourney, by the numbers</Kicker>
        <div className="mt-10 flex flex-col gap-8 w-full">
          {[
            { to: stats.finishedCount, label: 'matches settled', d: 0.2 },
            { to: stats.totalGoals, label: 'goals witnessed', d: 0.5 },
            { to: stats.totalPicks, label: 'predictions cast', d: 0.8 },
          ].map(row => (
            <motion.div
              key={row.label}
              className="flex items-baseline justify-between border-b border-chalk pb-3"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: row.d }}
            >
              <span className="font-serif text-6xl md:text-7xl font-black text-paper leading-none">
                <CountUp to={row.to} delay={row.d} />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/45">{row.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  });

  const raceAnim = raceAnimSec(stats.finishedCount);
  slides.push({
    accent: '#5BC0BE',
    // Give the tracking shot room to breathe before auto-advancing.
    duration: (RACE_START + raceAnim) * 1000 + 3200,
    node: (
      <div className="flex flex-col items-center w-full">
        <Kicker>The race, replayed</Kicker>
        <motion.div
          className="mt-4 w-full h-[58vh] bg-pitch-800/30 border border-chalk rounded p-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        >
          <MiniRace standings={stats.standings} steps={stats.finishedCount} />
        </motion.div>
        <motion.p
          className="mt-5 font-mono text-xs text-paper/50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: RACE_START + raceAnim + 0.3 }}
        >
          points, match by match. only one line stayed on top.
        </motion.p>
      </div>
    ),
  });

  if (stats.champion) {
    const c = stats.champion;
    slides.push({
      accent: GOLD,
      node: (
        <div className="relative flex flex-col items-center w-full">
          <Confetti />
          <div className="relative flex flex-col items-center">
            <Kicker>Your FCFC &rsquo;26 champion</Kicker>
            <motion.div
              className="mt-6 text-9xl"
              initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 140, damping: 11, delay: 0.3 }}
            >
              <Emoji emoji={c.avatar} />
            </motion.div>
            <motion.h2
              className="mt-6 font-serif text-6xl md:text-7xl font-black text-gold"
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
            >
              {c.name}
            </motion.h2>
            <motion.p
              className="mt-4 font-serif text-2xl text-paper"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
            >
              <span className="font-black text-gold"><CountUp to={c.points} delay={0.9} /></span> points
            </motion.p>
            <motion.p
              className="mt-6 font-mono text-xs text-paper/50 max-w-xs"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }}
            >
              {stats.personal?.id === c.id ? 'Yeah. That’s you. Absolute unit. 🐐' : 'The rest of you were playing for second.'}
            </motion.p>
          </div>
        </div>
      ),
    });
  }

  if (stats.standings.length > 1) {
    slides.push({
      accent: '#E8743B',
      node: (
        <div className="flex flex-col items-center w-full">
          <Kicker>The final table</Kicker>
          <div className="mt-10 w-full"><StandingsBars standings={stats.standings} /></div>
        </div>
      ),
    });
  }

  // Superlatives wall — only the awards that actually have a winner.
  const awards = [
    stats.gambler && { emoji: '🎲', title: 'The Gambler', name: stats.gambler.name, avatar: stats.gambler.avatar, note: `${stats.gambler.risky} risky bets` },
    stats.jockey && { emoji: '🏇', title: 'The Dark Jockey', name: stats.jockey.name, avatar: stats.jockey.avatar, note: `${stats.jockey.hits}/${stats.jockey.risky} underdogs paid` },
    stats.valueKing && { emoji: '👑', title: 'The Value King', name: stats.valueKing.name, avatar: stats.valueKing.avatar, note: `${stats.valueKing.value.toFixed(1)} value banked` },
    stats.hero && { emoji: '🦸', title: 'Knockout Hero', name: stats.hero.name, avatar: stats.hero.avatar, note: `${stats.hero.koHits} knockouts nailed` },
    stats.bottler && { emoji: '🍾', title: 'The Bottler', name: stats.bottler.name, avatar: stats.bottler.avatar, note: `backed the loser ${stats.bottler.bottles}×` },
  ].filter(Boolean) as { emoji: string; title: string; name: string; avatar: string; note: string }[];

  if (awards.length > 0) {
    slides.push({
      accent: '#C46BAA',
      node: (
        <div className="flex flex-col items-center w-full">
          <Kicker>The superlatives</Kicker>
          <div className="mt-8 flex flex-col gap-3 w-full">
            {awards.map((a, i) => (
              <motion.div
                key={a.title}
                className="flex items-center gap-4 p-3.5 rounded border border-chalk bg-pitch-800/40"
                initial={{ opacity: 0, x: i % 2 ? 24 : -24 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.14, type: 'spring', stiffness: 120, damping: 14 }}
              >
                <span className="text-3xl shrink-0">{a.emoji}</span>
                <div className="flex flex-col text-left min-w-0">
                  <Kicker>{a.title}</Kicker>
                  <span className="font-serif text-xl font-black text-paper truncate">
                    <Emoji emoji={a.avatar} /> {a.name}
                  </span>
                  <span className="font-mono text-[10px] text-paper/45">{a.note}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    });
  }

  const feature = stats.highestScoring;
  if (feature) {
    const goals = (feature.result_home as number) + (feature.result_away as number);
    slides.push({
      accent: '#E0584B',
      node: (
        <div className="flex flex-col items-center w-full">
          <Kicker>The match of the tournament</Kicker>
          <div className="mt-6 font-serif font-black text-paper text-[7rem] leading-none"><CountUp to={goals} /></div>
          <p className="-mt-1 font-serif text-2xl italic text-gold">goals in one game</p>
          <motion.div
            className="mt-10 w-full"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
          >
            <ScoreStrip m={feature} />
          </motion.div>
          <motion.p
            className="mt-6 font-mono text-[10px] uppercase tracking-widest text-paper/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          >
            {feature.date} · pure chaos
          </motion.p>
        </div>
      ),
    });
  }

  // — Outro —
  slides.push({
    accent: GOLD,
    node: (
      <div className="flex flex-col items-center">
        <motion.h2
          className="font-serif text-6xl md:text-7xl font-black text-paper leading-[0.9]"
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}
        >
          That&rsquo;s<br />a wrap.
        </motion.h2>
        <motion.p
          className="mt-8 font-serif text-2xl italic text-gold"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        >
          See you in 2030, aga.
        </motion.p>
        <motion.p
          className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-paper/40"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        >
          FCFC &rsquo;26
        </motion.p>
      </div>
    ),
  });

  return slides;
}

// ---------------------------------------------------------------------------
// Shareable summary card — the finale. A branded recap the punter can save or
// share as a single PNG, drawn on a canvas (no DOM screenshot / dependency, so
// it renders identically everywhere and never taints on cross-origin assets).
// ---------------------------------------------------------------------------

// Fixed dark palette for the exported image, independent of the app's theme.
const IMG = {
  bg: '#0F1A15', card: '#16261F', paper: '#E8E6D9',
  gold: '#D4AF37', signal: '#FF4500', mute: 'rgba(232,230,217,0.5)', line: 'rgba(232,230,217,0.15)',
};

async function buildShareImage(stats: WrappedStats): Promise<Blob | null> {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Resolve the app's actual fonts (next/font CSS vars) with safe fallbacks.
  const cs = getComputedStyle(document.body);
  const serif = (cs.getPropertyValue('--font-fraunces') || '').trim() || 'Georgia, serif';
  const mono = (cs.getPropertyValue('--font-chivo') || '').trim() || 'ui-monospace, monospace';
  try { await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* fine without */ }

  const cx = W / 2;

  // Background: pitch green + a gold glow from the top, plus a framed border.
  ctx.fillStyle = IMG.bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx, 140, 40, cx, 140, 940);
  glow.addColorStop(0, 'rgba(212,175,55,0.20)'); glow.addColorStop(1, 'rgba(212,175,55,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(212,175,55,0.5)'; ctx.lineWidth = 3; ctx.strokeRect(42, 42, W - 84, H - 84);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Header kicker.
  ctx.fillStyle = IMG.mute; ctx.font = `600 30px ${mono}`;
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '8px'; } catch { /* ok */ }
  ctx.fillText('FCFC ’26 WRAPPED', cx, 150);
  try { (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'; } catch { /* ok */ }

  const centerLine = (txt: string, y: number, font: string, color: string) => {
    ctx.font = font; ctx.fillStyle = color; ctx.fillText(txt, cx, y);
  };
  const divider = (y: number) => {
    ctx.strokeStyle = IMG.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 80, y); ctx.lineTo(cx + 80, y); ctx.stroke();
  };

  const p = stats.personal;
  const champ = stats.champion;

  if (p) {
    centerLine(p.avatar, 320, `130px ${serif}`, IMG.paper);
    centerLine(p.name, 430, `800 82px ${serif}`, IMG.paper);
    divider(478);

    // Hero: finishing position.
    centerLine(`#${p.rank}`, 700, `800 200px ${serif}`, IMG.gold);
    centerLine(`of ${p.total} punters`, 752, `500 30px ${mono}`, IMG.mute);

    // Stat line.
    const acc = p.accuracy !== null ? `${p.accuracy}% ACCURATE` : '—';
    centerLine(`${acc}   ·   ${p.points} PTS   ·   🔥 ${p.longestHot}`, 878, `700 40px ${mono}`, IMG.paper);

    let y = 990;
    if (p.topTeam) { centerLine(`Rode with ${p.topTeam.team}`, y, `italic 44px ${serif}`, IMG.paper); y += 66; }
    if (p.topConfed) { centerLine(`${p.topConfed.emoji} ${p.topConfed.title}`, y, `800 44px ${serif}`, IMG.gold); y += 70; }
    if (p.nemesis && p.nemesis.losses >= 2) {
      centerLine(`💔 ${p.nemesis.team} broke your heart ${p.nemesis.losses}×`, y, `600 34px ${mono}`, IMG.signal);
      y += 60;
    }
    if (champ) centerLine(`👑 Champion — ${champ.avatar} ${champ.name}`, 1240, `500 32px ${mono}`, IMG.mute);
  } else if (champ) {
    // Group cut (logged out): crown the champion + a couple of headlines.
    centerLine('THE CHAMPION', 300, `600 30px ${mono}`, IMG.mute);
    centerLine(champ.avatar, 470, `140px ${serif}`, IMG.paper);
    centerLine(champ.name, 590, `800 84px ${serif}`, IMG.gold);
    divider(636);
    centerLine(`${champ.points}`, 830, `800 190px ${serif}`, IMG.gold);
    centerLine('POINTS', 884, `500 30px ${mono}`, IMG.mute);
    let y = 1010;
    if (stats.gambler) { centerLine(`🎲 Gambler — ${stats.gambler.name}`, y, `500 32px ${mono}`, IMG.paper); y += 56; }
    if (stats.bottler) { centerLine(`🍾 Bottler — ${stats.bottler.name}`, y, `500 32px ${mono}`, IMG.paper); y += 56; }
    centerLine(`${stats.finishedCount} matches · ${stats.totalGoals} goals`, 1240, `500 30px ${mono}`, IMG.mute);
  }

  // Footer.
  centerLine('THE AGA EDITION · 2026', 1300, `600 24px ${mono}`, IMG.mute);

  return await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
}

// One compact stat tile for the on-screen preview.
const MiniStat = ({ label, value, tint }: { label: string; value: React.ReactNode; tint?: boolean }) => (
  <div className="flex flex-col gap-1 rounded border border-chalk bg-pitch-900/40 px-3 py-2">
    <span className="font-mono text-[9px] uppercase tracking-widest text-paper/40">{label}</span>
    <span className={clsx('font-serif text-lg font-black leading-none', tint ? 'text-gold' : 'text-paper')}>{value}</span>
  </div>
);

function SummaryCard({ stats, onClose, onReplay }: { stats: WrappedStats; onClose: () => void; onReplay: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const p = stats.personal;
  const champ = stats.champion;

  const handleImage = async (mode: 'share' | 'save') => {
    setBusy(true); setStatus(null);
    try {
      const blob = await buildShareImage(stats);
      if (!blob) throw new Error('no-canvas');
      const file = new File([blob], 'fcfc-26-wrapped.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
      if (mode === 'share' && nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: 'FCFC ’26 Wrapped', text: p ? `${p.name}’s FCFC ’26 Wrapped` : 'FCFC ’26 Wrapped' });
        setStatus('Shared ✓');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'fcfc-26-wrapped.png';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        setStatus(mode === 'share' ? 'Saved (share unsupported)' : 'Saved ✓');
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') setStatus('Could not make image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <Kicker>Your Wrapped, wrapped</Kicker>

      {/* On-screen recap (the PNG mirrors this) */}
      <div className="mt-4 w-full relative overflow-hidden rounded-lg border border-gold/40 bg-pitch-800/50 p-5 text-left">
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 50% 0%, ${GOLD}22, transparent 55%)` }} />
        <div className="relative">
          {p ? (
            <>
              <div className="flex items-center gap-3">
                <span className="font-serif text-5xl font-black text-gold leading-none">#{p.rank}</span>
                <div className="min-w-0">
                  <div className="font-serif text-2xl font-black text-paper truncate leading-tight">
                    <Emoji emoji={p.avatar} /> {p.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-paper/45">of {p.total} punters</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat label="Accuracy" value={p.accuracy !== null ? `${p.accuracy}%` : '—'} tint />
                <MiniStat label="Points" value={p.points} />
                <MiniStat label="Best 🔥" value={p.longestHot} />
              </div>
              <div className="mt-3 flex flex-col gap-1.5 font-mono text-[11px] text-paper/70">
                {p.topTeam && (
                  <span className="flex items-center gap-2">
                    <Flag team={p.topTeam.team} className="w-5 h-3.5" /> Rode with <b className="text-paper">{p.topTeam.team}</b>
                    {p.topConfed && <span className="text-gold">· {p.topConfed.emoji} {p.topConfed.title}</span>}
                  </span>
                )}
                {p.nemesis && p.nemesis.losses >= 2 && (
                  <span className="flex items-center gap-2 text-signal">
                    <Flag team={p.nemesis.team} className="w-5 h-3.5" /> 💔 {p.nemesis.team} · lost {p.nemesis.losses}×
                  </span>
                )}
                {champ && (
                  <span className="text-paper/50">👑 Champion — <Emoji emoji={champ.avatar} /> {champ.name}</span>
                )}
              </div>
            </>
          ) : champ ? (
            <>
              <div className="font-mono text-[10px] uppercase tracking-widest text-paper/45">The champion</div>
              <div className="mt-1 font-serif text-3xl font-black text-gold leading-tight">
                <Emoji emoji={champ.avatar} /> {champ.name}
              </div>
              <div className="mt-1 font-mono text-xs text-paper/60">{champ.points} points</div>
              <div className="mt-3 font-mono text-[11px] text-paper/60">
                {stats.finishedCount} matches · {stats.totalGoals} goals
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Share / Save */}
      <div className="mt-5 grid grid-cols-2 gap-3 w-full">
        <button
          onClick={() => handleImage('share')}
          disabled={busy}
          className="bg-gold text-pitch-900 font-mono text-[11px] font-bold uppercase tracking-widest py-3.5 rounded hover:bg-gold/85 transition-colors disabled:opacity-50"
        >
          {busy ? '…' : '📤 Share'}
        </button>
        <button
          onClick={() => handleImage('save')}
          disabled={busy}
          className="border border-gold/50 bg-gold/5 text-gold font-mono text-[11px] font-bold uppercase tracking-widest py-3.5 rounded hover:bg-gold/15 transition-colors disabled:opacity-50"
        >
          {busy ? '…' : '💾 Save image'}
        </button>
      </div>
      <p className="mt-2 h-4 font-mono text-[10px] uppercase tracking-widest text-paper/45">{status}</p>

      {/* Navigation */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          onClick={onReplay}
          className="font-mono text-[11px] uppercase tracking-widest text-paper/60 border border-chalk hover:text-paper px-5 py-2.5 rounded transition-colors"
        >
          ↺ Replay
        </button>
        <button
          onClick={onClose}
          className="font-mono text-[11px] uppercase tracking-widest text-paper/60 border border-chalk hover:text-paper px-5 py-2.5 rounded transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story player — full-screen, auto-advancing, tap/hold/swipe controlled
// ---------------------------------------------------------------------------

const DURATION = 7000; // ms per slide

function WrappedPlayer({ slides, stats, onClose, onReplay }: { slides: Slide[]; stats: WrappedStats; onClose: () => void; onReplay: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // The shareable summary is appended as the final slide (index === slides.length).
  const total = slides.length + 1;
  const isSummary = i === slides.length;
  const isLast = i === total - 1;

  const next = useCallback(() => setI(v => Math.min(total - 1, v + 1)), [total]);
  const prev = useCallback(() => setI(v => Math.max(0, v - 1)), []);

  // Lock body scroll while the story is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Keyboard: arrows to navigate, escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  // Auto-advance timer driven by rAF. The active progress segment's width is
  // mutated on the ref directly (no per-frame re-render); the outro stays put.
  const rafRef = useRef<number | undefined>(undefined);
  const startRef = useRef(0);
  const elapsedRef = useRef(0);
  const lastIRef = useRef(0);
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A fresh slide resets the clock; an unpause resumes from where we were.
    if (lastIRef.current !== i) { lastIRef.current = i; elapsedRef.current = 0; }
    if (paused || isLast) return;
    const dur = slides[i]?.duration ?? DURATION;
    startRef.current = performance.now() - elapsedRef.current;
    const tick = (t: number) => {
      const e = t - startRef.current;
      elapsedRef.current = e;
      const pr = Math.min(1, e / dur);
      if (fillRef.current) fillRef.current.style.width = `${pr * 100}%`;
      if (pr >= 1) { setI(v => Math.min(total - 1, v + 1)); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [i, paused, isLast, slides, total]);

  // Pointer: hold pauses, quick tap navigates by side, drag swipes.
  const downRef = useRef<{ t: number; x: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    downRef.current = { t: performance.now(), x: e.clientX };
    setPaused(true);
  };
  const release = (e: React.PointerEvent) => {
    setPaused(false);
    const d = downRef.current;
    downRef.current = null;
    if (!d) return;
    const dt = performance.now() - d.t;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 60) { if (dx < 0) next(); else prev(); return; }
    if (dt < 260 && Math.abs(dx) < 20) {
      if ((e.target as HTMLElement).closest('button')) return; // let controls handle it
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      if (rel < 0.32) prev(); else next();
    }
  };

  const accent = isSummary ? GOLD : slides[i].accent;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-pitch-900 flex flex-col select-none"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onPointerDown={onDown}
      onPointerUp={release}
      onPointerCancel={() => { setPaused(false); downRef.current = null; }}
    >
      {/* progress segments (one per slide + the summary) */}
      <div className="flex gap-1.5 px-4 pt-4 pb-2 z-20">
        {Array.from({ length: total }).map((_, idx) => {
          // Past segments are full; the active one is driven by rAF via fillRef
          // (or full when it's the summary, which doesn't auto-advance).
          const done = idx < i || (idx === i && isLast);
          return (
            <div key={idx} className="flex-1 h-[3px] rounded-full bg-paper/15 overflow-hidden">
              <div
                ref={idx === i ? fillRef : undefined}
                className="h-full bg-paper rounded-full"
                style={{ width: done ? '100%' : '0%' }}
              />
            </div>
          );
        })}
      </div>

      {/* header row */}
      <div className="flex items-center justify-between px-5 py-2 z-20">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper/40">FCFC &rsquo;26 Wrapped</span>
        <button
          onClick={onClose}
          aria-label="Close Wrapped"
          className="font-mono text-lg text-paper/50 hover:text-paper transition-colors px-2 leading-none"
        >
          ✕
        </button>
      </div>

      {/* slide stage */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {/* accent glow — layered, not a flat fill */}
        <motion.div
          key={`glow-${i}`}
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
          style={{ background: `radial-gradient(120% 80% at 50% 12%, ${accent}26, transparent 60%)` }}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            className={clsx(
              'relative w-full max-w-md px-8 text-center',
              isSummary ? 'max-h-full overflow-y-auto py-4 no-scrollbar' : 'pb-16',
            )}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.02, y: -12 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {isSummary
              ? <SummaryCard stats={stats} onClose={onClose} onReplay={onReplay} />
              : slides[i].node}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Tab entry — cover card that launches the story
// ---------------------------------------------------------------------------

interface WrappedProps {
  users: Player[];
  bets: Record<string, Bet | undefined>;
  matches: Match[];
  currentUser: string | null;
}

export const Wrapped = ({ users, bets, matches, currentUser }: WrappedProps) => {
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0); // bump to remount the player (replay)

  const stats = useMemo(
    () => computeWrappedStats(users, bets, matches, currentUser),
    [users, bets, matches, currentUser],
  );
  const slides = useMemo(() => buildSlides(stats), [stats]);

  const locked = stats.finishedCount === 0;

  return (
    <div className="w-full max-w-md mx-auto mt-12">
      {/* Cover card */}
      <div className="relative overflow-hidden rounded-lg border border-gold/40 bg-pitch-800/40 p-8 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(120% 90% at 50% 0%, ${GOLD}1f, transparent 55%)` }}
        />
        <div className="relative">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper/45">2026 World Cup</p>
          <h2 className="mt-4 font-serif text-5xl font-black leading-[0.9] text-paper">
            FCFC &rsquo;26<br /><span className="italic text-gold">Wrapped</span>
          </h2>
          <p className="mt-6 font-mono text-xs text-paper/50 leading-relaxed">
            Your season in review — the streaks, the bottle-jobs, the champion, and
            the team you couldn&rsquo;t quit.
          </p>

          {locked ? (
            <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-paper/40 border border-chalk rounded py-4 px-3">
              Unlocks once results roll in.
            </p>
          ) : (
            <>
              <div className="mt-8 flex items-center justify-center gap-6 font-mono text-[10px] uppercase tracking-widest text-paper/40">
                <span><span className="block font-serif text-2xl text-paper not-italic">{stats.finishedCount}</span>matches</span>
                <span><span className="block font-serif text-2xl text-paper not-italic">{stats.totalGoals}</span>goals</span>
                <span><span className="block font-serif text-2xl text-paper not-italic">{slides.length + 1}</span>slides</span>
              </div>
              <button
                onClick={() => { setRunId(r => r + 1); setPlaying(true); }}
                className="mt-8 w-full bg-gold text-pitch-900 font-mono text-xs font-bold uppercase tracking-[0.2em] py-4 rounded hover:bg-gold/85 transition-colors"
              >
                ▶ Play your Wrapped
              </button>
              {!currentUser && (
                <p className="mt-4 font-mono text-[10px] text-gold/60">
                  Log in for your personal chapter — otherwise it&rsquo;s the group cut.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {playing && (
          <WrappedPlayer
            key={runId}
            slides={slides}
            stats={stats}
            onClose={() => setPlaying(false)}
            onReplay={() => setRunId(r => r + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
