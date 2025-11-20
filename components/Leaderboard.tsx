'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export const Leaderboard = ({ users, bets, matches }: any) => {
  const scores = useMemo(() => {
    return users.map((user: any) => {
      let points = 0;
      let exacts = 0;
      
      matches.filter((m: any) => m.status === 'FINISHED').forEach((match: any) => {
        const bet = bets[`${user.id}_${match.id}`];
        if (!bet) return;
        
        // Use new DB column names
        const actualHome = match.result_home;
        const actualAway = match.result_away;
        
        if (actualHome === undefined || actualAway === undefined) return;

        // 3 Points for Exact Score
        if (bet.home === actualHome && bet.away === actualAway) {
          points += 3;
          exacts += 1;
        } 
        // 1 Point for Correct Outcome
        else if (Math.sign(actualHome - actualAway) === Math.sign(bet.home - bet.away)) {
          points += 1;
        }
      });

      return { ...user, points, exacts };
    }).sort((a: any, b: any) => b.points - a.points || b.exacts - a.exacts);
  }, [users, bets, matches]);

  return (
    <div className="w-full max-w-md mx-auto mt-12">
      <div className="flex justify-between mb-4 font-mono text-[10px] uppercase tracking-widest text-paper/40 border-b border-chalk pb-2">
        <span>Punter</span>
        <div className="flex gap-4"><span>Exacts</span><span>PTS</span></div>
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
            <div className="flex gap-6 font-mono text-sm">
              <span className="text-paper/50 w-8 text-center">{user.exacts}</span>
              <span className="text-gold font-bold w-8 text-center">{user.points}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};