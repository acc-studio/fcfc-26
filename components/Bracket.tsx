'use client';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  Match, Player, Pick, BRACKET_ROUNDS, BRACKET_FEEDERS, BRACKET_MATCH_IDS,
  THIRD_PLACE_ID, outcomeOf,
} from '@/lib/data';
import { Flag } from './Flag';
import { Emoji } from './Emoji';

// --- Shared geometry for the *prediction* build tree (BracketGame, build mode)-
// The live bracket and the locked-bracket view are drawn radially (see below),
// but Build Your Bracket still renders a horizontal tree while *picking* and
// reuses these. Keep them exported and unchanged.
export const H = 64;            // R32 slot height (px)
export const TOTAL = H * 16;    // full bracket height
export const NODE_W = 156;
export const CONN_W = 30;
const STROKE = 'rgb(var(--c-paper) / 0.2)';   // theme-aware: visible on light + dark

export const STAGE_LABEL: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', FINAL: 'Final',
};

// SVG elbow connectors between round r and r+1 for the horizontal build tree.
export const Connector = ({ r }: { r: number }) => {
  const childSlot = H * Math.pow(2, r);
  const parents = BRACKET_ROUNDS[r + 1].ids.length;
  const paths: string[] = [];
  for (let j = 0; j < parents; j++) {
    const yA = childSlot * (2 * j + 0.5);
    const yB = childSlot * (2 * j + 1.5);
    const yP = childSlot * (2 * j + 1);
    paths.push(`M0 ${yA} H${CONN_W / 2} V${yP} H${CONN_W}`);
    paths.push(`M0 ${yB} H${CONN_W / 2} V${yP}`);
  }
  return (
    <svg width={CONN_W} height={TOTAL} className="shrink-0" aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={STROKE} strokeWidth={1.5} />)}
    </svg>
  );
};

// --- Radial bracket ---------------------------------------------------------
// The whole knockout tree folded into a circle (like the meme): the Final's
// champion at the centre, the two finalists left/right, and the 32 Round-of-32
// teams ringing the outside. Each match node sits at the angular midpoint of its
// two feeders, one ring further in. Geometry depends only on the feeder map, so
// it's computed once at module load and shared by every radial bracket.
const VIEW = 1000;
const CX = VIEW / 2;
// radius by match depth: 0 = Final (centre) … 4 = R32 winner; index 5 = the
// outer ring where the 32 competing teams sit.
const RING = [0, 128, 212, 292, 368, 444];
const RADIAL_STROKE = 'rgb(var(--c-paper) / 0.22)';   // theme-aware: visible on light + dark

// Flag diameter per match depth, in container-query width units (cqw = 1% of
// the bracket's width) so every chip scales *with* the circle — the whole thing
// shrinks to fit a phone instead of overlapping. Values are tuned at the 560px
// max width (e.g. 5.4cqw ≈ 30px there); the champion is only a touch larger than
// the finalists. The outer ring is smallest since 32 flags crowd it.
const NODE_SIZE: Record<number, string> = { 0: '8.2cqw', 1: '7.5cqw', 2: '6.4cqw', 3: '5.7cqw', 4: '5.7cqw' };
const LEAF_SIZE = '5.4cqw';

const pct = (v: number) => `${(v / VIEW) * 100}%`;

// A circular flag chip (the meme uses round flags). The inner flag is scaled up
// a touch so the country fills the circle (zoomed in past the thin border /
// letterboxing). `size` is any CSS length. Empty slot -> bare disc.
const CircleFlag = ({ team, size, className }: { team?: string; size: string; className?: string }) => (
  <span
    style={{ width: size, height: size }}
    className={clsx('block shrink-0 rounded-full overflow-hidden bg-pitch-800/80 transition-all', className)}
  >
    {team ? <Flag team={team} className="block h-full w-full scale-[1.25] border-0" /> : null}
  </span>
);

