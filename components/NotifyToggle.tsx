'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import {
  PushStatus, NotifyType, NotifyPrefs, NOTIFY_TYPES,
  getStatus, enablePush, disablePush, getPrefs, setPrefs,
} from '@/lib/push';

// Header bell: enable/disable web-push on this device for the logged-in player,
// and toggle individual notification types. Opens a small panel. Permission is
// requested on the Enable tap (a required user gesture). Prefs are per-device.
export const NotifyToggle = ({ currentUser }: { currentUser: string }) => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [prefs, setPrefsState] = useState<NotifyPrefs>(() => getPrefs());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Async resolve — not a synchronous setState in the effect body.
    getStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  if (status === 'unsupported') return null;

  const on = status === 'subscribed';

  const enable = async () => {
    setHint(null);
    if (status === 'needs-install') {
      setHint('On iPhone: Add FCFC to your Home Screen first, then enable alerts here.');
      return;
    }
    if (status === 'denied') {
      setHint('Notifications are blocked — re-enable them in your browser settings.');
      return;
    }
    setBusy(true);
    try {
      const next = await enablePush(currentUser);
      setStatus(next);
      if (next === 'denied') setHint('Notifications are blocked — re-enable them in your browser settings.');
      if (next === 'needs-install') setHint('On iPhone: Add FCFC to your Home Screen first, then enable alerts.');
    } catch {
      setHint('Could not enable alerts — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try { setStatus(await disablePush()); } finally { setBusy(false); }
  };

  const toggleType = (key: NotifyType) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefsState(next);
    void setPrefs(next);
  };

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => { setHint(null); setOpen((o) => !o); }}
        disabled={status === null}
        aria-label="Notification settings"
        title={on ? 'Alerts on' : 'Notifications'}
        className={clsx(
          'shrink-0 rounded border px-2.5 py-1.5 font-mono text-sm leading-none transition-colors',
          on ? 'border-gold/50 text-gold' : 'border-chalk text-paper/50 hover:border-gold/50 hover:text-paper',
          status === null && 'opacity-50',
        )}
      >
        {on ? '🔔' : '🔕'}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded border border-chalk bg-pitch-900/95 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-paper/50">Alerts</span>
            {on ? (
              <button
                type="button"
                onClick={disable}
                disabled={busy}
                className="font-mono text-[9px] uppercase tracking-widest text-paper/40 hover:text-signal transition-colors"
              >
                Turn off
              </button>
            ) : (
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="rounded bg-gold px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-pitch-900 hover:bg-gold/90 transition-colors disabled:opacity-50"
              >
                Enable
              </button>
            )}
          </div>

          <div className={clsx('flex flex-col gap-1', !on && 'opacity-50')}>
            {NOTIFY_TYPES.map(({ key, label, emoji }) => {
              const enabled = prefs[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleType(key)}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-paper/5 transition-colors"
                >
                  <span className="flex items-center gap-2 font-sans text-xs text-paper/80">
                    <span>{emoji}</span>{label}
                  </span>
                  <span
                    aria-hidden
                    className={clsx(
                      'relative h-3.5 w-6 shrink-0 rounded-full transition-colors',
                      enabled ? 'bg-gold' : 'bg-paper/20',
                    )}
                  >
                    <span className={clsx(
                      'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-pitch-900 transition-all',
                      enabled ? 'left-3' : 'left-0.5',
                    )} />
                  </span>
                </button>
              );
            })}
          </div>

          {hint && <p className="mt-2 font-mono text-[10px] leading-relaxed text-paper/60">{hint}</p>}
          {!on && !hint && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-paper/40">
              Enable alerts to receive these on this device.
            </p>
          )}
        </div>
      )}
    </span>
  );
};
