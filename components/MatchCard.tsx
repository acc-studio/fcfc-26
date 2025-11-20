'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { ScoreDial } from './ScoreDial';
import { Match, TEAM_COLORS } from '@/lib/data';

interface MatchCardProps {
  match: Match;
  userBets: any;
  onBet: (matchId: number, score: { home: number, away: number }) => void;
  onSetResult: (matchId: number, score: { home: number, away: number }) => void;
  activeUser: string;
  isCommissioner: boolean;
}

const TeamSwatch = ({ team, side }: { team: string, side: 'left' | 'right' }) => {
  const background = TEAM_COLORS[team] || '#333'; 
  return (
    <div className={clsx(
      "relative flex-shrink-0 w-8 h-5 rounded-[3px] overflow-hidden shadow-sm",
      side === 'left' ? "mr-5" : "ml-5"
    )}>
      <div className="absolute inset-0" style={{ background }} />
      <div className="absolute inset-0 border border-black/10 rounded-[3px] ring-1 ring-inset ring-white/10" />
    </div>
  );
};

export const MatchCard = ({ match, userBets, onBet, onSetResult, activeUser, isCommissioner }: MatchCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [adminScore, setAdminScore] = useState({ home: 0, away: 0 });
  
  const betKey = `${activeUser}_${match.id}`;
  const currentBet = userBets[betKey] || { home: 0, away: 0 };
  const isFinished = match.status === 'FINISHED';

  useEffect(() => {
    if (match.result_home !== undefined && match.result_away !== undefined) {
      setAdminScore({ home: match.result_home, away: match.result_away });
    }
  }, [match.result_home, match.result_away]);

  const handleBetChange = (side: 'home' | 'away', val: number) => {
    onBet(match.id, { ...currentBet, [side]: val });
  };

  const handleAdminChange = (side: 'home' | 'away', val: number) => {
    setAdminScore(prev => ({ ...prev, [side]: val }));
  };

  // The specific "Card Stock" color. 
  // Slightly lighter and greener than the background to pop.
  // Using a constant class string to ensure left/right sides match perfectly.
  const CARD_BG_COLOR = isCommissioner 
    ? "bg-[#2A1A1A]" // Reddish tint for Admin
    : "bg-[#1A2621]"; // Premium Dark Card Green for Normal

  return (
    <motion.div 
      layout
      className="relative w-full mb-8 flex group filter drop-shadow-lg"
    >
      {/* --- LEFT SIDE: Main Ticket --- */}
      <div className={clsx(
        "flex-1 rounded-l-xl border-y border-l transition-colors duration-300 relative overflow-hidden",
        CARD_BG_COLOR,
        isCommissioner ? "border-signal/30" : 
        isExpanded ? "border-gold/40" : "border-white/5"
      )}>
        
        {/* Metadata Header - Increased Padding (pt-7) */}
        <div className="px-8 pt-7 pb-2 flex justify-between items-start font-mono text-[10px] uppercase tracking-widest text-paper/40">
          <span>{match.date} — {match.time}</span>
          <span className={isCommissioner ? "text-signal font-bold" : ""}>
              {isCommissioner ? "ADMIN MODE" : match.stadium}
          </span>
        </div>

        {/* Content Row - Increased Vertical Padding (py-4) */}
        <div className="px-8 py-4 flex justify-between items-center relative z-10">
          {/* Home */}
          <div className="flex items-center flex-1 justify-start min-w-0">
            <TeamSwatch team={match.home} side="left" />
            <h3 className="text-3xl font-serif font-bold text-paper leading-none mt-[2px] truncate tracking-tight">
              {match.home}
            </h3>
          </div>
          
          {/* VS / Score */}
          <div className="flex flex-col items-center px-4 shrink-0">
            {isFinished ? (
              <div className="font-mono font-bold text-2xl text-paper tracking-tighter">
                {match.result_home} - {match.result_away}
              </div>
            ) : (
              <span className="font-serif italic text-gold/30 text-xl pr-1">vs</span>
            )}
          </div>

          {/* Away */}
          <div className="flex items-center flex-1 justify-end min-w-0">
            <h3 className="text-3xl font-serif font-bold text-paper leading-none mt-[2px] text-right truncate tracking-tight">
              {match.away}
            </h3>
            <TeamSwatch team={match.away} side="right" />
          </div>
        </div>

        {/* Bottom Spacer to give "Weight" */}
        <div className="h-6" />

        {/* Betting / Admin Area (Collapsible) */}
        <motion.div 
            initial={false}
            animate={{ height: (isExpanded || isCommissioner) ? 'auto' : 0, opacity: (isExpanded || isCommissioner) ? 1 : 0 }}
            className="overflow-hidden border-t border-dashed border-white/10 bg-black/10"
        >
            <div className="p-8">
            {isCommissioner ? (
                <div className="flex flex-col gap-6">
                    <div className="flex justify-center gap-10">
                        <ScoreDial label="Home" value={adminScore.home} onChange={(v) => handleAdminChange('home', v)} />
                        <ScoreDial label="Away" value={adminScore.away} onChange={(v) => handleAdminChange('away', v)} />
                    </div>
                    <button 
                        onClick={() => onSetResult(match.id, adminScore)}
                        className="w-full py-4 bg-signal text-white font-mono font-bold uppercase tracking-wider hover:bg-red-600 transition-colors rounded"
                    >
                        {isFinished ? "Update Result" : "Finalize Result"}
                    </button>
                </div>
            ) : (
                !isFinished && (
                    <div className="flex flex-col items-center gap-6">
                        <div className="flex gap-10">
                            <ScoreDial label={match.home} value={currentBet.home} onChange={(v) => handleBetChange('home', v)} />
                            <ScoreDial label={match.away} value={currentBet.away} onChange={(v) => handleBetChange('away', v)} />
                        </div>
                        <button 
                            onClick={() => setIsExpanded(false)}
                            className="w-full py-4 mt-2 bg-gold text-pitch-900 font-mono font-bold uppercase tracking-wider hover:bg-paper transition-colors rounded"
                        >
                            Confirm Bet
                        </button>
                    </div>
                )
            )}
            </div>
        </motion.div>

        {/* Perforation Dots */}
        <div className="absolute right-0 top-0 bottom-0 w-[1px] border-r border-dashed border-white/10" />
        {/* Top Hole - Matches Page BG (#0F1A15 / pitch-900) */}
        <div className="absolute -right-1.5 top-[-6px] w-3 h-3 rounded-full bg-[#0F1A15] z-20 shadow-[inset_0_-1px_2px_rgba(0,0,0,0.5)]" />
        {/* Bottom Hole */}
        <div className="absolute -right-1.5 bottom-[-6px] w-3 h-3 rounded-full bg-[#0F1A15] z-20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
      </div>

      {/* --- RIGHT SIDE: Stub --- */}
      <button 
        onClick={() => !isCommissioner && !isFinished && setIsExpanded(!isExpanded)}
        disabled={isCommissioner || isFinished}
        className={clsx(
            "w-16 relative flex items-center justify-center cursor-pointer transition-colors duration-300",
            CARD_BG_COLOR,
            !isCommissioner && !isFinished && "hover:brightness-110"
        )}
        style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 10%, 90% 15%, 100% 20%, 100% 30%, 90% 35%, 100% 40%, 100% 50%, 90% 55%, 100% 60%, 100% 70%, 90% 75%, 100% 80%, 100% 90%, 90% 95%, 100% 100%, 0 100%)'
        }}
      >
          {/* Vertical Text */}
          <div className="rotate-90 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-gold/50">
             {isFinished ? "FINAL" : userBets[betKey] ? "EDIT" : "OPEN"}
          </div>
      </button>
    </motion.div>
  );
};