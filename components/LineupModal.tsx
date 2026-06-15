'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Match } from '@/lib/data';
import { fetchLineups, MatchLineups, TeamLineup } from '@/lib/espn';
import { Flag } from './Flag';
import { Pitch } from './Pitch';

interface LineupModalProps {
  match: Match;
  isOpen: boolean;
  onClose: () => void;
}

type Status = 'loading' | 'ready' | 'none' | 'error';

export const LineupModal = ({ match, isOpen, onClose }: LineupModalProps) => {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<MatchLineups | null>(null);
  const [view, setView] = useState<'pitch' | 'list'>('pitch');

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

  const tree = (
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
            className={clsx(
              "relative max-h-[94vh] overflow-y-auto bg-pitch-800 border border-chalk rounded-xl shadow-2xl",
              view === 'pitch' ? "" : "w-full max-w-lg"
            )}
            style={view === 'pitch' ? { width: 'min(94vw, 62vh)' } : undefined}
          >
            {/* Header */}
            <div className="sticky top-0 bg-pitch-800 border-b border-white/10 px-5 py-4 flex items-center justify-between gap-3 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="font-serif text-xl text-paper shrink-0">Starting XI</h3>
                <div className="flex rounded border border-white/15 overflow-hidden font-mono text-[9px] uppercase tracking-widest">
                  {(['pitch', 'list'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={clsx("px-2.5 py-1 transition-colors", view === v ? "bg-paper text-pitch-900 font-bold" : "text-paper/50 hover:text-paper")}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-paper/40 hover:text-paper font-mono text-lg leading-none shrink-0">✕</button>
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
                <div className="flex flex-col gap-3">
                  {data.source === 'last' && (
                    <p className="text-center font-mono text-[10px] uppercase tracking-widest text-gold/70">
                      Line-up not announced — last XI shown
                    </p>
                  )}
                  {view === 'pitch' ? (
                    <>
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-paper/70">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-3 h-3 rounded-full bg-paper shrink-0" />
                          <span className="truncate">{data.home?.team || match.home}{data.home?.formation ? ` · ${data.home.formation}` : ''}</span>
                        </span>
                        <span className="flex items-center gap-1.5 min-w-0 justify-end text-right">
                          <span className="truncate">{data.away?.team || match.away}{data.away?.formation ? ` · ${data.away.formation}` : ''}</span>
                          <span className="w-3 h-3 rounded-full bg-gold shrink-0" />
                        </span>
                      </div>
                      <Pitch
                        home={data.home} away={data.away}
                        homeNote={data.source === 'last' ? data.homeNote : undefined}
                        awayNote={data.source === 'last' ? data.awayNote : undefined}
                      />
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 md:gap-6">
                      <TeamColumn lineup={data.home} fallback={match.home} note={data.source === 'last' ? data.homeNote : undefined} />
                      <TeamColumn lineup={data.away} fallback={match.away} note={data.source === 'last' ? data.awayNote : undefined} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Portal to <body> so the overlay covers the whole viewport — the card root's
  // `filter` would otherwise make it the containing block for our fixed overlay.
  return typeof document !== 'undefined' ? createPortal(tree, document.body) : null;
};

const TeamColumn = ({ lineup, fallback, note }: { lineup: TeamLineup | null; fallback: string; note?: string }) => {
  const team = lineup?.team || fallback;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <Flag team={team} className="w-5 h-3.5 flex-shrink-0" />
        <span className="font-serif font-bold text-paper truncate">{team}</span>
      </div>
      {lineup?.formation && (
        <p className="font-mono text-[10px] uppercase tracking-widest text-gold/70 mb-0.5">{lineup.formation}</p>
      )}
      {note && <p className="font-mono text-[9px] text-paper/40 mb-2">{note}</p>}

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
