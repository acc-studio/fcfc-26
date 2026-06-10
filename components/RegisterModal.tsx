'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { AVATARS } from '@/lib/data';

// Take just the first emoji/grapheme of whatever the user types or pastes,
// so multi-codepoint emoji (👨‍👩‍👧, flags) survive intact.
const firstGrapheme = (s: string): string => {
  if (!s) return '';
  const Seg = (Intl as any).Segmenter;
  if (Seg) {
    for (const { segment } of new Seg().segment(s)) return segment;
  }
  return Array.from(s)[0] ?? '';
};

interface RegisterModalProps {
  isOpen: boolean;
  existingNames: string[];
  onClose: () => void;
  onCreate: (name: string, avatar: string, pin: string) => Promise<void>;
}

export const RegisterModal = ({ isOpen, existingNames, onClose, onCreate }: RegisterModalProps) => {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setAvatar(AVATARS[0]);
      setPin('');
      setError('');
      setBusy(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) return setError('Name too short');
    if (existingNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      return setError('Name already taken');
    }
    if (!avatar) return setError('Pick an avatar');
    if (pin.length !== 4) return setError('PIN must be 4 characters');

    setBusy(true);
    try {
      await onCreate(trimmed, avatar, pin);
      onClose();
    } catch {
      setError('Could not create profile');
      setBusy(false);
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
            className="relative w-full max-w-xs bg-pitch-800 border border-gold/30 p-8 rounded-xl shadow-2xl"
          >
            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-6">
              <div className="text-center">
                <div className="text-4xl mb-2">{avatar}</div>
                <h3 className="font-serif text-2xl text-paper">New Punter</h3>
                <p className="font-mono text-[10px] uppercase text-gold tracking-widest mt-1">
                  Claim your spot
                </p>
              </div>

              {/* Username */}
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                maxLength={16}
                value={name}
                onChange={(e) => { setError(''); setName(e.target.value); }}
                className="w-full bg-pitch-900 border-b-2 border-chalk focus:border-gold text-center font-serif text-2xl py-3 text-paper focus:outline-none transition-colors"
                placeholder="Your name"
              />

              {/* Avatar picker: quick palette + free-choice input */}
              <div className="w-full flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-2">
                  {AVATARS.map((a) => (
                    <button
                      type="button"
                      key={a}
                      onClick={() => setAvatar(a)}
                      className={clsx(
                        "text-xl w-9 h-9 rounded flex items-center justify-center border transition-colors",
                        avatar === a ? "border-gold bg-gold/10" : "border-chalk hover:border-gold/50"
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  value={avatar}
                  onChange={(e) => { setError(''); setAvatar(firstGrapheme(e.target.value)); }}
                  aria-label="Custom emoji"
                  className="w-14 h-14 bg-pitch-900 border border-chalk focus:border-gold rounded-lg text-center text-3xl leading-none text-paper focus:outline-none transition-colors"
                  placeholder="🙂"
                />
                <p className="font-mono text-[9px] uppercase text-paper/30 tracking-widest">
                  …or type any emoji
                </p>
              </div>

              {/* PIN */}
              <div className="w-full">
                <p className="font-mono text-[10px] uppercase text-paper/40 tracking-widest text-center mb-2">
                  Choose a 4-char PIN
                </p>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  autoCorrect="off"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => { setError(''); setPin(e.target.value.toUpperCase()); }}
                  className="w-full bg-pitch-900 border-b-2 border-chalk focus:border-gold text-center font-mono text-3xl tracking-[0.5em] py-3 text-paper focus:outline-none transition-colors"
                  placeholder="...."
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-signal font-mono text-[10px] uppercase tracking-widest"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-gold text-pitch-900 font-mono font-bold uppercase tracking-wider hover:bg-paper transition-colors rounded text-xs disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create & Enter'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="text-paper/30 hover:text-paper font-mono text-xs uppercase tracking-widest"
              >
                Cancel
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
