'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { computePunterStats } from '@/lib/data';
import { AnalyticsLab, StreakBadge } from '@/components/AnalyticsLab';
import { Emoji } from '@/components/Emoji';

export const Leaderboard = ({ users, bets, matches }: any) => {
  const [showLab, setShowLab] = useState(false);

  const { stats } = useMemo(
    () => computePunterStats(users, bets, matches),
    [users, bets, matches],
  );
  const scores = useMemo(() => [...stats].sort((a, b) => b.points - a.points), [stats]);

  if (showLab) {
    return <AnalyticsLab users={users} bets={bets} matches={matches} onBack={() => setShowLab(false)} />;
  }

  return (
    <div className="w-full max-w-md mx-auto mt-12">
      <div className="flex justify-between mb-4 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
        <span>Punter</span>
        <span>PTS</span>
      </div>
      <div className="flex flex-col gap-2">
        {scores.map((user: any, idx: number) => (
          <motion.div
            layout
            key={user.id}
            className={clsx(
              "flex justify-between items-center p-3 rounded border transition-colors",
              idx === 0 ? "bg-gold/10 border-gold/50" : "bg-pitch-800/30 border-transparent"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="font-serif text-lg w-6 text-paper/50">{idx + 1}.</span>
              <span className="text-xl"><Emoji emoji={user.avatar} /></span>
              <span className={clsx("font-sans font-bold text-sm", idx === 0 ? "text-gold" : "text-paper")}>{user.name}</span>
              <StreakBadge stat={user} />
            </div>
            <span className="font-mono text-sm text-gold font-bold w-8 text-center">{user.points}</span>
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
    </div>
  );
};
