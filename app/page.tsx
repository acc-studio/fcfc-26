'use client';
import { useState, useEffect, useRef } from 'react'; // <--- Added useRef
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PLAYERS, Match, Player } from '@/lib/data';
import { MatchCard } from '@/components/MatchCard';
import { Leaderboard } from '@/components/Leaderboard';
import { supabase } from '@/lib/supabase';
import { AuthModal } from '@/components/AuthModal';
import { SecretSanta } from '@/components/SecretSanta';

export default function WorldCupApp() {
  const [activeTab, setActiveTab] = useState<'matches' | 'table' | 'santa'>('matches');

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; target: Player | null }>({
    isOpen: false,
    target: null
  });

  const [isCommissioner, setIsCommissioner] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // --- AUDIO LOGIC (THE ANNOYING PLAYER) ---
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize the music
    // Ensure 'christmas_slop.mp3' is in your /public folder
    audioRef.current = new Audio('/christmas_slop.mp3');
    audioRef.current.loop = true;
    audioRef.current.volume = 0.6;
  }, []);

  // Watch the tab switch to Play/Pause
  useEffect(() => {
    if (activeTab === 'santa') {
      audioRef.current?.play().catch((e) => console.log("Audio autoplay blocked:", e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [activeTab]);
  // -----------------------------------------

  // --- THEME LOGIC ---
  const isChristmas = activeTab === 'santa';

  const appBackground = isChristmas
    ? "bg-red-950 transition-colors duration-1000"
    : "bg-pitch-900 transition-colors duration-500";

  useEffect(() => {
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

  const handleUserClick = (player: Player) => {
    if (currentUser === player.id) return;
    setAuthModal({ isOpen: true, target: player });
  };

  const handleAuthSuccess = (player: Player) => {
    setCurrentUser(player.id);
    localStorage.setItem('pitch_club_user', player.id);
  };

  return (
    <div className={clsx("min-h-screen transition-all duration-700", appBackground)}>

      <AuthModal
        isOpen={authModal.isOpen}
        targetUser={authModal.target}
        onClose={() => setAuthModal({ ...authModal, isOpen: false })}
        onSuccess={handleAuthSuccess}
      />

      {/* Inner Container for Content */}
      <div className="pb-24 pt-20 px-6 max-w-2xl lg:max-w-6xl mx-auto">

        {/* HEADER: Dynamic Text */}
        <div className="flex flex-col items-start mb-12">
          <h1 className={clsx(
            "text-5xl md:text-7xl font-serif font-black tracking-tight leading-[0.9] transition-colors duration-500",
            isChristmas ? "text-green-400 drop-shadow-md" : "text-paper"
          )}>
            {isChristmas ? (
              <>AGA BAŞI <br /> ÇEKİLİŞİ</>
            ) : (
              "FCFC '26"
            )}
          </h1>
          <div className="mt-4 flex items-center gap-4">
            <span className={clsx(
              "font-mono text-xs tracking-widest uppercase border-b pb-1 transition-colors",
              isChristmas ? "text-white border-white" : "text-gold border-gold"
            )}>
              {isChristmas ? "AGA" : "AGA"}
            </span>
          </div>
        </div>

        {/* USER SWITCHER: Dynamic Colors */}
        <div className="mb-10">
          <div className="flex justify-between items-end mb-3">
            <p className={clsx("font-mono text-[10px] uppercase", isChristmas ? "text-white/60" : "text-paper/40")}>
              Active Punter:
            </p>
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
                    ? (isChristmas ? "bg-white text-red-900 border-white font-bold shadow-lg" : "bg-paper text-pitch-900 border-paper font-bold")
                    : (isChristmas ? "border-white/30 text-white/70 hover:border-white" : "border-chalk text-paper/60 hover:border-gold/50")
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

        {/* CONTENT AREA */}
        {isLoading ? (
          <div className="text-center py-20 font-mono text-gold animate-pulse">SYNCING FIXTURES...</div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'matches' && (
              <motion.div
                key="matches"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    userBets={bets}
                    onBet={handleBet}
                    onSetResult={handleSetResult}
                    activeUser={currentUser || ''}
                    isCommissioner={isCommissioner}
                  />
                ))}
              </motion.div>
            )}

            {activeTab === 'table' && (
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

            {/* New Santa Tab */}
            {activeTab === 'santa' && (
              <motion.div
                key="santa"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <SecretSanta currentUser={currentUser} isCommissioner={isCommissioner} />
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>
      {/* End Inner Container */}

      {/* NAVIGATION BAR: Dynamic Theme */}
      <nav className={clsx(
        "fixed bottom-0 left-0 w-full z-50 border-t transition-colors duration-500",
        isChristmas ? "bg-red-900/90 border-green-800" : "bg-pitch-900/80 border-chalk"
      )}>
        <div className="max-w-2xl mx-auto flex">
          {/* Matches Tab */}
          <button
            onClick={() => setActiveTab('matches')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-xs uppercase tracking-widest transition-colors relative",
              activeTab === 'matches'
                ? (isChristmas ? "text-white font-bold" : "text-gold")
                : (isChristmas ? "text-white/40 hover:text-white" : "text-paper/40 hover:text-paper")
            )}
          >
            Fixtures
            {activeTab === 'matches' && (
              <motion.div layoutId="nav-indicator" className={clsx("absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full", isChristmas ? "bg-white" : "bg-gold")} />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Table Tab */}
          <button
            onClick={() => setActiveTab('table')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-xs uppercase tracking-widest transition-colors relative",
              activeTab === 'table'
                ? (isChristmas ? "text-white font-bold" : "text-gold")
                : (isChristmas ? "text-white/40 hover:text-white" : "text-paper/40 hover:text-paper")
            )}
          >
            Standings
            {activeTab === 'table' && (
              <motion.div layoutId="nav-indicator" className={clsx("absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full", isChristmas ? "bg-white" : "bg-gold")} />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Santa Tab */}
          <button
            onClick={() => setActiveTab('santa')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-xs uppercase tracking-widest transition-colors relative",
              activeTab === 'santa'
                ? (isChristmas ? "text-white font-bold" : "text-gold")
                : (isChristmas ? "text-white/40 hover:text-white" : "text-paper/40 hover:text-paper")
            )}
          >
            {isChristmas ? '🎅 Santaga' : '🎁 Çekiliş'}
            {activeTab === 'santa' && (
              <motion.div layoutId="nav-indicator" className={clsx("absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full", isChristmas ? "bg-white" : "bg-gold")} />
            )}
          </button>

        </div>
      </nav>

    </div>
  );
}