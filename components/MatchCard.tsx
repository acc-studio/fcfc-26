'use client';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { ScoreDial } from './ScoreDial';
import { Match, Player, Pick, MatchEvent, FormMatch, Stage, betOutcome, isKnockout, teamsResolved } from '@/lib/data';
import { Flag } from './Flag';
import { FitText } from './FitText';
import { LineupModal } from './LineupModal';
import { Emoji } from './Emoji';

// Glyph for a live/finished match event (goals + red cards from the poller).
const EVENT_ICON: Record<MatchEvent['kind'], string> = {
  goal: '⚽', penalty: '⚽', 'own-goal': '⚽', red: '🟥',
};
const eventSuffix = (k: MatchEvent['kind']) => k === 'own-goal' ? ' (OG)' : k === 'penalty' ? ' (P)' : '';

// Short label for a knockout stage (shown on the card; group matches have none).
const STAGE_LABEL: Record<Stage, string> = {
  GROUP: '', R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-final',
  SF: 'Semi-final', THIRD: 'Third place', FINAL: 'Final',
};
const STAGE_TAG: Record<Stage, string> = {
  GROUP: '', R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF', THIRD: '3RD', FINAL: 'FINAL',
};

// Colour for a W/D/L form result.
const FORM_COLOR: Record<FormMatch['result'], string> = {
  W: 'bg-green-500', D: 'bg-yellow-500', L: 'bg-red-500',
};

// The 5 W/D/L squares, newest on the right (form arrives most-recent-first).
const FormDots = ({ form }: { form?: FormMatch[] }) => {
  if (!form || form.length === 0) return <span className="font-mono text-[9px] text-paper/30">—</span>;
  return (
    <span className="inline-flex gap-1">
      {[...form].slice(0, 5).reverse().map((f, i) => (
        <span
          key={i}
          title={`${f.result} ${f.gf}-${f.ga} vs ${f.opponent}`}
          className={clsx("w-2.5 h-2.5 md:w-3 md:h-3 rounded-[2px]", FORM_COLOR[f.result])}
        />
      ))}
    </span>
  );
};

