// Client-side web-push subscription handling. Registers the service worker
// (public/sw.js), requests permission, subscribes with the VAPID public key, and
// stores the subscription in Firestore (`pushSubs/{endpointHash}`) tagged with
// the logged-in player id. The sender (scripts/notify.ts) reads those and pushes.
import { auth, db } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushStatus =
  | 'unsupported'    // browser has no Push API
  | 'needs-install'  // iOS Safari: must Add to Home Screen first
  | 'default'        // supported, not yet subscribed
  | 'denied'         // permission blocked
  | 'subscribed';    // this device is subscribed

// Per-type notification preferences. Stored per-device: localStorage drives the
// UI (pushSubs isn't client-readable), and the same prefs are written into this
// device's pushSubs doc so the sender (scripts/notify.ts) can filter by type.
export type NotifyType = 'result' | 'goals' | 'knockout' | 'closing' | 'table' | 'titles' | 'pro';
export type NotifyPrefs = Record<NotifyType, boolean>;

export const NOTIFY_TYPES: { key: NotifyType; label: string; emoji: string }[] = [
  { key: 'result', label: 'Match results', emoji: '🏁' },
  { key: 'goals', label: 'Goals & red cards', emoji: '⚽' },
  { key: 'knockout', label: 'Knockout unlocks', emoji: '🗝️' },
  { key: 'closing', label: 'Bet reminders', emoji: '⏰' },
  { key: 'table', label: 'Table moves', emoji: '📈' },
  { key: 'titles', label: 'New titles', emoji: '🏅' },
  { key: 'pro', label: 'Pro sessions', emoji: '🎮' },
];

const PREFS_KEY = 'pitch_notify_prefs';

export function getPrefs(): NotifyPrefs {
  const def = Object.fromEntries(NOTIFY_TYPES.map(t => [t.key, true])) as NotifyPrefs;
  if (typeof localStorage === 'undefined') return def;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return def;
}

// Persist prefs locally and, if this device is subscribed, into its pushSubs doc
// (merge — leaves user_id/subscription intact) so the sender honours them.
export async function setPrefs(prefs: NotifyPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await setDoc(doc(db, 'pushSubs', endpointId(sub.endpoint)), { prefs }, { merge: true });
  } catch { /* best effort */ }
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    // iPadOS reports as desktop Safari but has touch.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Stable, filesystem-safe doc id from the (long, URL-shaped) push endpoint, so a
// device re-subscribing upserts its own doc instead of piling up duplicates.
function endpointId(endpoint: string): string {
  let h = 5381;
  for (let i = 0; i < endpoint.length; i++) h = ((h << 5) + h + endpoint.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  // Allocate an explicit ArrayBuffer (not ArrayBufferLike) so the result is a
  // valid BufferSource for applicationServerKey under strict lib.dom typing.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && Notification.permission === 'granted') return 'subscribed';
  } catch { /* fall through */ }
  return 'default';
}

export async function enablePush(playerId: string): Promise<PushStatus> {
  if (!isPushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (!VAPID_PUBLIC_KEY) throw new Error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';

  // Writing pushSubs requires an authed (anon) session, same as bets.
  if (!auth.currentUser) await signInAnonymously(auth);

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  await setDoc(doc(db, 'pushSubs', endpointId(sub.endpoint)), {
    user_id: playerId,
    subscription: sub.toJSON(),
    prefs: getPrefs(),
    updatedAt: new Date().toISOString(),
  });
  return 'subscribed';
}

export async function disablePush(): Promise<PushStatus> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      try { await deleteDoc(doc(db, 'pushSubs', endpointId(sub.endpoint))); } catch { /* best effort */ }
      await sub.unsubscribe();
    }
  } catch { /* best effort */ }
  return 'default';
}
