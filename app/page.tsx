'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PLAYERS, Match } from '@/lib/data';
import { MatchCard } from '@/components/MatchCard';
import { Leaderboard } from '@/components/Leaderboard';
import { supabase } from '@/lib/supabase';

export default function WorldCupApp() {
  const [activeTab, setActiveTab] = useState<'matches' | 'table'>('matches');
  const [currentUser, setCurrentUser] = useState('p1'); 
  const [isCommissioner, setIsCommissioner] = useState(false); // Admin Toggle
  
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Initial Data (Matches + Bets)
  useEffect(() => {
    const fetchData = async () => {
      // Load Matches (Ordered by ID)
      const { data: matchData } = await supabase.from('matches').select('*').order('id', { ascending: true });
      if (matchData) setMatches(matchData);

      // Load Bets
      const { data: betData } = await supabase.from('bets').select('*');
      if (betData) {
        const betMap: Record<string, any> = {};
        betData.forEach((row: any) => {
          betMap[`${row.user_id}_${row.match_id}`] = { home: row.home_score, away: row.away_score };
        });
        setBets(betMap);
      }
      setIsLoading(false);
    };

    fetchData();

    // 2. Realtime Subscriptions
    const channel = supabase
      .channel('realtime_pitch_club')
      // Listen for new bets
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, (payload) => {
        const newRow = payload.new as any;
        if (newRow) {
            setBets(prev => ({
                ...prev,
                [`${newRow.user_id}_${newRow.match_id}`]: { home: newRow.home_score, away: newRow.away_score }
            }));
        }
      })
      // Listen for Match Updates (Commissioner finalizes a game)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        setMatches(prev => prev.map(m => m.id === payload.new.id ? payload.new as Match : m));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle User Betting
  const handleBet = async (matchId: number, score: { home: number, away: number }) => {
    // Optimistic Update
    setBets(prev => ({
      ...prev,
      [`${currentUser}_${matchId}`]: score
    }));

    // DB Update
    await supabase
      .from('bets')
      .upsert({ 
        user_id: currentUser, 
        match_id: matchId, 
        home_score: score.home, 
        away_score: score.away 
      }, { onConflict: 'user_id, match_id' });
  };

  // Handle Commissioner Result Setting
  const handleSetResult = async (matchId: number, score: { home: number, away: number }) => {
      // Update local state immediately
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'FINISHED', result_home: score.home, result_away: score.away } : m));

      // DB Update
      await supabase
        .from('matches')
        .update({ 
            status: 'FINISHED', 
            result_home: score.home, 
            result_away: score.away 
        })
        .eq('id', matchId);
  };

  return (
    <div className="pb-24 pt-20 px-6 max-w-2xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col items-start mb-12">
        <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight text-paper leading-[0.9]">
          FCFC '26.
        </h1>
        <div className="mt-4 flex items-center gap-4">
           <span className="font-mono text-xs text-gold tracking-widest uppercase border-b border-gold pb-1">
            AGA
          </span>
        </div>
      </div>

      {/* User Switcher */}
      <div className="mb-10">
        <div className="flex justify-between items-end mb-3">
            <p className="font-mono text-[10px] uppercase text-paper/40">Active Punter:</p>
            {/* Secret Toggle */}
            <button 
                onClick={() => setIsCommissioner(!isCommissioner)}
                className={clsx(
                    "text-[9px] uppercase tracking-widest font-mono px-2 py-1 rounded transition-colors",
                    isCommissioner ? "bg-signal text-white" : "text-paper/10 hover:text-paper/30"
                )}
            >
                {isCommissioner ? "HOCA" : "🏁"}
            </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {PLAYERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentUser(p.id)}
              className={clsx(
                "px-4 py-2 rounded-full border text-xs font-mono transition-all whitespace-nowrap flex items-center gap-2",
                currentUser === p.id 
                  ? "bg-paper text-pitch-900 border-paper font-bold" 
                  : "bg-transparent border-chalk text-paper/60 hover:border-gold/50"
              )}
            >
              <span>{p.avatar}</span> {p.name}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 font-mono text-gold animate-pulse">SYNCING FIXTURES...</div>
      ) : (
        <AnimatePresence mode="wait">
            {activeTab === 'matches' ? (
            <motion.div 
                key="matches"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
            >
                {matches.map((match) => (
                <MatchCard 
                    key={match.id} 
                    match={match} 
                    userBets={bets}
                    onBet={handleBet}
                    onSetResult={handleSetResult}
                    activeUser={currentUser}
                    isCommissioner={isCommissioner}
                />
                ))}
            </motion.div>
            ) : (
            <motion.div 
                key="table"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3 }}
            >
                <Leaderboard users={PLAYERS} bets={bets} matches={matches} />
            </motion.div>
            )}
        </AnimatePresence>
      )}

      {/* Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-pitch-900/80 backdrop-blur-md border-t border-chalk">
        <div className="max-w-2xl mx-auto flex">
          <button 
            onClick={() => setActiveTab('matches')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-xs uppercase tracking-widest transition-colors",
              activeTab === 'matches' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Fixtures
          </button>
          <div className="w-px bg-chalk my-4 opacity-50"></div>
          <button 
            onClick={() => setActiveTab('table')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-xs uppercase tracking-widest transition-colors",
              activeTab === 'table' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Standings
          </button>
        </div>
      </nav>

    </div>
  );
}