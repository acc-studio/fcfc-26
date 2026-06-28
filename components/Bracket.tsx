'use client';
import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Match, Player, Pick, BRACKET_ROUNDS, THIRD_PLACE_ID, outcomeOf } from '@/lib/data';
import { Flag } from './Flag';
import { Emoji } from './Emoji';

// Horizontal knockout tree (Round of 32 → Final), live from the `matches` feed.
// Geometry is deterministic: round r (R32 = 0) has 16/2^r nodes, each centered
// in a slot of height H*2^r, so the whole bracket is always H*16 tall and a
// flex column with `justify-around` centers node i at H*2^r*(i+0.5). The SVG
// connectors are drawn from those exact centers, so they always line up.
const H = 64;            // R32 slot height (px)
const TOTAL = H * 16;    // full bracket height
const NODE_W = 156;
const CONN_W = 30;
const STROKE = 'rgba(255,255,255,0.14)';

const STAGE_LABEL: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-finals', SF: 'Semi-finals', FINAL: 'Final',
};

type Pickers = { HOME: Player[]; AWAY: Player[] };

// Whether a match's pick is "committed" (and so its bettors are revealable),
// mirroring MatchCard: locked in, or the match has kicked off (LIVE/FINISHED).
const isCommitted = (m: Match | undefined, bet: { locked?: boolean } | undefined) =>
  !!bet && (!!bet.locked || (!!m && m.status !== 'UPCOMING'));

// One team line inside a node.
const TeamRow = ({ side, team, m, outcome, hasScore, isLive }: {
  side: 'HOME' | 'AWAY'; team: string; m: Match; outcome: Pick | null; hasScore: boolean; isLive: boolean;
}) => {
  const won = outcome === side;
  const score = side === 'HOME' ? m.result_home : m.result_away;
  const pen = m.shootout ? (side === 'HOME' ? m.shootout.home : m.shootout.away) : undefined;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Flag team={team} className="w-5 h-3.5 shrink-0" />
      <span className={clsx(
        'truncate text-[11px] font-sans',
        won ? 'text-gold font-bold' : hasScore ? 'text-paper/40' : 'text-paper/70',
      )}>{team}</span>
      {hasScore && (
        <span className={clsx(
          'ml-auto pl-1 font-mono text-[11px] tabular-nums shrink-0',
          isLive ? 'text-signal' : won ? 'text-gold' : 'text-paper/40',
        )}>
          {score}{pen !== undefined ? <span className="text-[8px] align-top"> {pen}p</span> : null}
        </span>
      )}
    </div>
  );
};

// One bracket node (fixed height so the SVG connectors stay aligned). `pickers`
// is supplied only while the node is open.
const Node = ({ m, slotH, open, onToggle, pickers }: {
  m: Match | undefined; slotH: number; open: boolean; onToggle: () => void; pickers: Pickers | null;
}) => {
  if (!m) return <div style={{ height: slotH }} />;
  const outcome = outcomeOf(m);
  const isLive = m.status === 'LIVE';
  const hasScore = m.result_home !== undefined && m.result_away !== undefined;

  return (
    <div className="relative flex items-center" style={{ height: slotH }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: NODE_W }}
        className={clsx(
          'flex flex-col gap-1 rounded border bg-[#1A2621] px-2 py-1.5 text-left select-none touch-manipulation transition-colors',
          open ? 'border-gold/50' : 'border-white/10 hover:border-gold/30',
        )}
      >
        <div className="flex items-center justify-between font-mono text-[7px] uppercase tracking-widest text-paper/30">
          <span>{m.date}</span>
          {isLive ? <span className="text-signal font-bold animate-pulse">● LIVE</span> : m.shootout ? <span className="text-gold/60">PENS</span> : null}
        </div>
        <TeamRow side="HOME" team={m.home} m={m} outcome={outcome} hasScore={hasScore} isLive={isLive} />
        <TeamRow side="AWAY" team={m.away} m={m} outcome={outcome} hasScore={hasScore} isLive={isLive} />
      </button>

      {open && pickers && (
        <div className="absolute top-full left-0 z-30 mt-1 w-[180px] rounded border border-gold/40 bg-pitch-900/95 p-2 flex flex-col gap-1.5 shadow-xl">
          {(['HOME', 'AWAY'] as const).map((side) => (
            <div key={side} className="flex items-start gap-1.5">
              <Flag team={side === 'HOME' ? m.home : m.away} className="w-4 h-3 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1 min-w-0">
                {pickers[side].length === 0
                  ? <span className="font-mono text-[9px] text-paper/30">—</span>
                  : pickers[side].map(p => (
                    <span key={p.id} title={p.name} className="text-sm leading-none"><Emoji emoji={p.avatar} /></span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// SVG elbow connectors between round r and r+1, drawn from the exact node centers.
const Connector = ({ r }: { r: number }) => {
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

interface BracketProps {
  matches: Match[];
  players: Player[];
  bets: Record<string, { pick?: Pick; locked?: boolean } | undefined>;
  currentUser: string;
}

export const Bracket = ({ matches, players, bets, currentUser }: BracketProps) => {
  const byId = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) map.set(m.id, m);
    return map;
  }, [matches]);
  const [openId, setOpenId] = useState<number | null>(null);

  // Bettors per side for a match, honouring the See-Bets gate: your own pick is
  // always shown; others' only once you've committed on this match (or when no
  // one is logged in, since betting is then impossible anyway). Uncommitted
  // picks are never revealed.
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

  const third = byId.get(THIRD_PLACE_ID);

  return (
    <div className="w-full">
      <div className="overflow-x-auto no-scrollbar pb-4">
        <div className="flex items-stretch" style={{ minWidth: BRACKET_ROUNDS.length * (NODE_W + CONN_W) }}>
          {BRACKET_ROUNDS.map((round, r) => (
            <div key={round.stage} className="flex items-stretch">
              <div className="flex flex-col" style={{ width: NODE_W }}>
                <div className="font-mono text-[8px] uppercase tracking-widest text-paper/40 h-5 flex items-center">
                  {STAGE_LABEL[round.stage]}
                </div>
                <div className="flex flex-col justify-around" style={{ height: TOTAL }}>
                  {round.ids.map((id) => {
                    const m = byId.get(id);
                    return (
                      <Node
                        key={id}
                        m={m}
                        slotH={TOTAL / round.ids.length}
                        open={openId === id}
                        onToggle={() => setOpenId(openId === id ? null : id)}
                        pickers={openId === id && m ? pickersFor(m) : null}
                      />
                    );
                  })}
                </div>
              </div>
              {r < BRACKET_ROUNDS.length - 1 && (
                <div className="flex flex-col">
                  <div className="h-5" />
                  <Connector r={r} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Third-place play-off — a side fixture, shown on its own under the tree */}
      {third && (
        <div className="mt-2 max-w-xs">
          <div className="font-mono text-[8px] uppercase tracking-widest text-paper/40 mb-1">Third place</div>
          <Node
            m={third}
            slotH={64}
            open={openId === THIRD_PLACE_ID}
            onToggle={() => setOpenId(openId === THIRD_PLACE_ID ? null : THIRD_PLACE_ID)}
            pickers={openId === THIRD_PLACE_ID ? pickersFor(third) : null}
          />
        </div>
      )}
    </div>
  );
};