const RADIAL = (() => {
  const matchPos: Record<number, { x: number; y: number; angle: number; depth: number }> = {};
  const leaves: { matchId: number; side: 'HOME' | 'AWAY'; x: number; y: number }[] = [];
  const leafByMatch: Record<number, { HOME: { x: number; y: number }; AWAY: { x: number; y: number } }> = {};
  const pol = (r: number, a: number) => ({ x: CX + r * Math.cos(a), y: CX + r * Math.sin(a) });

  const place = (id: number, depth: number, a0: number, a1: number) => {
    const angle = (a0 + a1) / 2;
    matchPos[id] = { ...pol(RING[depth], angle), angle, depth };
    const feeders = BRACKET_FEEDERS[id];
    const mid = (a0 + a1) / 2;
    if (feeders) {
      place(feeders[0], depth + 1, a0, mid);
      place(feeders[1], depth + 1, mid, a1);
    } else {
      const rl = RING[depth + 1];
      const hp = pol(rl, (a0 + mid) / 2);
      const ap = pol(rl, (mid + a1) / 2);
      leaves.push({ matchId: id, side: 'HOME', ...hp });
      leaves.push({ matchId: id, side: 'AWAY', ...ap });
      leafByMatch[id] = { HOME: hp, AWAY: ap };
    }
  };
  // Start the Final at full circle, offset so its two children land left/right.
  place(104, 0, Math.PI / 2, Math.PI / 2 + Math.PI * 2);

  // Elbow connectors: each match's two children run inward to a joint at the
  // child radius / parent angle, then a single spoke continues to the parent.
  const f = (n: number) => n.toFixed(1);
  const connectors: string[] = [];
  for (const id of BRACKET_MATCH_IDS) {
    const node = matchPos[id];
    if (!node) continue;
    const childR = RING[node.depth + 1];
    const joint = { x: CX + childR * Math.cos(node.angle), y: CX + childR * Math.sin(node.angle) };
    connectors.push(`M${f(joint.x)} ${f(joint.y)} L${f(node.x)} ${f(node.y)}`);
    const feeders = BRACKET_FEEDERS[id];
    const kids = feeders
      ? feeders.map((c) => matchPos[c]).filter(Boolean)
      : [leafByMatch[id]?.HOME, leafByMatch[id]?.AWAY].filter(Boolean);
    for (const k of kids) connectors.push(`M${f(k!.x)} ${f(k!.y)} L${f(joint.x)} ${f(joint.y)}`);
  }
  return { matchPos, leaves, leafByMatch, connectors };
})();

// Per-slot visual state. Drives the ring colour of a flag chip.
export type SlotTone = 'win' | 'live' | 'correct' | 'wrong' | 'dim' | 'none';

const toneRing = (t: SlotTone) => {
  switch (t) {
    case 'win': return 'ring-2 ring-gold';
    case 'live': return 'ring-2 ring-signal animate-pulse';
    case 'correct': return 'ring-2 ring-green-500';
    case 'wrong': return 'ring-2 ring-red-500';
    case 'dim': return 'opacity-40';
    default: return '';
  }
};

interface RadialBracketProps {
  // Team + tone for an outer-ring slot (a R32 competitor).
  leaf: (matchId: number, side: 'HOME' | 'AWAY') => { team?: string; tone: SlotTone };
  // Team (the advancer) + tone for an inner match node.
  node: (id: number) => { team?: string; tone: SlotTone };
  // When given, every slot is tappable and reports its match id (live bracket).
  onSelect?: (id: number) => void;
  selectedId?: number | null;
}

