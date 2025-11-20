import React from 'react';
import { clsx } from 'clsx';

interface ScoreDialProps {
  value: number;
  onChange: (n: number) => void;
  label: string;
}

export const ScoreDial = ({ value, onChange, label }: ScoreDialProps) => {
  return (
    <div className="flex flex-col items-center gap-1 md:gap-2">
      <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-widest text-paper/60">
        {label}
      </span>
      <div className="flex items-center gap-2 md:gap-4 bg-pitch-900/50 p-1.5 md:p-2 rounded-lg border border-white/10 shadow-inner">
        {/* Minus Button */}
        <button 
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 md:w-8 md:h-8 flex items-center justify-center text-paper/50 hover:text-paper hover:bg-white/5 rounded transition-colors font-mono active:scale-95 touch-manipulation"
        >-</button>
        
        {/* Number Display */}
        <span className="font-serif text-xl md:text-2xl font-bold w-6 md:w-8 text-center text-paper tabular-nums">
          {value}
        </span>
        
        {/* Plus Button */}
        <button 
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 md:w-8 md:h-8 flex items-center justify-center text-paper/50 hover:text-paper hover:bg-white/5 rounded transition-colors font-mono active:scale-95 touch-manipulation"
        >+</button>
      </div>
    </div>
  );
};