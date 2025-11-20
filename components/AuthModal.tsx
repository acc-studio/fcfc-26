'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Player } from '@/lib/data';

interface AuthModalProps {
  isOpen: boolean;
  targetUser: Player | null;
  onClose: () => void;
  onSuccess: (user: Player) => void;
}

export const AuthModal = ({ isOpen, targetUser, onClose, onSuccess }: AuthModalProps) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setInput('');
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!targetUser) return;

    if (input === targetUser.code) {
      onSuccess(targetUser);
      onClose();
    } else {
      setError(true);
      setInput(''); // Clear input on fail
      // Shake effect logic is handled by Framer Motion variants below if desired, 
      // but clearing input + red text is enough for MVP
    }
  };

  return (
    <AnimatePresence>
      {isOpen && targetUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-pitch-900/90 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-xs bg-pitch-800 border border-gold/30 p-8 rounded-xl shadow-2xl"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <div className="text-4xl mb-2">{targetUser.avatar}</div>
                <h3 className="font-serif text-2xl text-paper">Identity Check</h3>
                <p className="font-mono text-[10px] uppercase text-gold tracking-widest mt-1">
                  Enter Aga Code for {targetUser.name}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="w-full">
                <input
                  ref={inputRef}
                  type="tel" // Numeric keyboard on mobile
                  maxLength={4}
                  value={input}
                  onChange={(e) => {
                    setError(false);
                    setInput(e.target.value);
                  }}
                  className={clsx(
                    "w-full bg-pitch-900 border-b-2 text-center font-mono text-3xl tracking-[1em] py-4 text-paper focus:outline-none transition-colors",
                    error ? "border-signal text-signal placeholder:text-signal/50" : "border-chalk focus:border-gold"
                  )}
                  placeholder="...."
                />
              </form>

              {error && (
                <motion.p 
                  initial={{ opacity: 0, y: -5 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="text-signal font-mono text-[10px] uppercase tracking-widest"
                >
                  Access Denied
                </motion.p>
              )}

              <button 
                onClick={onClose}
                className="text-paper/30 hover:text-paper font-mono text-xs uppercase tracking-widest mt-2"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};