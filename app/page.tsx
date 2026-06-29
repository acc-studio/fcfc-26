'use client';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Match, Player, Pick, FormMatch, BracketPrediction, kickoffMs, BET_WINDOW_MS, isKnockout, teamsResolved } from '@/lib/data';
import { MatchCard } from '@/components/MatchCard';
import { Emoji } from '@/components/Emoji';
import { Leaderboard } from '@/components/Leaderboard';
import { Groups } from '@/components/Groups';
import { Bracket } from '@/components/Bracket';
import { BracketGame } from '@/components/BracketGame';
import { auth, db } from '@/lib/firebase';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore';
import { AuthModal } from '@/components/AuthModal';
import { RegisterModal } from '@/components/RegisterModal';
import { ArbiterModal } from '@/components/ArbiterModal';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function WorldCupApp() {
  const [activeTab, setActiveTab] = useState<'next' | 'upcoming' | 'past' | 'groups' | 'bracket' | 'table'>('next');

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
  // Recent form by canonical team name, from the `teams` collection.
  const [teamForm, setTeamForm] = useState<Record<string, FormMatch[]>>({});
  // Locked "Build Your Bracket" predictions, keyed by player id.
  const [brackets, setBrackets] = useState<Record<string, BracketPrediction>>({});
  const [isLoading, setIsLoading] = useState(true);
  // Refreshed every minute so the 48h betting window closes live.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Per-viewer "ignore" list (local only): players the current user has muted.
  // They drop out of this device's table, analytics and bet displays. Keyed by
  // the logged-in player so each profile on a shared device has its own list.
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  useEffect(() => {
    const lastUser = localStorage.getItem('pitch_club_user');
    if (lastUser) setCurrentUser(lastUser);
    // Arbiter status persists per device (the anon uid + arbiters/{uid} doc do
    // too). The flag is just UI — the rules still enforce real authorization.
    if (localStorage.getItem('pitch_arbiter') === '1') setIsArbiter(true);

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
        if (!row.pick) return; // ignore legacy score-based bets
        betMap[d.id] = { pick: row.pick, locked: !!row.locked, user_id: row.user_id, match_id: row.match_id };
      });
      setBets(betMap);
    });

    // Live roster: self-registered players, newest sorted by name.
    const unsubPlayers = onSnapshot(collection(db, 'players'), (snap) => {
      const rows = snap.docs.map(d => d.data() as Player);
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(rows);
    });

    // Recent form: `teams/{name}` -> { name, form[] }, keyed by team name.
    const unsubTeams = onSnapshot(collection(db, 'teams'), (snap) => {
      const map: Record<string, FormMatch[]> = {};
      snap.docs.forEach((d) => {
        const row = d.data() as { name?: string; form?: FormMatch[] };
        if (Array.isArray(row.form)) map[row.name ?? d.id] = row.form;
      });
      setTeamForm(map);
    });

    // Live brackets: `brackets/{user_id}` -> a player's locked prediction.
    const unsubBrackets = onSnapshot(collection(db, 'brackets'), (snap) => {
      const map: Record<string, BracketPrediction> = {};
      snap.docs.forEach((d) => {
        const row = d.data() as BracketPrediction;
        if (row.picks) map[row.user_id ?? d.id] = row;
      });
      setBrackets(map);
    });

    const tick = setInterval(() => setNowMs(Date.now()), 60_000);

    return () => {
      unsubMatches();
      unsubBets();
      unsubPlayers();
      unsubTeams();
      unsubBrackets();
      clearInterval(tick);
    };
  }, []);

  // A session restored from localStorage whose profile no longer exists in the
  // roster is treated as logged out — it must never act as a logged-in user.
  useEffect(() => {
    if (currentUser && players.length > 0 && !players.some(p => p.id === currentUser)) {
      setCurrentUser(null);
      localStorage.removeItem('pitch_club_user');
    }
  }, [currentUser, players]);

  // Load this profile's ignore list when the logged-in user changes (logged out
  // = ignore nobody). Handlers below write through to localStorage directly.
  useEffect(() => {
    if (!currentUser) { setIgnored(new Set()); return; }
    try {
      const raw = localStorage.getItem(`pitch_ignored_${currentUser}`);
      setIgnored(new Set(raw ? JSON.parse(raw) : []));
    } catch { setIgnored(new Set()); }
  }, [currentUser]);

  const persistIgnored = (next: Set<string>) => {
    setIgnored(next);
    if (currentUser) localStorage.setItem(`pitch_ignored_${currentUser}`, JSON.stringify([...next]));
  };
  const handleIgnore = (id: string) => { const n = new Set(ignored); n.add(id); persistIgnored(n); };
  const handleUnignore = (id: string) => { const n = new Set(ignored); n.delete(id); persistIgnored(n); };

  // Roster minus anyone this viewer has muted — fed to the cards, bracket and
  // analytics so ignored players vanish from bet displays and stats.
  const visiblePlayers = useMemo(() => players.filter(p => !ignored.has(p.id)), [players, ignored]);

  // A match is bettable now if it kicks off within the 48h window — and, for a
  // knockout slot, only once the feeding round has resolved it to two real
  // teams (you can't bet "Winner Group A"). Unresolved knockout slots fall
  // through to Upcoming until the poller fills them in.

  // Up Next = bettable window: not finalized and kicking off within 48h (plus
  // any already-kicked-off matches still awaiting a result), soonest first.
  const upNextMatches = useMemo(() =>
    matches
      .filter(m => m.status !== 'FINISHED'
        && kickoffMs(m) <= nowMs + BET_WINDOW_MS && (!isKnockout(m) || teamsResolved(m)))
      .sort((a, b) => kickoffMs(a) - kickoffMs(b)),
    [matches, nowMs]);

  // Upcoming = future fixtures not yet bettable (>48h out, or an unresolved
  // knockout slot) — visible but not yet open.
  const upcomingMatches = useMemo(() =>
    matches
      .filter(m => m.status !== 'FINISHED'
        && !(kickoffMs(m) <= nowMs + BET_WINDOW_MS && (!isKnockout(m) || teamsResolved(m))))
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

  const handlePick = async (matchId: number, pick: Pick) => {
    if (!currentUser) return;
    const key = `${currentUser}_${matchId}`;
    if (bets[key]?.locked) return; // can't change a locked-in bet
    setBets(prev => ({ ...prev, [key]: { pick, locked: false, user_id: currentUser, match_id: matchId } }));
    await setDoc(doc(db, 'bets', key), { user_id: currentUser, match_id: matchId, pick, locked: false });
  };

  const handleLockIn = async (matchId: number) => {
    if (!currentUser) return;
    const key = `${currentUser}_${matchId}`;
    if (!bets[key]?.pick) return;
    setBets(prev => ({ ...prev, [key]: { ...prev[key], locked: true } }));
    await updateDoc(doc(db, 'bets', key), { locked: true });
  };

  const handleSetResult = async (
    matchId: number,
    result: { home: number; away: number; advance?: 'HOME' | 'AWAY'; shootout?: { home: number; away: number } },
  ) => {
    const { home, away, advance, shootout } = result;
    setMatches(prev => prev.map(m => m.id === matchId
      ? { ...m, status: 'FINISHED', result_home: home, result_away: away, advance, shootout }
      : m));
    await updateDoc(doc(db, 'matches', String(matchId)), {
      status: 'FINISHED',
      result_home: home,
      result_away: away,
      // Knockout only — clear them on a group match (or if a knockout is edited
      // from a shootout to a clear winner) so stale data can't linger.
      advance: advance ?? deleteField(),
      shootout: shootout ?? deleteField(),
    });
  };

  // Arbiter reverts a finalized match back to UPCOMING (clears the result), so
  // it leaves Past and re-enters the Up Next / Upcoming flow. Bets are kept.
  const handleReopenResult = async (matchId: number) => {
    setMatches(prev => prev.map(m => m.id === matchId
      ? { ...m, status: 'UPCOMING', result_home: undefined, result_away: undefined, advance: undefined, shootout: undefined }
      : m));
    await updateDoc(doc(db, 'matches', String(matchId)), {
      status: 'UPCOMING',
      result_home: deleteField(),
      result_away: deleteField(),
      advance: deleteField(),
      shootout: deleteField(),
    });
  };

  // Commit a "Build Your Bracket" prediction. Written once and locked — the
  // rules reject any later update, so it's permanent (matches the UI warning).
  const handleLockBracket = async (picks: Record<number, string>) => {
    if (!currentUser || brackets[currentUser]?.locked) return;
    const payload: BracketPrediction = {
      user_id: currentUser,
      picks,
      locked: true,
      updatedAt: new Date().toISOString(),
    };
    setBrackets(prev => ({ ...prev, [currentUser]: payload }));
    await setDoc(doc(db, 'brackets', currentUser), payload);
  };

  const handleUserClick = (player: Player) => {
    if (currentUser === player.id) return;
    setAuthModal({ isOpen: true, target: player });
  };

  const handleAuthSuccess = (player: Player) => {
    setCurrentUser(player.id);
    localStorage.setItem('pitch_club_user', player.id);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('pitch_club_user');
  };

  const handleArbiterSuccess = () => {
    setIsArbiter(true);
    localStorage.setItem('pitch_arbiter', '1');
  };

  // Stepping down also removes this device's arbiters/{uid} doc, so it loses
  // result-writing authorization at the rules level (not just in the UI).
  const handleExitArbiter = async () => {
    setIsArbiter(false);
    localStorage.removeItem('pitch_arbiter');
    const uid = auth.currentUser?.uid;
    if (uid) {
      try { await deleteDoc(doc(db, 'arbiters', uid)); } catch { /* already gone */ }
    }
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
        onSuccess={handleArbiterSuccess}
      />

      {/* Inner Container for Content */}
      <div className="pb-24 pt-20 px-6 max-w-2xl lg:max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="mb-12">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight leading-[0.9] text-paper">
              FCFC '26
            </h1>
            <ThemeToggle />
          </div>
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
              onClick={() => isArbiter ? handleExitArbiter() : setArbiterModalOpen(true)}
              className={clsx(
                "text-[9px] uppercase tracking-widest font-mono px-2 py-1 rounded transition-colors",
                isArbiter ? "bg-signal text-white" : "text-paper/10 hover:text-paper/30"
              )}
            >
              {isArbiter ? "Arbiter Active" : "⚖"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {players.map((p) => {
              const active = currentUser === p.id;
              return (
                <div
                  key={p.id}
                  className={clsx(
                    "flex items-center rounded-full border text-xs font-mono transition-all whitespace-nowrap shrink-0",
                    active ? "bg-paper text-pitch-900 border-paper font-bold" : "border-chalk text-paper/60 hover:border-gold/50"
                  )}
                >
                  <button
                    onClick={() => handleUserClick(p)}
                    disabled={active}
                    className={clsx("flex items-center gap-2 py-2 pl-4", active ? "pr-2 cursor-default" : "pr-4")}
                  >
                    <Emoji emoji={p.avatar} /> {p.name}
                  </button>
                  {active && (
                    <button
                      onClick={handleLogout}
                      aria-label="Log out"
                      title="Log out"
                      className="pr-3 pl-1 py-2 text-pitch-900/50 hover:text-pitch-900 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
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
                className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
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
                      players={visiblePlayers}
                      onPick={handlePick}
                      onLockIn={handleLockIn}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      homeForm={teamForm[match.home]}
                      awayForm={teamForm[match.away]}
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
                className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
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
                      players={visiblePlayers}
                      onPick={handlePick}
                      onLockIn={handleLockIn}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      homeForm={teamForm[match.home]}
                      awayForm={teamForm[match.away]}
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
                className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start"
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
                      players={visiblePlayers}
                      onPick={handlePick}
                      onLockIn={handleLockIn}
                      onSetResult={handleSetResult}
                      onReopen={handleReopenResult}
                      activeUser={currentUser || ''}
                      isArbiter={isArbiter}
                      homeForm={teamForm[match.home]}
                      awayForm={teamForm[match.away]}
                      locked
                    />
                  ))
                )}
              </motion.div>
            )}

            {activeTab === 'groups' && (
              <motion.div
                key="groups"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Groups matches={matches} />
              </motion.div>
            )}

            {activeTab === 'bracket' && (
              <motion.div
                key="bracket"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
              >
                <Bracket matches={matches} players={visiblePlayers} bets={bets} currentUser={currentUser || ''} />
                <div className="my-10 border-t border-chalk" />
                <BracketGame
                  matches={matches}
                  players={visiblePlayers}
                  currentUser={currentUser || ''}
                  brackets={brackets}
                  onLock={handleLockBracket}
                />
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
                <Leaderboard
                  users={players}
                  bets={bets}
                  matches={matches}
                  ignored={ignored}
                  currentUser={currentUser}
                  onIgnore={handleIgnore}
                  onUnignore={handleUnignore}
                />
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
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
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
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
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
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
              activeTab === 'past' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Past
            {activeTab === 'past' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Groups Tab */}
          <button
            onClick={() => setActiveTab('groups')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
              activeTab === 'groups' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Groups
            {activeTab === 'groups' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Bracket Tab */}
          <button
            onClick={() => setActiveTab('bracket')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
              activeTab === 'bracket' ? "text-gold" : "text-paper/40 hover:text-paper"
            )}
          >
            Bracket
            {activeTab === 'bracket' && (
              <motion.div layoutId="nav-indicator" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold" />
            )}
          </button>

          <div className="w-px bg-chalk my-4 opacity-50"></div>

          {/* Standings Tab */}
          <button
            onClick={() => setActiveTab('table')}
            className={clsx(
              "flex-1 py-6 text-center font-mono text-[10px] md:text-[11px] uppercase tracking-wide transition-colors relative whitespace-nowrap",
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