// Expanded last-5 list for one team (shown when the form strip is tapped).
const FormList = ({ team, form }: { team: string; form?: FormMatch[] }) => (
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 mb-1">
      <Flag team={team} className="w-4 h-3 flex-shrink-0" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-paper/60 truncate">{team}</span>
    </div>
    {(!form || form.length === 0) ? (
      <p className="font-mono text-[9px] text-paper/30">No recent data</p>
    ) : (
      <div className="flex flex-col gap-0.5">
        {form.map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 font-mono text-[10px] text-paper/70">
            <span className={clsx("w-2 h-2 rounded-[1px] shrink-0", FORM_COLOR[f.result])} />
            <span className="tabular-nums shrink-0">{f.gf}-{f.ga}</span>
            <span className="truncate text-paper/50">v {f.opponent}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

interface MatchCardProps {
  match: Match;
  userBets: any;            // full map: `${uid}_${mid}` -> { pick, locked, user_id, match_id }
  players: Player[];
  onPick: (matchId: number, pick: Pick) => void;
  onLockIn: (matchId: number) => void;
  onSetResult: (
    matchId: number,
    result: { home: number; away: number; advance?: 'HOME' | 'AWAY'; shootout?: { home: number; away: number } },
  ) => void;
  onReopen: (matchId: number) => void;
  activeUser: string;
  isArbiter: boolean;
  // Kicked off (or past) but not finalized — betting is closed (auto-locked).
  locked?: boolean;
  // Future fixture outside the 48h window — betting hasn't opened yet.
  notYetOpen?: boolean;
  // Recent form (last 5, most-recent first) for each side, from the `teams` feed.
  homeForm?: FormMatch[];
  awayForm?: FormMatch[];
  // Extra classes for the root (e.g. masonry break/spacing from the parent).
  className?: string;
}

export const MatchCard = ({
  match, userBets, players, onPick, onLockIn, onSetResult, onReopen,
  activeUser, isArbiter, locked = false, notYetOpen = false,
  homeForm, awayForm, className,
}: MatchCardProps) => {
  const [adminScore, setAdminScore] = useState({ home: 0, away: 0 });
  const [adminPens, setAdminPens] = useState({ home: 0, away: 0 });
  const [adminAdvance, setAdminAdvance] = useState<'HOME' | 'AWAY'>('HOME');
  const [showBets, setShowBets] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showXI, setShowXI] = useState(false);

  const betKey = `${activeUser}_${match.id}`;
  const myBet = userBets[betKey];
  const myPick: Pick | undefined = myBet?.pick;
  const isFinished = match.status === 'FINISHED';
  const isLive = match.status === 'LIVE';
  const showArbiter = isArbiter && !notYetOpen;
  // Knockout fixtures: pick who advances (no Draw), and a slot isn't bettable
  // until the feeding round resolves it to two real teams.
  const knockout = isKnockout(match);
  const resolved = teamsResolved(match);
  // Player can still choose/change a pick: logged in, in the bettable window,
  // and hasn't manually locked it yet. Knockout slots also need resolved teams.
  const canPick = !!activeUser && !showArbiter && !isFinished && !notYetOpen && !locked && !myBet?.locked
    && (!knockout || resolved);
  // The bet is committed (counts + visible to others) once locked, kicked off,
  // or finalized.
  const committed = !!myBet?.pick && (myBet.locked || locked || isFinished);
  const outcome = betOutcome(myPick, match);

  useEffect(() => {
    if (match.result_home !== undefined && match.result_away !== undefined) {
      setAdminScore({ home: match.result_home, away: match.result_away });
    }
    if (match.shootout) setAdminPens({ home: match.shootout.home, away: match.shootout.away });
    // Default the "advances" toggle to the stored side, else the higher score.
    if (match.advance) setAdminAdvance(match.advance);
    else if (match.result_home !== undefined && match.result_away !== undefined && match.result_home !== match.result_away)
      setAdminAdvance(match.result_home > match.result_away ? 'HOME' : 'AWAY');
  }, [match.result_home, match.result_away, match.advance, match.shootout]);

  // Regulation level → the shootout dials decide who goes through.
  const adminLevel = adminScore.home === adminScore.away;

  const CARD_BG_COLOR = showArbiter ? "bg-[#2A1A1A]" : "bg-[#1A2621]";

  // Other players whose bet on this match is visible (locked / kicked off / done).
  const others = players
    .filter(p => p.id !== activeUser)
    .map(p => ({ p, bet: userBets[`${p.id}_${match.id}`] }))
    .filter(x => x.bet?.pick && (x.bet.locked || locked || isFinished));

  // Highlight ring for the selected pick (gold while open, green/red once done).
  const pickClass = (target: Pick) => {
    if (myPick !== target) return "border-transparent";
    if (isFinished) return outcome === 'win' ? "border-green-500/60 bg-green-500/10" : "border-red-500/60 bg-red-500/10";
    return "border-gold/60 bg-gold/10";
  };

  const statusLine = () => {
    if (isFinished) {
      if (!myBet?.pick) return <span className="font-mono text-[9px] uppercase tracking-widest text-paper/30">No bet placed</span>;
      return (
        <span className={clsx("font-mono text-[10px] uppercase tracking-widest", outcome === 'win' ? "text-green-400" : "text-red-400")}>
          {outcome === 'win' ? "You won · +1" : "You lost"}
        </span>
      );
    }
    if (committed) {
      return <span className="font-mono text-[10px] uppercase tracking-widest text-gold/70">Locked in — awaiting result</span>;
    }
    return null;
  };

  return (
    <div className={clsx("relative w-full flex group filter drop-shadow-lg", className)}>
      {/* --- LEFT SIDE: Main Ticket --- */}
      <div className={clsx(
        "flex-1 rounded-l-xl border-y border-l transition-colors duration-300 relative overflow-hidden",
        CARD_BG_COLOR,
        showArbiter ? "border-signal/30" : "border-white/5"
      )}>

        {/* Metadata Header */}
        <div className="px-4 pt-5 pb-1 md:px-8 md:pt-7 md:pb-2 flex justify-between items-start font-mono text-[9px] md:text-[10px] uppercase tracking-widest text-paper/40">
          <span className="whitespace-nowrap">
            {match.date} — {match.time}
            {knockout && <span className="ml-2 text-gold/60">{STAGE_LABEL[match.stage!]}</span>}
          </span>
          <span className={clsx("text-right ml-2", (showArbiter || isLive) ? "text-signal font-bold" : "")}>
            {showArbiter ? "ARBITER" : isLive ? (
              <span className="inline-flex items-center gap-1">
                <span className="animate-pulse">●</span> LIVE{match.minute ? ` · ${match.minute}` : ''}
              </span>
            ) : (locked && !isFinished ? "CLOSED" : match.stadium)}
          </span>
        </div>

        {/* Content Row — pick by tapping a flag or the Draw chip */}
        <div className={clsx(
          "px-3 py-3 md:px-6 md:py-4 flex justify-between items-center gap-1 relative z-10 transition-opacity",
          !activeUser && !isFinished && !showArbiter && "opacity-50"
        )}>
          {/* Home */}
          <button
            type="button"
            disabled={!canPick}
            onClick={() => onPick(match.id, 'HOME')}
            className={clsx(
              "flex items-center flex-1 justify-start min-w-0 rounded-lg border-2 px-2 py-1.5 transition-colors select-none touch-manipulation",
              pickClass('HOME'),
              canPick ? "cursor-pointer hover:border-gold/30" : "cursor-default"
            )}
          >
            <Flag team={match.home} className="flex-shrink-0 w-6 h-4 md:w-9 md:h-6 mr-2 md:mr-3" />
            <FitText text={match.home} align="left" className="text-sm md:text-xl font-serif font-bold text-paper leading-tight tracking-tight" />
          </button>

          {/* Center: result (+ pens), the stage tag (knockout), or the Draw chip */}
          <div className="flex flex-col items-center px-1 shrink-0">
            {(isFinished || isLive) ? (
              <>
                <div className={clsx(
                  "font-mono font-bold text-lg md:text-2xl tracking-tighter",
                  isLive ? "text-signal" : "text-paper"
                )}>
                  {match.result_home ?? 0}-{match.result_away ?? 0}
                </div>
                {match.shootout && (
                  <div className="font-mono text-[8px] md:text-[9px] uppercase tracking-widest text-gold/70 whitespace-nowrap">
                    {match.shootout.home}-{match.shootout.away} pens
                  </div>
                )}
              </>
            ) : knockout ? (
              <span className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] md:text-[11px] uppercase tracking-widest text-paper/50 select-none">
                {STAGE_TAG[match.stage!]}
              </span>
            ) : (
              <button
                type="button"
                disabled={!canPick}
                onClick={() => onPick(match.id, 'DRAW')}
                className={clsx(
                  "rounded-full border-2 px-3 py-1 font-mono text-[9px] md:text-[11px] uppercase tracking-widest transition-colors text-paper/80 select-none touch-manipulation",
                  pickClass('DRAW'),
                  canPick ? "cursor-pointer hover:border-gold/30" : "cursor-default"
                )}
              >
                Draw
              </button>
            )}
          </div>

          {/* Away */}
          <button
            type="button"
            disabled={!canPick}
            onClick={() => onPick(match.id, 'AWAY')}
            className={clsx(
              "flex items-center flex-1 justify-end min-w-0 rounded-lg border-2 px-2 py-1.5 transition-colors select-none touch-manipulation",
              pickClass('AWAY'),
              canPick ? "cursor-pointer hover:border-gold/30" : "cursor-default"
            )}
          >
            <FitText text={match.away} align="right" className="text-sm md:text-xl font-serif font-bold text-paper leading-tight tracking-tight" />
            <Flag team={match.away} className="flex-shrink-0 w-6 h-4 md:w-9 md:h-6 ml-2 md:ml-3" />
          </button>
        </div>

        {/* Recent form — W/D/L squares per side; tap to expand last-5 scorelines */}
        {(homeForm?.length || awayForm?.length) ? (
          <div className="relative z-10">
            <button
              type="button"
              onClick={() => setShowForm(s => !s)}
              className="w-full px-4 md:px-8 pb-2 flex items-center justify-between gap-2 select-none touch-manipulation cursor-pointer"
            >
              <FormDots form={homeForm} />
              <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-paper/30">
                Form {showForm ? '▾' : '▸'}
              </span>
              <FormDots form={awayForm} />
            </button>
            {showForm && (
              <div className="px-4 md:px-8 pb-3 flex gap-4 border-t border-dashed border-white/5 pt-2">
                <FormList team={match.home} form={homeForm} />
                <FormList team={match.away} form={awayForm} />
              </div>
            )}
          </div>
        ) : null}

        {/* Line-ups: tap the pitch to view XIs (real once announced, else last game) */}
        {!showArbiter && (
          <div className="flex justify-center pb-3 relative z-10">
            <button
              type="button"
              onClick={() => setShowXI(true)}
              aria-label="View line-ups"
              title="Line-ups"
              className="text-3xl md:text-4xl leading-none opacity-70 hover:opacity-100 hover:scale-110 transition-transform select-none touch-manipulation cursor-pointer"
            >
              🏟️
            </button>
          </div>
        )}

        {/* Goalscorers / red cards (live + finished) */}
        {match.events && match.events.length > 0 && (
          <div className="px-4 md:px-8 pb-3 -mt-1 flex flex-col gap-1 relative z-10">
            {match.events.map((ev, i) => (
              <div
                key={i}
                className={clsx(
                  "flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] text-paper/70 min-w-0",
                  ev.team === 'AWAY' ? "flex-row-reverse text-right" : "text-left"
                )}
              >
                <span className="text-paper/40 tabular-nums shrink-0">{ev.minute}</span>
                <span className="shrink-0">{EVENT_ICON[ev.kind]}</span>
                <span className="truncate">{ev.player}{eventSuffix(ev.kind)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Penalty shootout takers (knockout only, when the feed supplies them) */}
        {match.shootout?.takers && match.shootout.takers.length > 0 && (
          <div className="px-4 md:px-8 pb-3 -mt-1 flex flex-col gap-1 relative z-10 border-t border-dashed border-white/5 pt-2">
            <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-paper/30 text-center mb-0.5">
              Penalties · {match.shootout.home}-{match.shootout.away}
            </div>
            {match.shootout.takers.map((k, i) => (
              <div
                key={i}
                className={clsx(
                  "flex items-center gap-1.5 font-mono text-[10px] md:text-[11px] text-paper/70 min-w-0",
                  k.team === 'AWAY' ? "flex-row-reverse text-right" : "text-left"
                )}
              >
                <span className="shrink-0">{k.scored ? '✅' : '❌'}</span>
                <span className="truncate">{k.player}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action area */}
        {showArbiter ? (
          <div className="border-t border-dashed border-white/10 bg-black/10 p-4 md:p-8">
            <div className="flex flex-col gap-4 md:gap-6">
              <div className="flex justify-center gap-4 md:gap-10">
                <ScoreDial label="Home" value={adminScore.home} onChange={(v) => setAdminScore(p => ({ ...p, home: v }))} />
                <ScoreDial label="Away" value={adminScore.away} onChange={(v) => setAdminScore(p => ({ ...p, away: v }))} />
              </div>

              {/* Knockout: shootout dials (when level) + who advances. */}
              {knockout && adminLevel && (
                <div className="flex justify-center gap-4 md:gap-10">
                  <ScoreDial label="Pens H" value={adminPens.home} onChange={(v) => setAdminPens(p => ({ ...p, home: v }))} />
                  <ScoreDial label="Pens A" value={adminPens.away} onChange={(v) => setAdminPens(p => ({ ...p, away: v }))} />
                </div>
              )}
              {knockout && (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-paper/40">Advances</span>
                  <div className="flex gap-2">
                    {(['HOME', 'AWAY'] as const).map((side) => {
                      const team = side === 'HOME' ? match.home : match.away;
                      const auto = !adminLevel; // score decides; toggle only matters when level
                      const active = (auto ? (adminScore.home > adminScore.away ? 'HOME' : 'AWAY') : adminAdvance) === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          disabled={auto}
                          onClick={() => setAdminAdvance(side)}
                          className={clsx(
                            "px-3 py-1.5 rounded border font-mono text-[10px] uppercase tracking-widest transition-colors",
                            active ? "border-signal/60 bg-signal/15 text-signal" : "border-white/10 text-paper/50",
                            auto ? "cursor-default" : "cursor-pointer hover:border-signal/40"
                          )}
                        >
                          {team}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={() => onSetResult(match.id, {
                  home: adminScore.home,
                  away: adminScore.away,
                  ...(knockout ? {
                    advance: adminLevel ? adminAdvance : (adminScore.home > adminScore.away ? 'HOME' : 'AWAY'),
                    ...(adminLevel ? { shootout: { home: adminPens.home, away: adminPens.away } } : {}),
                  } : {}),
                })}
                className="w-full py-3 md:py-4 bg-signal text-white font-mono font-bold uppercase tracking-wider hover:bg-red-600 transition-colors rounded text-xs md:text-sm"
              >
                {isFinished ? "Update" : "Finalize"}
              </button>
              {isFinished && (
                <button
                  onClick={() => onReopen(match.id)}
                  className="w-full py-2.5 md:py-3 border border-signal/40 text-signal/80 font-mono font-bold uppercase tracking-wider hover:bg-signal/10 hover:text-signal transition-colors rounded text-[10px] md:text-xs"
                >
                  Reopen Match
                </button>
              )}
            </div>
          </div>
        ) : notYetOpen ? null : (
          <div className="border-t border-dashed border-white/10 bg-black/10 px-4 pt-3 pb-4 md:px-8 flex flex-col gap-3">
            {!activeUser && !isFinished && (
              <div className="text-center font-mono text-[10px] uppercase tracking-widest text-gold/70 flex items-center justify-center gap-1.5">
                <span>🔒</span> Select your profile above to bet
              </div>
            )}

            {statusLine() && <div className="text-center">{statusLine()}</div>}

            {canPick && (
              <button
                onClick={() => onLockIn(match.id)}
                disabled={!myPick}
                className="w-full py-2.5 md:py-3 bg-gold text-pitch-900 font-mono font-bold uppercase tracking-wider hover:bg-paper transition-colors rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {myPick ? "Lock In" : "Tap a result to pick"}
              </button>
            )}

            {committed && (
              <>
                <button
                  onClick={() => setShowBets(s => !s)}
                  className="w-full py-2.5 border border-gold/30 text-gold/80 font-mono font-bold uppercase tracking-wider hover:bg-gold/10 transition-colors rounded text-[11px]"
                >
                  {showBets ? "Hide Bets" : `See Bets · ${others.length}`}
                </button>

                {showBets && (
                  <div className="flex flex-col gap-1.5">
                    {others.length === 0 ? (
                      <p className="text-center font-mono text-[10px] uppercase tracking-widest text-paper/30 py-1">
                        No one else has locked in yet.
                      </p>
                    ) : (
                      others.map(({ p, bet }) => {
                        const theirOutcome = betOutcome(bet.pick, match);
                        const team = bet.pick === 'HOME' ? match.home : bet.pick === 'AWAY' ? match.away : null;
                        return (
                          <div key={p.id} className="flex items-center justify-between bg-black/20 rounded px-2.5 py-1.5">
                            <span className="flex items-center gap-2 min-w-0">
                              <Emoji emoji={p.avatar} />
                              <span className="font-mono text-xs text-paper/80 truncate">{p.name}</span>
                            </span>
                            <span className={clsx(
                              "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border whitespace-nowrap",
                              isFinished
                                ? (theirOutcome === 'win' ? "border-green-500/50 text-green-400 bg-green-500/10" : "border-red-500/50 text-red-400 bg-red-500/10")
                                : "border-gold/30 text-gold/80"
                            )}>
                              {team ? <Flag team={team} className="w-4 h-3" /> : null}
                              {team ?? 'Draw'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Perforation Dots */}
        <div className="absolute right-0 top-0 bottom-0 w-[1px] border-r border-dashed border-white/10" />
        <div className="absolute -right-1.5 top-[-6px] w-3 h-3 rounded-full bg-[#0F1A15] z-20 shadow-[inset_0_-1px_2px_rgba(0,0,0,0.5)]" />
        <div className="absolute -right-1.5 bottom-[-6px] w-3 h-3 rounded-full bg-[#0F1A15] z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
      </div>

      {/* --- RIGHT SIDE: Stub (status) --- */}
      <div
        className={clsx("relative flex items-center justify-center w-10 md:w-16", CARD_BG_COLOR)}
        style={{
          clipPath: 'polygon(0 0, 100% 0, 100% 10%, 90% 15%, 100% 20%, 100% 30%, 90% 35%, 100% 40%, 100% 50%, 90% 55%, 100% 60%, 100% 70%, 90% 75%, 100% 80%, 100% 90%, 90% 95%, 100% 100%, 0 100%)'
        }}
      >
        <div className={clsx(
          "rotate-90 whitespace-nowrap font-mono text-[9px] md:text-[10px] uppercase tracking-[0.2em]",
          isFinished ? "text-paper/40" : isLive ? "text-signal font-bold" : (locked || notYetOpen || myBet?.locked) ? "text-paper/30" : "text-gold/50"
        )}>
          {isFinished ? "FIN" : isLive ? "LIVE" : notYetOpen ? "SOON" : (myBet?.locked || locked) ? "LOCKED" : myPick ? "PICK" : "BET"}
        </div>
      </div>

      <LineupModal match={match} isOpen={showXI} onClose={() => setShowXI(false)} />
    </div>
  );
};
