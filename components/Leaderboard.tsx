'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { computePunterStats, type Player, type Bet, type Match, type PunterStat } from '@/lib/data';
import { AnalyticsLab, StreakBadge } from '@/components/AnalyticsLab';
import { Emoji } from '@/components/Emoji';

interface LeaderboardProps {
  users: Player[];
  bets: Record<string, Bet | undefined>;
  matches: Match[];
  ignored: Set<string>;
  currentUser: string | null;
  onIgnore: (id: string) => void;
  onUnignore: (id: string) => void;
}

export const Leaderboard = ({ users, bets, matches, ignored, currentUser, onIgnore, onUnignore }: LeaderboardProps) => {
  const [showLab, setShowLab] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // Ignored players are dropped from the table + analytics for this viewer only.
  const activeUsers = useMemo(() => users.filter(u => !ignored.has(u.id)), [users, ignored]);
  const ignoredUsers = useMemo(() => users.filter(u => ignored.has(u.id)), [users, ignored]);

  const { stats } = useMemo(
    () => computePunterStats(activeUsers, bets, matches),
    [activeUsers, bets, matches],
  );
  const scores = useMemo(() => [...stats].sort((a, b) => b.points - a.points), [stats]);

  if (showLab) {
    return <AnalyticsLab users={activeUsers} bets={bets} matches={matches} onBack={() => setShowLab(false)} />;
  }

  return (
    <div className="w-full max-w-md mx-auto mt-12">
      <div className="flex justify-between mb-4 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
        <span>Punter</span>
        <span>PTS</span>
      </div>
      <div className="flex flex-col gap-2">
        {scores.map((user: PunterStat, idx: number) => (
          <motion.div
            layout
            key={user.id}
            className={clsx(
              "group flex justify-between items-center p-3 rounded border transition-colors",
              idx === 0 ? "bg-gold/10 border-gold/50" : "bg-pitch-800/30 border-transparent"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="font-serif text-lg w-6 text-paper/50">{idx + 1}.</span>
              <span className="text-xl"><Emoji emoji={user.avatar} /></span>
              <span className={clsx("font-sans font-bold text-sm", idx === 0 ? "text-gold" : "text-paper")}>{user.name}</span>
              <StreakBadge stat={user} />
            </div>
            <div className="flex items-center gap-2">
              {/* Mute another punter (yourself excepted), only while logged in. */}
              {currentUser && user.id !== currentUser && (
                <button
                  onClick={() => onIgnore(user.id)}
                  aria-label={`Ignore ${user.name}`}
                  title={`Ignore ${user.name}`}
                  className="text-xs opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                >
                  🙈
                </button>
              )}
              <span className="font-mono text-sm text-gold font-bold w-8 text-center">{user.points}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <button
        onClick={() => setShowLab(true)}
        className="mt-8 w-full border border-gold/50 bg-gold/5 hover:bg-gold/15 text-gold font-mono text-[11px] uppercase tracking-widest leading-relaxed py-6 px-4 rounded transition-colors flex items-center justify-center gap-2"
      >
        <span className="text-base">🧪</span>
        Advanced FCFC Football Analytics Lab
      </button>

      {/* Ignored punters — tucked away; tap to manage and un-ignore. */}
      {ignoredUsers.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowIgnored(s => !s)}
            className="w-full font-mono text-[10px] uppercase tracking-widest text-paper/30 hover:text-paper/60 transition-colors py-2 flex items-center justify-center gap-1.5"
          >
            🙈 Ignored · {ignoredUsers.length} {showIgnored ? '▾' : '▸'}
          </button>
          {showIgnored && (
            <div className="flex flex-col gap-1.5 mt-1">
              {ignoredUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between bg-pitch-800/20 rounded px-3 py-2 border border-transparent">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base opacity-50"><Emoji emoji={u.avatar} /></span>
                    <span className="font-sans text-sm text-paper/50 truncate">{u.name}</span>
                  </span>
                  <button
                    onClick={() => onUnignore(u.id)}
                    className="font-mono text-[10px] uppercase tracking-widest text-paper/50 hover:text-gold border border-chalk px-2.5 py-1 rounded transition-colors shrink-0"
                  >
                    ↩ Un-ignore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
