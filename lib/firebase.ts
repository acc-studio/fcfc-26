import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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

export const db = getFirestore(app);
export const auth = getAuth(app);

// There are no accounts — everyone signs in anonymously so the Firestore rules
// can distinguish callers (and gate arbiter writes). Reads are public, so the
// app renders before this resolves; writes (picks, register, arbiter) just need
// it to have completed, which it does within a second of load. The uid persists
// per device, so arbiter status survives reloads.
if (typeof window !== 'undefined') {
  signInAnonymously(auth).catch((e) => console.error('Anonymous sign-in failed', e));
}
