// Deletes every document in the Firestore `bets` collection.
// Run: node --env-file=.env.local scripts/wipe-bets.mjs

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('Missing Firebase config. Run with: node --env-file=.env.local scripts/wipe-bets.mjs');
  process.exit(1);
}

const db = getFirestore(initializeApp(firebaseConfig));
const snap = await getDocs(collection(db, 'bets'));
if (snap.empty) {
  console.log('No bets to delete.');
  process.exit(0);
}
const batch = writeBatch(db);
snap.forEach(d => batch.delete(d.ref));
await batch.commit();
console.log(`Deleted ${snap.size} bet(s).`);
process.exit(0);
