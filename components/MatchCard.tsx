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
    <div 
      className={clsx(
        "w-3 h-3 rounded-sm shadow-[0_0_4px_rgba(0,0,0,0.5)] border border-white/10",
        side === 'left' ? "mr-3" : "ml-3"
      )}
      style={{ background }}
    />
  );
};

export const MatchCard = ({ match, userBets, onBet, onSetResult, activeUser, isCommissioner }: MatchCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Admin State
  const [adminScore, setAdminScore] = useState({ home: 0, away: 0 });
  
  // User Bet State
  const betKey = `${activeUser}_${match.id}`;
  const currentBet = userBets[betKey] || { home: 0, away: 0 };

  const isFinished = match.status === 'FINISHED';

  // Sync Admin Dials with real result if it exists
  // This ensures if you edit a finished game, the dials start at the current score
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

  return (
    <motion.div 
      layout
      className={clsx(
        "relative w-full mb-6 p-6 border border-chalk rounded-xl backdrop-blur-sm transition-all duration-500",
        // Admin mode gets a distinct reddish tint border
        isCommissioner ? "border-signal/30 bg-pitch-800/80" : 
        isExpanded ? "bg-pitch-800/90 shadow-2xl border-gold/30" : "bg-pitch-800/40 hover:bg-pitch-800/60"
      )}
    >
      {/* Metadata */}
      <div className="flex justify-between items-start mb-6 font-mono text-xs uppercase tracking-widest text-paper/40">
        <span>{match.date} — {match.time}</span>
        <span className={isCommissioner ? "text-signal font-bold" : ""}>
            {isCommissioner ? "COMMISSIONER MODE" : match.stadium}
        </span>
      </div>

      {/* Teams Row */}
      <div className="flex justify-between items-center relative z-10">
        <div className="flex items-center flex-1 justify-start">
          <TeamSwatch team={match.home} side="left" />
          <h3 className="text-2xl md:text-3xl font-serif font-bold text-paper leading-none mt-[2px]">{match.home}</h3>
        </div>
        
        <div className="flex flex-col items-center px-2 shrink-0">
          {isFinished ? (
             <div className="bg-paper text-pitch-900 font-mono font-bold text-lg px-3 py-1 rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)]">
               {match.result_home} - {match.result_away}
             </div>
          ) : (
            <span className="font-serif italic text-gold text-lg opacity-60">vs</span>
          )}
        </div>

        <div className="flex items-center flex-1 justify-end">
          <h3 className="text-2xl md:text-3xl font-serif font-bold text-paper leading-none mt-[2px] text-right">{match.away}</h3>
          <TeamSwatch team={match.away} side="right" />
        </div>
      </div>

      {/* Betting OR Admin Controls */}
      <div className="mt-6 border-t border-chalk pt-6">
        
        {/* 1. COMMISSIONER CONTROL */}
        {isCommissioner ? (
            <div className="flex flex-col gap-4">
                <div className="flex justify-center gap-8">
                    <ScoreDial label="Home" value={adminScore.home} onChange={(v) => handleAdminChange('home', v)} />
                    <ScoreDial label="Away" value={adminScore.away} onChange={(v) => handleAdminChange('away', v)} />
                </div>
                <button 
                    onClick={() => onSetResult(match.id, adminScore)}
                    className="w-full py-3 bg-signal text-white font-mono font-bold uppercase tracking-wider hover:bg-red-600 transition-colors rounded"
                >
                    {isFinished ? "Update Correction" : "Finalize Match Result"}
                </button>
                {isFinished && (
                    <p className="text-[9px] text-center text-signal/70 font-mono uppercase">
                        Warning: Updating will recalculate leaderboard immediately.
                    </p>
                )}
            </div>
        ) : (
            
        /* 2. PLAYER BETTING CONTROL */
         !isFinished && (
            isExpanded ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6">
                <div className="flex gap-8">
                    <ScoreDial label={match.home} value={currentBet.home} onChange={(v) => handleBetChange('home', v)} />
                    <ScoreDial label={match.away} value={currentBet.away} onChange={(v) => handleBetChange('away', v)} />
                </div>
                <button 
                    onClick={() => setIsExpanded(false)}
                    className="w-full py-3 mt-2 bg-gold text-pitch-900 font-mono font-bold uppercase tracking-wider hover:bg-paper transition-colors rounded"
                >
                    Confirm Selection
                </button>
                </motion.div>
            ) : (
                <button 
                onClick={() => setIsExpanded(true)}
                className="w-full flex justify-between items-center group"
                >
                <span className="font-mono text-xs text-gold uppercase tracking-wider group-hover:text-white transition-colors">
                    {userBets[betKey] ? `Prediction: ${currentBet.home} - ${currentBet.away}` : "Place Prediction"}
                </span>
                <span className="text-gold group-hover:translate-x-1 transition-transform">→</span>
                </button>
            )
         )
        )}
      </div>
    </motion.div>
  );
};