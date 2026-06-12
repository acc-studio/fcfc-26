// Read-only snapshot of Firestore to a timestamped local JSON file.
//
//   node --env-file=.env.local scripts/backup.mjs
//
// Spark plan has no managed export (that needs Blaze + a GCS bucket), so this
// dumps every collection via the client SDK. Reads are public, so no auth is
// needed. Output lands in ./backups/ (gitignored — it contains plaintext PINs
// and bets; never commit it). Restore is manual: re-seed matches and/or write
// the JSON back with a small script if ever needed.

import { writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('Missing Firebase config. Run with: node --env-file=.env.local scripts/backup.mjs');
  process.exit(1);
}

const COLLECTIONS = ['matches', 'bets', 'players', 'arbiters', 'config'];

const db = getFirestore(initializeApp(firebaseConfig));

const dump = { project: firebaseConfig.projectId, takenAt: new Date().toISOString(), collections: {} };
for (const name of COLLECTIONS) {
  try {
    const snap = await getDocs(collection(db, name));
    dump.collections[name] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    console.log(`${name}: ${snap.size} doc(s)`);
  } catch (e) {
    // arbiters/config may be unreadable (closed rules or absent) — skip, don't
    // lose the rest of the backup.
    dump.collections[name] = { skipped: e.code || String(e) };
    console.log(`${name}: skipped (${e.code || e})`);
  }
}

mkdirSync('backups', { recursive: true });
const stamp = dump.takenAt.replace(/[:.]/g, '-');
const file = `backups/firestore-${stamp}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`\nWrote ${file}`);
process.exit(0);
