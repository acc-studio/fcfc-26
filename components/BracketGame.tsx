'use client';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  Match, Player, BracketPrediction,
  BRACKET_ROUNDS, BRACKET_MATCH_IDS, bracketSides, prunePicks, bracketAccuracy, outcomeOf,
} from '@/lib/data';
import { Flag } from './Flag';
import { Emoji } from './Emoji';
import { NODE_W, CONN_W, TOTAL, Connector, STAGE_LABEL } from './Bracket';

const TOTAL_PICKS = BRACKET_MATCH_IDS.length;   // 31 ties to fill

type Sides = { home?: string; away?: string };

// One predicted tie: two team rows. In build mode a row is tappable to send that
// team through; in view mode the chosen row is highlighted (and, once the real
// tie is settled, coloured green/red by whether the prediction came true).
const PredNode = ({ sides, pick, slotH, mode, onPick, decided, actual }: {
  sides: Sides; pick?: string; slotH: number;
  mode: 'build' | 'view'; onPick?: (team: string) => void;
  decided: boolean; actual?: string;
}) => {
  const teamRow = (team?: string) => {
    const isPick = !!team && team === pick;
    const selectable = mode === 'build' && !!team;
    let tone: string;
    if (isPick && mode === 'view' && decided) {
      tone = team === actual
        ? 'border-green-500/60 bg-green-500/10 text-green-300'
        : 'border-red-500/60 bg-red-500/10 text-red-300';
    } else if (isPick) {
      tone = 'border-gold/60 bg-gold/10 text-gold font-bold';
    } else {
      tone = clsx('border-transparent', team ? 'text-paper/55' : 'text-paper/25');
    }
    return (
      <button
        type="button"
        disabled={!selectable}
        onClick={() => team && onPick?.(team)}
        className={clsx(
          'flex items-center gap-1.5 min-w-0 w-full rounded-sm border px-1.5 py-1 text-left transition-colors touch-manipulation',
          tone,
          selectable && !isPick && 'hover:border-gold/30',
        )}
      >
        {team
          ? <Flag team={team} className="w-4 h-3 shrink-0" />
          : <span className="w-4 h-3 shrink-0 rounded-[2px] border border-dashed border-white/15" />}
        <span className="truncate text-[11px] font-sans">{team ?? 'TBD'}</span>
      </button>
    );
  };
  return (
    <div className="relative flex items-center" style={{ height: slotH }}>
      <div style={{ width: NODE_W }} className="flex flex-col gap-0.5 rounded border border-white/10 bg-[#1A2621] p-1">
        {teamRow(sides.home)}
        {teamRow(sides.away)}
      </div>
    </div>
  );
};

