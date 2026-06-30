import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Reuse the app across HMR / multiple imports instead of re-initializing.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// IndexedDB-backed offline cache. Without it, every app open (and this is a PWA
// reopened many times a day) cold-reads the whole matches/bets collections on
// each onSnapshot attach — the bulk of our Firestore read quota. With it, a
// reopen/reconnect serves from cache and only the deltas since last sync are
// billed. persistentMultipleTabManager keeps the cache coherent across tabs.
// initializeFirestore must run before any getFirestore(app); guard for HMR,
// which can re-run this module after the instance already exists.
function makeDb() {
  if (typeof window === 'undefined') return getFirestore(app); // SSR: no IndexedDB
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialized (HMR) or IndexedDB unavailable (private mode) — fall
    // back to the default/in-memory instance.
    return getFirestore(app);
  }
}

export const db = makeDb();
export const auth = getAuth(app);

// There are no accounts — everyone signs in anonymously so the Firestore rules
// can distinguish callers (and gate arbiter writes). Reads are public, so the
// app renders before this resolves; writes (picks, register, arbiter) just need
// it to have completed, which it does within a second of load. The uid persists
// per device, so arbiter status survives reloads.
if (typeof window !== 'undefined') {
  signInAnonymously(auth).catch((e) => console.error('Anonymous sign-in failed', e));
}
