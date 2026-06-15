'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Match } from '@/lib/data';
import { fetchLineups, MatchLineups, TeamLineup } from '@/lib/espn';
import { Flag } from './Flag';

interface LineupModalProps {
  match: Match;
  isOpen: boolean;
  onClose: () => void;
}

type Status = 'loading' | 'ready' | 'none' | 'error';

export const LineupModal = ({ match, isOpen, onClose }: LineupModalProps) => {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<MatchLineups | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStatus('loading');
    setData(null);
    fetchLineups(match)
      .then((res) => {
        if (cancelled) return;
        const hasXI = !!(res?.home?.starters.length || res?.away?.starters.length);
        setData(res);
        setStatus(hasXI ? 'ready' : 'none');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [isOpen, match]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-pitch-900/90 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-pitch-800 border border-chalk rounded-xl shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 bg-pitch-800 border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-serif text-xl text-paper">Starting XI</h3>
              <button onClick={onClose} aria-label="Close" className="text-paper/40 hover:text-paper font-mono text-lg leading-none">✕</button>
            </div>

            <div className="p-5">
              {status === 'loading' && (
                <p className="py-10 text-center font-mono text-xs uppercase tracking-widest text-gold/70 animate-pulse">Loading line-ups…</p>
              )}
              {status === 'error' && (
                <p className="py-10 text-center font-mono text-xs uppercase tracking-widest text-signal/80">Couldn’t load line-ups.</p>
              )}
              {status === 'none' && (
                <p className="py-10 text-center font-mono text-[11px] uppercase tracking-widest text-paper/40">
                  Line-ups not published yet.<br />
                  <span className="text-paper/25 normal-case tracking-normal">Usually available ~1 hour before kickoff.</span>
                </p>
              )}
              {status === 'ready' && data && (
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <TeamColumn lineup={data.home} fallback={match.home} />
                  <TeamColumn lineup={data.away} fallback={match.away} />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const TeamColumn = ({ lineup, fallback }: { lineup: TeamLineup | null; fallback: string }) => {
  const team = lineup?.team || fallback;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <Flag team={team} className="w-5 h-3.5 flex-shrink-0" />
        <span className="font-serif font-bold text-paper truncate">{team}</span>
      </div>
      {lineup?.formation && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-gold/70 mb-2">{lineup.formation}</p>
      )}

      {!lineup || lineup.starters.length === 0 ? (
        <p className="font-mono text-[10px] text-paper/30">No XI</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {lineup.starters.map((p, i) => (
            <li key={i} className="flex items-center gap-2 font-mono text-[11px] text-paper/85 min-w-0">
              <span className="w-5 text-right tabular-nums text-paper/40 shrink-0">{p.jersey}</span>
              <span className="truncate">{p.name}</span>
              {p.pos && <span className="ml-auto pl-1 text-[9px] text-paper/30 shrink-0">{p.pos}</span>}
            </li>
          ))}
        </ol>
      )}

      {lineup && lineup.subs.length > 0 && (
        <>
          <p className="font-mono text-[9px] uppercase tracking-widest text-paper/30 mt-3 mb-1">Subs</p>
          <ul className="flex flex-col gap-0.5">
            {lineup.subs.map((p, i) => (
              <li key={i} className="flex items-center gap-2 font-mono text-[10px] text-paper/45 min-w-0">
                <span className="w-5 text-right tabular-nums text-paper/25 shrink-0">{p.jersey}</span>
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
