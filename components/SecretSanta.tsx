'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { Player, PLAYERS } from '@/lib/data';
import { supabase } from '@/lib/supabase';

interface SecretSantaProps {
  currentUser: string | null;
  isCommissioner: boolean;
}

export const SecretSanta = ({ currentUser, isCommissioner }: SecretSantaProps) => {
  const [pairings, setPairings] = useState<Record<string, string>>({});
  const [isRevealed, setIsRevealed] = useState(false);
  
  // Snow Effect Generator
  const snowflakes = Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 5}s`,
    duration: `${5 + Math.random() * 5}s`
  }));

  useEffect(() => {
    const fetchPairs = async () => {
      const { data } = await supabase.from('secret_santa').select('*');
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((row: any) => map[row.giver_id] = row.receiver_id);
        setPairings(map);
      }
    };

    fetchPairs();

    const channel = supabase.channel('santa_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'secret_santa' }, (payload) => {
        const newRow = payload.new as any;
        if (newRow) setPairings(prev => ({ ...prev, [newRow.giver_id]: newRow.receiver_id }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ADMIN: Shuffle Logic
  const handleDraw = async () => {
    if (!confirm("Are you sure? This will assign new Secret Santagas for everyone!")) return;

    // 1. Shuffle Players
    const shuffled = [...PLAYERS].sort(() => Math.random() - 0.5);
    const newPairs = [];

    // 2. Create Circular Chain (A->B, B->C, ... Z->A)
    for (let i = 0; i < shuffled.length; i++) {
      const giver = shuffled[i];
      const receiver = shuffled[(i + 1) % shuffled.length];
      newPairs.push({ giver_id: giver.id, receiver_id: receiver.id });
    }

    // 3. Clear old & Insert new
    await supabase.from('secret_santa').delete().neq('giver_id', 'xyz'); // Hack to delete all
    await supabase.from('secret_santa').upsert(newPairs);
  };

  const myReceiverId = currentUser ? pairings[currentUser] : null;
  const myReceiver = PLAYERS.find(p => p.id === myReceiverId);
  const hasDrawHappened = Object.keys(pairings).length > 0;

  return (
    <div className="relative w-full min-h-[60vh] flex flex-col items-center justify-center text-center p-6 overflow-hidden rounded-xl border-4 border-yellow-400 bg-red-800 shadow-[0_0_40px_rgba(255,0,0,0.5)]">
      
      {/* Kitsch Background Decorations */}
      {snowflakes.map(flake => (
        <div 
          key={flake.id} 
          className="snow-flake" 
          style={{ left: flake.left, animationDelay: flake.delay, animationDuration: flake.duration }}
        >
          ❄
        </div>
      ))}

      <div className="relative z-10 max-w-md w-full">
        {/* Header */}
        <h2 className="font-serif text-4xl md:text-5xl text-white -mt-2 mb-1 text-shadow-kitsch italic transform -rotate-2">
          Aga Başı Çekilişi '26
        </h2>
        <div className="w-full h-4 bg-candy-cane mb-8 rounded-full shadow-inner border-2 border-red-700/70" />

        {/* STATE 1: Draw hasn't happened yet */}
        {!hasDrawHappened ? (
          <div className="bg-white/10 p-6 rounded-lg backdrop-blur-sm border border-white/20">
            <p className="font-mono text-yellow-200 uppercase tracking-widest mb-4">
              The North Pole is waiting...
            </p>
            {isCommissioner ? (
              <button 
                onClick={handleDraw}
                className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full shadow-lg border-4 border-green-900 transition-transform hover:scale-105 active:scale-95"
              >
                🎄 COMMISSIONER: DRAW NAMES 🎄
              </button>
            ) : (
              <p className="text-sm text-white/60 italic">Waiting for the Commissioner to pull the lever.</p>
            )}
          </div>
        ) : (
          // STATE 2: Draw has happened
          <div>
            {!currentUser ? (
              <p className="text-yellow-200 font-mono animate-pulse">
                Please select your name above to see your mission.
              </p>
            ) : (
              <div className="perspective-1000">
                 {/* The Reveal Card */}
                 {!isRevealed ? (
                   <motion.button
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={() => setIsRevealed(true)}
                     className="w-full aspect-[3/2] bg-green-800 rounded-xl border-4 border-dashed border-yellow-400 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group"
                   >
                      <span className="text-6xl mb-4 group-hover:rotate-12 transition-transform">🎁</span>
                      <span className="font-serif text-2xl text-white font-bold">Aganın Başını Gör</span>
                      <span className="text-xs text-green-200 mt-2 font-mono uppercase tracking-widest">For your eyes only</span>
                   </motion.button>
                 ) : (
                   <motion.div
                     initial={{ rotateX: 90, opacity: 0 }}
                     animate={{ rotateX: 0, opacity: 1 }}
                     className="w-full aspect-[3/2] bg-white rounded-xl border-4 border-red-600 flex flex-col items-center justify-center shadow-2xl p-6 relative"
                   >
                      <div className="absolute top-2 left-2 text-2xl">🎄</div>
                      <div className="absolute bottom-2 right-2 text-2xl">🎄</div>
                      
                      <p className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-2">Başını Aldığın Aga</p>
                      {myReceiver ? (
                        <>
                          <div className="text-6xl mb-2 animate-bounce">{myReceiver.avatar}</div>
                          <h3 className="font-serif text-4xl text-red-600 font-black transform -rotate-3">
                            {myReceiver.name}
                          </h3>
                        </>
                      ) : (
                        <p className="text-red-500 font-bold">Error: Elf Not Found</p>
                      )}
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); setIsRevealed(false); }}
                        className="absolute bottom-4 text-xs text-gray-400 hover:text-red-500 underline"
                      >
                        Wrap it back up
                      </button>
                   </motion.div>
                 )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};