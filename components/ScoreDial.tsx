import React from 'react';

interface ScoreDialProps {
  value: number;
  onChange: (n: number) => void;
  label: string;
}

export const ScoreDial = ({ value, onChange, label }: ScoreDialProps) => {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-paper/60">{label}</span>
      <div className="flex items-center gap-4 bg-pitch-800 p-2 rounded-lg border border-chalk shadow-inner">
        <button 
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-8 h-8 flex items-center justify-center text-paper/50 hover:text-paper hover:bg-pitch-700 rounded transition-colors font-mono active:scale-95"
        >-</button>
        <span className="font-serif text-2xl font-bold w-8 text-center text-paper tabular-nums">{value}</span>
        <button 
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 flex items-center justify-center text-paper/50 hover:text-paper hover:bg-pitch-700 rounded transition-colors font-mono active:scale-95"
        >+</button>
      </div>
    </div>
  );
};