// The pure circular bracket — geometry + flags only. Callers decide what each
// slot shows (live results vs. a prediction) and whether it's interactive.
export const RadialBracket = ({ leaf, node, onSelect, selectedId }: RadialBracketProps) => (
  // A query container so the cqw-sized flags scale with the circle: it always
  // fits the screen width (no horizontal panning) and shrinks proportionally on
  // a phone, so the flags never overlap.
  <div className="relative mx-auto aspect-square w-full max-w-[560px] [container-type:inline-size]">
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full" aria-hidden>
      {RADIAL.connectors.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={RADIAL_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>

    {/* outer ring: the 32 competing teams */}
    {RADIAL.leaves.map((lf, i) => {
      const { team, tone } = leaf(lf.matchId, lf.side);
      const sel = selectedId === lf.matchId;
      const chip = <CircleFlag team={team} size={LEAF_SIZE} className={clsx(toneRing(tone), sel && 'ring-2 ring-gold/70')} />;
      const style = { left: pct(lf.x), top: pct(lf.y) };
      const cls = 'absolute z-10 -translate-x-1/2 -translate-y-1/2';
      return onSelect
        ? <button key={i} type="button" onClick={() => onSelect(lf.matchId)} style={style} className={clsx(cls, 'touch-manipulation')} aria-label={team}>{chip}</button>
        : <span key={i} style={style} className={cls}>{chip}</span>;
    })}

    {/* inner match nodes: the advancing team (or a joint dot / the trophy) */}
    {BRACKET_MATCH_IDS.map((id) => {
      const np = RADIAL.matchPos[id];
      if (!np) return null;
      const { team, tone } = node(id);
      const isFinal = id === 104;
      const sel = selectedId === id;
      const size = NODE_SIZE[np.depth];
      let chip: React.ReactNode;
      if (team) {
        chip = <CircleFlag team={team} size={size} className={clsx(toneRing(tone), sel && 'ring-4 ring-gold')} />;
      } else if (isFinal) {
        chip = <span style={{ width: size, height: size, fontSize: `calc(${size} * 0.6)` }} className={clsx('flex shrink-0 items-center justify-center rounded-full leading-none', tone === 'live' && 'animate-pulse', sel && 'ring-2 ring-gold')}>🏆</span>;
      } else {
        chip = <span style={{ width: size, height: size }} className={clsx('block shrink-0 rounded-full border', tone === 'live' ? 'border-signal bg-signal/20 animate-pulse' : 'border-paper/25 bg-pitch-800', sel && 'ring-2 ring-gold')} />;
      }
      const style = { left: pct(np.x), top: pct(np.y) };
      const cls = 'absolute z-20 -translate-x-1/2 -translate-y-1/2';
      return onSelect
        ? <button key={id} type="button" onClick={() => onSelect(id)} style={style} className={clsx(cls, 'touch-manipulation')} aria-label={team ?? (isFinal ? 'Final' : 'Match')}>{chip}</button>
        : <span key={id} style={style} className={cls}>{chip}</span>;
    })}
  </div>
);

type Pickers = { HOME: Player[]; AWAY: Player[] };

// Whether a match's pick is "committed" (and so its bettors are revealable),
// mirroring MatchCard: locked in, or the match has kicked off (LIVE/FINISHED).
const isCommitted = (m: Match | undefined, bet: { locked?: boolean } | undefined) =>
  !!bet && (!!bet.locked || (!!m && m.status !== 'UPCOMING'));

interface BracketProps {
  matches: Match[];
  players: Player[];
  bets: Record<string, { pick?: Pick; locked?: boolean } | undefined>;
  currentUser: string;
}

// The live knockout bracket: a radial tree of real results, tap a flag for bets.
export const Bracket = ({ matches, players, bets, currentUser }: BracketProps) => {
  const byId = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) map.set(m.id, m);
    return map;
  }, [matches]);
  const [openId, setOpenId] = useState<number | null>(null);

  // Outer-ring slot: highlight the team that advanced, dim the one knocked out.
  const leaf = (matchId: number, side: 'HOME' | 'AWAY'): { team?: string; tone: SlotTone } => {
    const m = byId.get(matchId);
    const team = side === 'HOME' ? m?.home : m?.away;
    const outcome = m ? outcomeOf(m) : null;
    const decided = outcome === 'HOME' || outcome === 'AWAY';
    if (!decided) return { team, tone: 'none' };
    return { team, tone: outcome === side ? 'win' : 'dim' };
  };

  // Inner node: the advancing team's flag (or nothing until the tie is settled).
  const node = (id: number): { team?: string; tone: SlotTone } => {
    const m = byId.get(id);
    const outcome = m ? outcomeOf(m) : null;
    const decided = outcome === 'HOME' || outcome === 'AWAY';
    const advancer = decided && m ? (outcome === 'HOME' ? m.home : m.away) : undefined;
    if (m?.status === 'LIVE') return { team: advancer, tone: 'live' };
    return { team: advancer, tone: advancer ? 'win' : 'none' };
  };

  // Bettors per side for a match, honouring the See-Bets gate: your own pick is
  // always shown; others' only once you've committed on this match (or when no
  // one is logged in, since betting is then impossible anyway).
  const pickersFor = (m: Match): Pickers => {
    const out: Pickers = { HOME: [], AWAY: [] };
    const myBet = bets[`${currentUser}_${m.id}`];
    const myCommitted = isCommitted(m, myBet);
    for (const p of players) {
      const bet = bets[`${p.id}_${m.id}`];
      const pick = bet?.pick;
      if (pick !== 'HOME' && pick !== 'AWAY') continue;
      const mine = currentUser && p.id === currentUser;
      const canShow = !currentUser ? isCommitted(m, bet) : (mine ? true : myCommitted && isCommitted(m, bet));
      if (canShow) out[pick].push(p);
    }
    return out;
  };

  const openMatch = openId != null ? byId.get(openId) : undefined;
  const third = byId.get(THIRD_PLACE_ID);

  return (
    <div className="w-full">
      <RadialBracket leaf={leaf} node={node} onSelect={(id) => setOpenId(openId === id ? null : id)} selectedId={openId} />

      {/* Selected match detail — replaces the per-node popover from the old tree */}
      {openMatch && (() => {
        const m = openMatch;
        const pickers = pickersFor(m);
        const outcome = outcomeOf(m);
        const hasScore = m.result_home !== undefined && m.result_away !== undefined;
        const isLive = m.status === 'LIVE';
        return (
          <div className="mx-auto mt-4 max-w-sm rounded border border-gold/30 bg-pitch-900/80 p-3">
            <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-paper/40">
              <span>{m.stage ? STAGE_LABEL[m.stage] : 'Match'} · {m.date}</span>
              <div className="flex items-center gap-2">
                {isLive ? <span className="font-bold text-signal animate-pulse">● LIVE</span> : m.shootout ? <span className="text-gold/60">PENS</span> : null}
                <button type="button" onClick={() => setOpenId(null)} className="text-paper/40 hover:text-paper">✕</button>
              </div>
            </div>
            {(['HOME', 'AWAY'] as const).map((side) => {
              const team = side === 'HOME' ? m.home : m.away;
              const score = side === 'HOME' ? m.result_home : m.result_away;
              const pen = m.shootout ? (side === 'HOME' ? m.shootout.home : m.shootout.away) : undefined;
              const won = outcome === side;
              return (
                <div key={side} className="flex items-center gap-2 py-1">
                  <Flag team={team} className="h-3.5 w-5 shrink-0" />
                  <span className={clsx('truncate text-[12px] font-sans', won ? 'font-bold text-gold' : hasScore ? 'text-paper/40' : 'text-paper/70')}>{team}</span>
                  {hasScore && (
                    <span className={clsx('ml-1 font-mono text-[12px] tabular-nums', isLive ? 'text-signal' : won ? 'text-gold' : 'text-paper/40')}>
                      {score}{pen !== undefined ? <span className="align-top text-[8px]"> {pen}p</span> : null}
                    </span>
                  )}
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-1 pl-2">
                    {pickers[side].length === 0
                      ? <span className="font-mono text-[9px] text-paper/25">—</span>
                      : pickers[side].map((p) => (
                        <span key={p.id} title={p.name} className="text-sm leading-none"><Emoji emoji={p.avatar} /></span>
                      ))}
                  </div>
                </div>
              );
            })}
            <p className="mt-1.5 font-mono text-[8px] uppercase tracking-widest text-paper/25">tap a flag to see who picked whom</p>
          </div>
        );
      })()}

      {/* Third-place play-off — a side fixture, kept out of the circle */}
      {third && (() => {
        const out = outcomeOf(third);
        const sel = openId === THIRD_PLACE_ID;
        return (
          <div className="mx-auto mt-4 max-w-sm">
            <div className="mb-1 text-center font-mono text-[8px] uppercase tracking-widest text-paper/40">Third place play-off</div>
            <button
              type="button"
              onClick={() => setOpenId(sel ? null : THIRD_PLACE_ID)}
              className={clsx('mx-auto flex items-center justify-center gap-3 rounded border px-4 py-2 touch-manipulation', sel ? 'border-gold/50' : 'border-chalk hover:border-gold/30')}
            >
              <CircleFlag team={third.home} size="34px" className={clsx(out === 'HOME' && 'ring-2 ring-gold', out === 'AWAY' && 'opacity-40')} />
              <span className="font-mono text-[10px] text-paper/30">vs</span>
              <CircleFlag team={third.away} size="34px" className={clsx(out === 'AWAY' && 'ring-2 ring-gold', out === 'HOME' && 'opacity-40')} />
            </button>
          </div>
        );
      })()}
    </div>
  );
};
