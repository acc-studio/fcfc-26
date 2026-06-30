'use client';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Player, ProSession } from '@/lib/data';
import { Emoji } from './Emoji';
import { DatePicker } from './Calendar';

// The "Pro" tab: organise a Pro Clubs gaming session. A logged-in player picks
// who to invite + a date/time; invitees accept or reject (a rejection needs a
// reason). The invite pushes instantly (via /api/pro-invite); a T-60min reminder
// comes from the notifier. Pure UI — page.tsx owns the writes. Text is kept to a
// minimum by design (symbols over words).

interface ProProps {
  sessions: ProSession[];
  players: Player[];
  currentUser: string;
  onCreate: (invitees: string[], startMs: number) => Promise<void>;
  onRespond: (sessionId: string, status: 'accepted' | 'rejected', sebep?: string) => Promise<void>;
}

// Turkey is a fixed UTC+3 (no DST), like the rest of the app's times.
const TR_OFFSET = 3;
const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  });
// today's date as YYYY-MM-DD in Turkey time, for the date input default/min.
const trToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

export const Pro = ({ sessions, players, currentUser, onCreate, onRespond }: ProProps) => {
  const nameById = useMemo(() => new Map(players.map(p => [p.id, p] as const)), [players]);

  const [creating, setCreating] = useState(false);
  const [invitees, setInvitees] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(trToday());
  const [time, setTime] = useState('21:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // per-session reject UI: which session is open + the typed reason.
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [sebep, setSebep] = useState('');

  const others = players.filter(p => p.id !== currentUser);

  // Soonest upcoming first; finished sessions sink to the bottom (most recent).
  const sorted = useMemo(() => {
    const now = Date.now();
    return [...sessions].sort((a, b) => {
      const ap = a.startMs >= now, bp = b.startMs >= now;
      if (ap !== bp) return ap ? -1 : 1;
      return ap ? a.startMs - b.startMs : b.startMs - a.startMs;
    });
  }, [sessions]);

  const toggleInvitee = (id: string) => {
    setError('');
    setInvitees(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const submit = async () => {
    setError('');
    if (invitees.size === 0) return setError('Pick someone');
    const [y, mo, d] = date.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) return setError('Bad date');
    const startMs = Date.UTC(y, mo - 1, d, hh - TR_OFFSET, mm);
    if (startMs <= Date.now()) return setError('Past');

    setBusy(true);
    try {
      await onCreate([...invitees], startMs);
      setCreating(false);
      setInvitees(new Set());
      setTime('21:00');
      setDate(trToday());
    } catch {
      setError('Failed');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (sessionId: string, status: 'accepted' | 'rejected', reason?: string) => {
    await onRespond(sessionId, status, reason);
    setRejecting(null);
    setSebep('');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header + create toggle */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-paper">🎮 Pro</h2>
        {currentUser && (
          <button
            onClick={() => { setCreating(c => !c); setError(''); }}
            aria-label={creating ? 'Close' : 'New session'}
            className={clsx(
              'rounded border px-3 py-2 font-mono text-sm font-bold leading-none transition-colors',
              creating ? 'border-chalk text-paper/50 hover:text-paper' : 'border-gold/50 bg-gold/10 text-gold hover:bg-gold/20',
            )}
          >
            {creating ? '✕' : '+'}
          </button>
        )}
      </div>

      {/* Create form */}
      <AnimatePresence>
        {creating && currentUser && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-gold/30 bg-pitch-800 p-5 flex flex-col gap-5">
              <div className="flex flex-wrap gap-2">
                {others.length === 0 && <span className="font-mono text-xs text-paper/40">No one to invite.</span>}
                {others.map(p => {
                  const on = invitees.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleInvitee(p.id)}
                      className={clsx(
                        'flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-xs transition-all',
                        on ? 'border-gold bg-gold text-pitch-900 font-bold' : 'border-chalk text-paper/60 hover:border-gold/50',
                      )}
                    >
                      <Emoji emoji={p.avatar} /> {p.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <DatePicker value={date} min={trToday()} onChange={(v) => { setError(''); setDate(v); }} />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => { setError(''); setTime(e.target.value); }}
                  className="bg-pitch-900 border border-chalk focus:border-gold rounded px-3 py-2 font-mono text-sm text-paper focus:outline-none"
                />
                <button
                  onClick={submit}
                  disabled={busy}
                  className="ml-auto rounded bg-gold px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-pitch-900 hover:bg-paper transition-colors disabled:opacity-50"
                >
                  {busy ? '…' : 'Invite'}
                </button>
              </div>

              {error && <p className="font-mono text-[10px] uppercase tracking-widest text-signal">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions list */}
      {sorted.length === 0 ? (
        <p className="text-center py-16 font-mono text-xs uppercase tracking-widest text-paper/40">
          No sessions yet
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map(s => {
            const host = nameById.get(s.host);
            const past = s.startMs < Date.now();
            const myResponse = s.responses?.[currentUser];
            const amInvited = s.invitees?.includes(currentUser);
            const canRespond = !!currentUser && amInvited && !past;

            return (
              <div
                key={s.id}
                className={clsx(
                  'rounded-xl border bg-pitch-800 p-5',
                  past ? 'border-chalk/50 opacity-60' : 'border-chalk',
                )}
              >
                {/* host + when */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0"><Emoji emoji={host?.avatar ?? '🎮'} /></span>
                  <p className="font-serif text-lg text-paper leading-tight truncate min-w-0">
                    {host?.name ?? '?'}
                  </p>
                  <span className="ml-auto font-mono text-[11px] text-gold whitespace-nowrap shrink-0">{fmtWhen(s.startMs)}</span>
                </div>

                {/* invitees + statuses */}
                <div className="mt-4 flex flex-col gap-1.5">
                  {(s.invitees ?? []).map(id => {
                    const p = nameById.get(id);
                    const r = s.responses?.[id];
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2 font-mono text-paper/80 min-w-0">
                          <Emoji emoji={p?.avatar ?? '👤'} />
                          <span className="truncate">{p?.name ?? id}</span>
                        </span>
                        {r?.status === 'accepted' && <span className="font-mono text-emerald-400 shrink-0">✓</span>}
                        {r?.status === 'rejected' && (
                          <span className="font-mono text-signal text-right min-w-0 truncate">
                            ✗{r.sebep ? <span className="text-paper/50"> {r.sebep}</span> : null}
                          </span>
                        )}
                        {!r && <span className="font-mono text-paper/25 shrink-0">·</span>}
                      </div>
                    );
                  })}
                </div>

                {/* my response controls */}
                {canRespond && (
                  <div className="mt-4 border-t border-chalk pt-4">
                    {rejecting === s.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          maxLength={80}
                          value={sebep}
                          onChange={(e) => setSebep(e.target.value)}
                          placeholder="why?"
                          className="flex-1 min-w-0 bg-pitch-900 border-b-2 border-chalk focus:border-signal font-mono text-sm py-2 text-paper focus:outline-none transition-colors"
                        />
                        <button
                          onClick={() => sebep.trim() && respond(s.id, 'rejected', sebep.trim())}
                          disabled={!sebep.trim()}
                          aria-label="Confirm out"
                          className="rounded bg-signal px-3 py-2 font-mono text-sm font-bold leading-none text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                          ✗
                        </button>
                        <button
                          onClick={() => { setRejecting(null); setSebep(''); }}
                          aria-label="Cancel"
                          className="font-mono text-sm text-paper/40 hover:text-paper px-2"
                        >
                          ↩
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => respond(s.id, 'accepted')}
                          aria-label="In"
                          className={clsx(
                            'flex-1 rounded border py-2.5 font-mono text-base font-bold leading-none transition-colors',
                            myResponse?.status === 'accepted'
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                              : 'border-emerald-600/50 text-emerald-400 hover:bg-emerald-500/10',
                          )}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => { setRejecting(s.id); setSebep(myResponse?.sebep ?? ''); }}
                          aria-label="Out"
                          className={clsx(
                            'flex-1 rounded border py-2.5 font-mono text-base font-bold leading-none transition-colors',
                            myResponse?.status === 'rejected'
                              ? 'border-signal bg-signal/20 text-signal'
                              : 'border-signal/50 text-signal hover:bg-signal/10',
                          )}
                        >
                          ✗
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