// The full prediction tree (R32 → Final), reusing the live bracket's geometry so
// the SVG connectors line up. `picks` drives every node; higher rounds resolve
// their competitors from the picks below them.
const PredTree = ({ picks, byId, mode, onPick }: {
  picks: Record<number, string>; byId: Map<number, Match>;
  mode: 'build' | 'view'; onPick?: (id: number, team: string) => void;
}) => (
  <div className="overflow-x-auto no-scrollbar pb-2">
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
                const out = m && m.status === 'FINISHED' ? outcomeOf(m) : null;
                const decided = out === 'HOME' || out === 'AWAY';
                return (
                  <PredNode
                    key={id}
                    sides={bracketSides(id, picks, byId)}
                    pick={picks[id]}
                    slotH={TOTAL / round.ids.length}
                    mode={mode}
                    onPick={(team) => onPick?.(id, team)}
                    decided={decided}
                    actual={decided ? (out === 'HOME' ? m!.home : m!.away) : undefined}
                  />
                );
              })}
            </div>
          </div>
          {r < BRACKET_ROUNDS.length - 1 && (
            <div className="flex flex-col"><div className="h-5" /><Connector r={r} /></div>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Predicted champion = the winner the user sent through the final (match 104).
const Champion = ({ team, label }: { team?: string; label: string }) => (
  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-paper/40">
    <span>🏆 {label}</span>
    {team
      ? <span className="flex items-center gap-1.5 text-gold normal-case tracking-normal font-sans font-bold text-sm">
          <Flag team={team} className="w-5 h-3.5" /> {team}
        </span>
      : <span className="text-paper/30">—</span>}
  </div>
);

interface Props {
  matches: Match[];
  players: Player[];
  currentUser: string;
  brackets: Record<string, BracketPrediction>;
  onLock: (picks: Record<number, string>) => void;
}

export const BracketGame = ({ matches, players, currentUser, brackets, onLock }: Props) => {
  const byId = useMemo(() => {
    const map = new Map<number, Match>();
    for (const m of matches) map.set(m.id, m);
    return map;
  }, [matches]);
  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of players) map.set(p.id, p);
    return map;
  }, [players]);

  const myBracket = currentUser ? brackets[currentUser] : undefined;
  const [mode, setMode] = useState<'list' | 'build'>('list');
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);

  // Drafts live per-player in localStorage until locked (they never hit Firestore
  // unlocked — the `brackets` collection only ever holds final, locked picks).
  const draftKey = currentUser ? `pitch_bracket_draft_${currentUser}` : null;
  useEffect(() => {
    if (!draftKey) { setDraft({}); return; }
    try {
      const raw = localStorage.getItem(draftKey);
      setDraft(raw ? JSON.parse(raw) : {});
    } catch { setDraft({}); }
    setMode('list');
    setConfirmLock(false);
  }, [draftKey]);

  const made = useMemo(() => BRACKET_MATCH_IDS.filter((id) => draft[id]).length, [draft]);
  const complete = made === TOTAL_PICKS;

  // CRITICAL: a bracket pick is a separate minigame and must NEVER touch real
  // match bets. This only mutates the local `draft` (and its own localStorage
  // key); the bets collection/state is unreachable from here — BracketGame is
  // never handed `bets` or any bet handler, and its only write path is `onLock`
  // (-> brackets/{user}). Do not wire bet writes into this component.
  const handlePick = (matchId: number, team: string) => {
    setConfirmLock(false);
    setDraft((prev) => {
      const next = prunePicks({ ...prev, [matchId]: team }, byId);
      if (draftKey) localStorage.setItem(draftKey, JSON.stringify(next));
      return next;
    });
  };

  const doLock = () => {
    if (!complete) return;
    onLock(draft);
    if (draftKey) localStorage.removeItem(draftKey);
    setDraft({});
    setConfirmLock(false);
    setMode('list');
  };

  // Locked brackets, sorted most-accurate first (undecided sort last); ignored
  // players are already absent from `players`, so their brackets drop out too.
  const lockedList = useMemo(() =>
    Object.values(brackets)
      .filter((b) => b.locked && playerById.has(b.user_id))
      .map((b) => ({ b, player: playerById.get(b.user_id)!, acc: bracketAccuracy(b.picks, byId) }))
      .sort((a, c) => (c.acc.pct ?? -1) - (a.acc.pct ?? -1) || a.player.name.localeCompare(c.player.name)),
    [brackets, playerById, byId]);

  // --- Build mode ---------------------------------------------------------
  if (mode === 'build') {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-serif text-lg text-gold leading-tight">Build Your Bracket</h3>
          <span className="font-mono text-[11px] tabular-nums text-paper/50">{made}/{TOTAL_PICKS}</span>
        </div>
        <p className="font-mono text-[10px] leading-relaxed text-paper/40 mb-3">
          tap who advances in each tie — your pick carries into the next round, all the way to the trophy.
        </p>
        {/* progress bar */}
        <div className="h-1 w-full rounded bg-pitch-800 overflow-hidden mb-4">
          <div className="h-full bg-gold transition-all" style={{ width: `${(made / TOTAL_PICKS) * 100}%` }} />
        </div>

        <PredTree picks={draft} byId={byId} mode="build" onPick={handlePick} />

        <div className="mt-3 mb-4"><Champion team={draft[104]} label="Your champion" /></div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!complete}
            onClick={() => (confirmLock ? doLock() : setConfirmLock(true))}
            className={clsx(
              'flex-1 py-3 font-mono font-bold uppercase tracking-wider rounded text-xs transition-colors',
              !complete
                ? 'bg-pitch-800 text-paper/30 cursor-not-allowed'
                : confirmLock
                  ? 'bg-signal text-white hover:bg-red-600'
                  : 'bg-gold text-pitch-900 hover:bg-gold/90',
            )}
          >
            {!complete ? `Pick all ${TOTAL_PICKS} ties` : confirmLock ? 'Tap again — locks forever' : 'Lock In'}
          </button>
          <button
            type="button"
            onClick={() => { setMode('list'); setConfirmLock(false); }}
            className="px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-paper/50 hover:text-paper border border-chalk rounded transition-colors"
          >
            Cancel
          </button>
        </div>
        {complete && !confirmLock && (
          <p className="mt-2 font-mono text-[10px] text-paper/30 text-center">A locked bracket is permanent — no edits after.</p>
        )}
      </div>
    );
  }

  // --- List / view mode ---------------------------------------------------
  const viewBracket = viewing ? brackets[viewing] : undefined;
  const viewPlayer = viewing ? playerById.get(viewing) : undefined;
  const viewAcc = viewBracket ? bracketAccuracy(viewBracket.picks, byId) : null;

  return (
    <div className="w-full">
      <h3 className="font-serif text-lg text-gold leading-tight mb-1">Build Your Bracket</h3>
      <p className="font-mono text-[10px] leading-relaxed text-paper/40 mb-4">
        call the whole knockout in advance, then watch your accuracy climb (or crash).
      </p>

      {/* Owner's entry point */}
      {!currentUser ? (
        <p className="font-mono text-[11px] text-paper/40 border border-chalk rounded p-4 text-center mb-5">
          Select your profile to build a bracket.
        </p>
      ) : myBracket ? (
        <div className="flex items-center justify-between gap-3 border border-gold/30 bg-gold/5 rounded p-3 mb-5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg"><Emoji emoji={playerById.get(currentUser)?.avatar ?? '⚽'} /></span>
            <span className="font-mono text-[11px] text-paper/60">Your bracket is locked.</span>
          </div>
          <span className="font-mono text-sm font-bold text-gold tabular-nums shrink-0">
            {bracketAccuracy(myBracket.picks, byId).pct ?? '—'}{bracketAccuracy(myBracket.picks, byId).pct !== null && '%'}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setMode('build'); setConfirmLock(false); }}
          className="w-full py-3 mb-5 bg-gold text-pitch-900 font-mono font-bold uppercase tracking-wider rounded text-xs hover:bg-gold/90 transition-colors"
        >
          {made > 0 ? `Resume Building · ${made}/${TOTAL_PICKS}` : 'Build Your Bracket'}
        </button>
      )}

      {/* The locked brackets, ranked by accuracy */}
      {lockedList.length === 0 ? (
        <p className="font-mono text-[10px] uppercase tracking-widest text-paper/30 text-center py-6">
          No locked brackets yet.
        </p>
      ) : (
        <>
          <div className="font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2 mb-2">
            Brackets · most accurate
          </div>
          <div className="flex flex-col gap-2">
            {lockedList.map(({ b, player, acc }, i) => {
              const open = viewing === b.user_id;
              const champ = b.picks[104];
              return (
                <div key={b.user_id} className="rounded border border-chalk bg-pitch-800/30 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewing(open ? null : b.user_id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-pitch-800/50 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-paper/30 w-4 tabular-nums">{i + 1}</span>
                    <span className="text-lg shrink-0"><Emoji emoji={player.avatar} /></span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-sans font-bold text-sm text-paper truncate">{player.name}&rsquo;s Bracket</span>
                      <span className="flex items-center gap-1 font-mono text-[10px] text-paper/40 truncate">
                        {champ ? <><Flag team={champ} className="w-3.5 h-2.5" /> {champ}</> : 'no champion'}
                      </span>
                    </div>
                    <span className="ml-auto shrink-0 flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gold tabular-nums">
                        {acc.pct === null ? '—' : `${acc.pct}%`}
                      </span>
                      <span className={clsx('font-mono text-[10px] text-paper/30 transition-transform', open && 'rotate-90')}>▸</span>
                    </span>
                  </button>
                  {open && viewBracket && viewPlayer && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="border-t border-chalk p-3"
                    >
                      <div className="mb-2"><Champion team={viewBracket.picks[104]} label={`${viewPlayer.name}'s champion`} /></div>
                      <PredTree picks={viewBracket.picks} byId={byId} mode="view" />
                      {viewAcc && viewAcc.decided > 0 && (
                        <p className="mt-2 font-mono text-[10px] text-paper/40">
                          {viewAcc.correct}/{viewAcc.decided} ties called right so far
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
