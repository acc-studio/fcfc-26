'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PLAYERS, Match, Player } from '@/lib/data';
import { MatchCard } from '@/components/MatchCard';
import { Leaderboard } from '@/components/Leaderboard';
import { supabase } from '@/lib/supabase';
import { AuthModal } from '@/components/AuthModal'; // <--- Import Modal

export default function WorldCupApp() {
  const [activeTab, setActiveTab] = useState<'matches' | 'table'>('matches');
  
  // User & Auth State
  const [currentUser, setCurrentUser] = useState<string | null>(null); // Start null to force selection
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; target: Player | null }>({
    isOpen: false,
    target: null
  });

  const [isCommissioner, setIsCommissioner] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch Initial Data
  useEffect(() => {
    // Attempt to restore user from session logic if desired, 
    // but for now let's make them log in every refresh for security/feel.
    // Or check localStorage for last user:
    const lastUser = localStorage.getItem('pitch_club_user');
    if (lastUser) setCurrentUser(lastUser);

    const fetchData = async () => {
      const { data: matchData } = await supabase.from('matches').select('*').order('id', { ascending: true });
      if (matchData) setMatches(matchData);

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

    const channel = supabase
      .channel('realtime_pitch_club')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, (payload) => {
        const newRow = payload.new as any;
        if (newRow) {
            setBets(prev => ({
                ...prev,
                [`${newRow.user_id}_${newRow.match_id}`]: { home: newRow.home_score, away: newRow.away_score }
            }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload) => {
        setMatches(prev => prev.map(m => m.id === payload.new.id ? payload.new as Match : m));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleBet = async (matchId: number, score: { home: number, away: number }) => {
    if (!currentUser) return;
    setBets(prev => ({ ...prev, [`${currentUser}_${matchId}`]: score }));
    await supabase.from('bets').upsert({ 
        user_id: currentUser, 
        match_id: matchId, 
        home_score: score.home, 
        away_score: score.away 
    }, { onConflict: 'user_id, match_id' });
  };

  const handleSetResult = async (matchId: number, score: { home: number, away: number }) => {
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'FINISHED', result_home: score.home, result_away: score.away } : m));
      await supabase.from('matches').update({ status: 'FINISHED', result_home: score.home, result_away: score.away }).eq('id', matchId);
  };

  // AUTH LOGIC
  const handleUserClick = (player: Player) => {
    // If already logged in as this user, do nothing
    if (currentUser === player.id) return;

    // Open Modal
    setAuthModal({ isOpen: true, target: player });
  };

  const handleAuthSuccess = (player: Player) => {
    setCurrentUser(player.id);
    localStorage.setItem('pitch_club_user', player.id); // Persist login
  };

  return (
    <div className="pb-24 pt-20 px-6 max-w-2xl mx-auto">
      
      {/* Modal */}
      <AuthModal 
        isOpen={authModal.isOpen} 
        targetUser={authModal.target} 
        onClose={() => setAuthModal({ ...authModal, isOpen: false })}
        onSuccess={handleAuthSuccess}
      />

      <div className="flex flex-col items-start mb-12">
        <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight text-paper leading-[0.9]">
          FCFC '26
        </h1>
        <div className="mt-4 flex items-center gap-4">
           <span className="font-mono text-xs text-gold tracking-widest uppercase border-b border-gold pb-1">
            AGA
          </span>
        </div>
      </div>

      <div className="mb-10">
        <div className="flex justify-between items-end mb-3">
            <p className="font-mono text-[10px] uppercase text-paper/40">Active Punter:</p>
            <button 
                onClick={() => setIsCommissioner(!isCommissioner)}
                className={clsx(
                    "text-[9px] uppercase tracking-widest font-mono px-2 py-1 rounded transition-colors",
                    isCommissioner ? "bg-signal text-white" : "text-paper/10 hover:text-paper/30"
                )}
            >
                {isCommissioner ? "Admin Active" : "π"}
            </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {PLAYERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleUserClick(p)}
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
        {!currentUser && (
            <p className="mt-4 text-center text-xs font-mono text-gold/60 animate-pulse">
                Select your profile to begin...
            </p>
        )}
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
                    activeUser={currentUser || ''} // Pass empty string if no user
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