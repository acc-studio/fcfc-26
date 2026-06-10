'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { ARBITER_CODE } from '@/lib/data';

interface ArbiterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ArbiterModal = ({ isOpen, onClose, onSuccess }: ArbiterModalProps) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input === ARBITER_CODE) {
      onSuccess();
      onClose();
    } else {
      setError(true);
      setInput('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-pitch-900/90 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="relative w-full max-w-xs bg-pitch-800 border border-signal/40 p-8 rounded-xl shadow-2xl"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="text-center">
                <div className="text-4xl mb-2">⚖️</div>
                <h3 className="font-serif text-2xl text-paper">Arbiter Access</h3>
                <p className="font-mono text-[10px] uppercase text-signal tracking-widest mt-1">
                  Enter arbiter code
                </p>
              </div>

              <form onSubmit={handleSubmit} className="w-full">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  maxLength={6}
                  value={input}
                  onChange={(e) => {
                    setError(false);
                    setInput(e.target.value);
                  }}
                  className={clsx(
                    "w-full bg-pitch-900 border-b-2 text-center font-mono text-3xl tracking-[0.4em] py-4 text-paper focus:outline-none transition-colors",
                    error ? "border-signal text-signal" : "border-chalk focus:border-signal"
                  )}
                  placeholder="······"
                />
              </form>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-signal font-mono text-[10px] uppercase tracking-widest"
                >
                  Wrong code
                </motion.p>
              )}

              <button
                onClick={onClose}
                className="text-paper/30 hover:text-paper font-mono text-xs uppercase tracking-widest"
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
