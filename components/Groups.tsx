'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Match, GROUPS, computeStandings, groupMatches } from '@/lib/data';
import { Flag } from './Flag';

// Standings are computed live from finished matches; tapping a group reveals the
// scorelines of every completed match in it. Top 2 are highlighted (qualify).
export const Groups = ({ matches }: { matches: Match[] }) => {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Object.entries(GROUPS).map(([letter, teams]) => {
        const standings = computeStandings(teams, matches);
        const played = groupMatches(teams, matches);
        const isOpen = open === letter;

        return (
          <div key={letter} className="rounded-xl border border-chalk bg-card overflow-hidden filter drop-shadow-lg">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : letter)}
              className="w-full text-left select-none touch-manipulation cursor-pointer"
            >
              {/* Header */}
              <div className="px-4 md:px-6 pt-4 pb-2 flex justify-between items-center">
                <h3 className="font-serif text-xl md:text-2xl font-bold text-paper">Group {letter}</h3>
                <span className="font-mono text-[9px] uppercase tracking-widest text-paper/40">
                  {played.length} played {isOpen ? '▾' : '▸'}
                </span>
              </div>

              {/* Standings table */}
              <div className="px-4 md:px-6 pb-4">
                <div className="grid grid-cols-[1.1rem_minmax(0,1fr)_1.2rem_1.2rem_1.2rem_1.2rem_1.4rem_1.4rem] gap-y-1 items-center font-mono text-[10px] md:text-[11px]">
                  <span />
                  <span className="text-paper/30 uppercase tracking-wider">Team</span>
                  {['P', 'W', 'D', 'L', 'GD', 'Pts'].map(h => (
                    <span key={h} className="text-center text-paper/30">{h}</span>
                  ))}
                  {standings.map((s, i) => (
                    <FragmentRow key={s.team} rank={i + 1} s={s} qualifies={i < 2} />
                  ))}
                </div>
              </div>
            </button>

            {/* Expanded: completed scorelines */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-dashed border-paper/10 bg-black/10"
                >
                  <div className="px-4 md:px-6 py-3 flex flex-col gap-1.5">
                    {played.length === 0 ? (
                      <p className="font-mono text-[10px] uppercase tracking-widest text-paper/30 text-center py-1">
                        No matches played yet
                      </p>
                    ) : (
                      played.map(m => (
                        <div key={m.id} className="flex items-center justify-center gap-2 font-mono text-[11px] text-paper/80">
                          <span className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
                            <span className="truncate">{m.home}</span>
                            <Flag team={m.home} className="w-4 h-3 flex-shrink-0" />
                          </span>
                          <span className="font-bold tabular-nums px-1.5">{m.result_home}-{m.result_away}</span>
                          <span className="flex-1 flex items-center gap-1.5 min-w-0">
                            <Flag team={m.away} className="w-4 h-3 flex-shrink-0" />
                            <span className="truncate">{m.away}</span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

// One standings row spread across the parent grid's columns.
const FragmentRow = ({ rank, s, qualifies }: { rank: number; s: ReturnType<typeof computeStandings>[number]; qualifies: boolean }) => (
  <>
    <span className={clsx("text-center", qualifies ? "text-gold" : "text-paper/30")}>{rank}</span>
    <span className="flex items-center gap-1.5 min-w-0">
      <Flag team={s.team} className="w-4 h-3 flex-shrink-0" />
      <span className={clsx("truncate", qualifies ? "text-paper" : "text-paper/70")}>{s.team}</span>
    </span>
    <span className="text-center text-paper/50">{s.p}</span>
    <span className="text-center text-paper/50">{s.w}</span>
    <span className="text-center text-paper/50">{s.d}</span>
    <span className="text-center text-paper/50">{s.l}</span>
    <span className="text-center text-paper/60">{s.gd > 0 ? `+${s.gd}` : s.gd}</span>
    <span className="text-center font-bold text-gold">{s.pts}</span>
  </>
);
