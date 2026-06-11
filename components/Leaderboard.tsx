'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { betOutcome } from '@/lib/data';

export const Leaderboard = ({ users, bets, matches }: any) => {
  const scores = useMemo(() => {
    return users.map((user: any) => {
      let points = 0;

      matches.filter((m: any) => m.status === 'FINISHED').forEach((match: any) => {
        const bet = bets[`${user.id}_${match.id}`];
        if (!bet?.pick) return;
        // 1 point for a correct outcome.
        if (betOutcome(bet.pick, match.result_home, match.result_away) === 'win') {
          points += 1;
        }
      });

      return { ...user, points };
    }).sort((a: any, b: any) => b.points - a.points);
  }, [users, bets, matches]);

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
              <span className="text-xl">{user.avatar}</span>
              <span className={clsx("font-sans font-bold text-sm", idx === 0 ? "text-gold" : "text-paper")}>{user.name}</span>
            </div>
            <span className="font-mono text-sm text-gold font-bold w-8 text-center">{user.points}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
