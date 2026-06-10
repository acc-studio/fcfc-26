'use client';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Match, Player, kickoffMs, BET_WINDOW_MS } from '@/lib/data';
import { MatchCard } from '@/components/MatchCard';
import { Leaderboard } from '@/components/Leaderboard';
import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { AuthModal } from '@/components/AuthModal';
import { RegisterModal } from '@/components/RegisterModal';
import { ArbiterModal } from '@/components/ArbiterModal';

export default function WorldCupApp() {
  const [activeTab, setActiveTab] = useState<'next' | 'upcoming' | 'past' | 'table'>('next');

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; target: Player | null }>({
    isOpen: false,
    target: null
  });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [arbiterModalOpen, setArbiterModalOpen] = useState(false);

  const [isArbiter, setIsArbiter] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Refreshed every minute so the 48h betting window closes live.
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const lastUser = localStorage.getItem('pitch_club_user');
    if (lastUser) setCurrentUser(lastUser);

    // Live matches: sorted by id so fixtures stay in schedule order.
    const unsubMatches = onSnapshot(collection(db, 'matches'), (snap) => {
      const rows = snap.docs.map(d => d.data() as Match);
      rows.sort((a, b) => a.id - b.id);
      setMatches(rows);
      setIsLoading(false);
    });

    // Live bets: doc id is `${user_id}_${match_id}`, which is the betMap key.
    const unsubBets = onSnapshot(collection(db, 'bets'), (snap) => {
      const betMap: Record<string, any> = {};
      snap.docs.forEach((d) => {
        const row = d.data() as any;
        betMap[d.id] = { home: row.home, away: row.away };
      });
      setBets(betMap);
    });

    // Live roster: self-registered players, newest sorted by name.
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      const rows = snap.docs.map(d => d.data() as Player);
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(rows);
    });

    const tick = setInterval(() => setNowMs(Date.now()), 60_000);

    return () => {
      unsubMatches();
      unsubBets();
      unsubPlayers();
      clearInterval(tick);
    };
  }, []);

  // Up Next = bettable window: not finalized and kicking off within 48h (plus
  // any already-kicked-off matches still awaiting a result), soonest first.
  const upNextMatches = useMemo(() =>
    matches
      .filter(m => m.status !== 'FINISHED' && kickoffMs(m) <= nowMs + BET_WINDOW_MS)
      .sort((a, b) => kickoffMs(a) - kickoffMs(b)),
    [matches, nowMs]);

  // Upcoming = future fixtures more than 48h out — visible but not yet bettable.
  const upcomingMatches = useMemo(() =>
    matches
      .filter(m => m.status !== 'FINISHED' && kickoffMs(m) > nowMs + BET_WINDOW_MS)
      .sort((a, b) => kickoffMs(a) - kickoffMs(b)),
    [matches, nowMs]);

  // Past = finalized by the arbiter, most recent first.
  const pastMatches = useMemo(() =>
    matches
      .filter(m => m.status === 'FINISHED')
      .sort((a, b) => kickoffMs(b) - kickoffMs(a)),
    [matches]);

  const handleRegister = async (name: string, avatar: string, pin: string) => {
    // crypto.randomUUID only exists in secure contexts (https/localhost), so it
    // throws when the app is opened over a plain-http LAN IP on a phone.
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await setDoc(doc(db, 'players', id), { id, name, avatar, pin });
    setCurrentUser(id);
    localStorage.setItem('pitch_club_user', id);
  };

  const handleBet = async (matchId: number, score: { home: number, away: number }) => {
    if (!currentUser) return;
    setBets(prev => ({ ...prev, [`${currentUser}_${matchId}`]: score }));
    await setDoc(doc(db, 'bets', `${currentUser}_${matchId}`), {
      user_id: currentUser,
      match_id: matchId,
      home: score.home,
      away: score.away,
    });
  };

  const handleSetResult = async (matchId: number, score: { home: number, away: number }) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, status: 'FINISHED', result_home: score.home, result_away: score.away } : m));
    await updateDoc(doc(db, 'matches', String(matchId)), {
      status: 'FINISHED',
      result_home: score.home,
      result_away: score.away,
    });
  };

  // Arbiter reverts a finalized match back to UPCOMING (clears the result), so
  // it leaves Past and re-enters the Up Next / Upcoming flow. Bets are kept.
  const handleReopenResult = async (matchId: number) => {
    setMatches(prev => prev.map(m => m.id === matchId
      ? { ...m, status: 'UPCOMING', result_home: undefined, result_away: undefined }
      : m));
    await updateDoc(doc(db, 'matches', String(matchId)), {
      status: 'UPCOMING',
      result_home: deleteField(),
      result_away: deleteField(),
    });
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
    <div className="min-h-screen bg-pitch-900 transition-all duration-700">

      <AuthModal
        isOpen={authModal.isOpen}
        targetUser={authModal.target}
        onClose={() => setAuthModal({ ...authModal, isOpen: false })}
        onSuccess={handleAuthSuccess}
      />

      <RegisterModal
        isOpen={registerOpen}
        existingNames={players.map(p => p.name)}
        onClose={() => setRegisterOpen(false)}
        onCreate={handleRegister}
      />

      <ArbiterModal
        isOpen={arbiterModalOpen}
        onClose={() => setArbiterModalOpen(false)}
        onSuccess={() => setIsArbiter(true)}
      />

      {/* Inner Container for Content */}
      <div className="pb-24 pt-20 px-6 max-w-2xl lg:max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col items-start mb-12">
          <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight leading-[0.9] text-paper">
            FCFC '26
          </h1>
          <div className="mt-4 flex items-center gap-4">
            <span className="font-mono text-xs tracking-widest uppercase border-b pb-1 text-gold border-gold">
              AGA
            </span>
          </div>
        </div>

        {/* USER SWITCHER: Dynamic Colors */}
        <div className="mb-10">
          <div className="flex justify-between items-end mb-3">
            <p className="font-mono text-[10px] uppercase text-paper/40">
              Active Punter:
            </p>
            <button
              onClick={() => isArbiter ? setIsArbiter(false) : setArbiterModalOpen(true)}
              className={clsx(
                "text-[9px] uppercase tracking-widest font-mono px-2 py-1 rounded transition-colors",
                isArbiter ? "bg-signal text-white" : "text-paper/10 hover:text-paper/30"
              )}
            >
              {isArbiter ? "Arbiter Active" : "⚖"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {players.map((p) => (
              <button
                key={p.id}
                onClick={() => handleUserClick(p)}
                className={clsx(
                  "px-4 py-2 rounded-full border text-xs font-mono transition-all whitespace-nowrap flex items-center gap-2",
                  currentUser === p.id
                    ? "bg-paper text-pitch-900 border-paper font-bold"
                    : "border-chalk text-paper/60 hover:border-gold/50"
                )}
              >
                <span>{p.avatar}</span> {p.name}
              </button>
            ))}
            <button
              onClick={() => setRegisterOpen(true)}
              className="px-4 py-2 rounded-full border border-dashed border-gold/40 text-xs font-mono text-gold/70 hover:border-gold hover:text-gold transition-all whitespace-nowrap"
            >
              + New
            </button>
          </div>
          {!currentUser && (
            <p className="mt-4 text-center text-xs font-mono text-gold/60 animate-pulse">
              {players.length ? 'Select your profile to begin...' : 'Tap + New to create your profile...'}
            </p>
          )}
        </div>

        {/* CONTENT AREA */}
        {isLoading ? (
          <div className="text-center py-20 font-mono text-gold animate-pulse">SYNCING FIXTURES...</div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'next' && (
              <motion.div
                key="next"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {upNextMatches.length === 0 ? (
                  <p className="lg:col-span-2 text-center py-16 font-mono text-xs uppercase tracking-widest text-paper/40">
                    No matches kicking off in the next 48 hours.
                  </p>
                ) : (
                  upNextMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      userBets={bets}
                      onBet={handleBet}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      locked={nowMs >= kickoffMs(match)}
                    />
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'upcoming' && (
              <motion.div
                key="upcoming"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {upcomingMatches.length === 0 ? (
                  <p className="lg:col-span-2 text-center py-16 font-mono text-xs uppercase tracking-widest text-paper/40">
                    No further fixtures scheduled.
                  </p>
                ) : (
                  upcomingMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      userBets={bets}
                      onBet={handleBet}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      notYetOpen
                    />
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'past' && (
              <motion.div
                key="past"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                {pastMatches.length === 0 ? (
                  <p className="lg:col-span-2 text-center py-16 font-mono text-xs uppercase tracking-widest text-paper/40">
                    No completed matches yet.
                  </p>
                ) : (
                  pastMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      userBets={bets}
                      onBet={handleBet}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      locked
                    />
                  ))
                )}
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
                <Leaderboard users={players} bets={bets} matches={matches} />
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>
      {/* End Inner Container */}

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 w-full z-50 border-t bg-pitch-900/80 border-chalk">
        <div className="max-w-2xl mx-auto flex">
          {/* Up Next Tab */}
          <button
            onClick={() => setActiveTab('next')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[11px] uppercase tracking-wide transition-colors relative",
              activeTab === 'next' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Up Next
            {activeTab === 'next' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Upcoming Tab */}
          <button
            onClick={() => setActiveTab('upcoming')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[11px] uppercase tracking-wide transition-colors relative",
              activeTab === 'upcoming' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Upcoming
            {activeTab === 'upcoming' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Past Tab */}
          <button
            onClick={() => setActiveTab('past')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[11px] uppercase tracking-wide transition-colors relative",
              activeTab === 'past' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Past
            {activeTab === 'past' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Standings Tab */}
          <button
            onClick={() => setActiveTab('table')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[11px] uppercase tracking-wide transition-colors relative",
              activeTab === 'table' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Table
            {activeTab === 'table' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

        </div>
      </nav>

    </div>
  );
}