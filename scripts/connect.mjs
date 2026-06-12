// Shared connection helper for the maintenance/poller scripts.
//
// Under the tightened Firestore rules, writing matches/bets requires an authed
// caller that holds an arbiters/{uid} doc. This signs in anonymously, registers
// the process as an arbiter using ARBITER_CODE (validated server-side against
// config/arbiter), and returns a cleanup() that removes the transient doc so the
// collection doesn't accumulate one entry per run.
//
// Needs (env or --env-file=.env.local): the NEXT_PUBLIC_FIREBASE_* config and
// ARBITER_CODE (the value stored in the config/arbiter doc).

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export async function connectAsArbiter() {
  if (!firebaseConfig.projectId) {
    console.error('Missing Firebase config. Set NEXT_PUBLIC_FIREBASE_* (env or --env-file=.env.local).');
    process.exit(1);
  }
  const code = process.env.ARBITER_CODE;
  if (!code) {
    console.error('Missing ARBITER_CODE (must match the config/arbiter doc).');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'arbiters', uid), { code });

  const cleanup = async () => {
    try { await deleteDoc(doc(db, 'arbiters', uid)); } catch { /* best effort */ }
  };
  return { app, db, cleanup };
}
