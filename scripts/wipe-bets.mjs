// Deletes every document in the Firestore `bets` collection.
// Run: node --env-file=.env.local scripts/wipe-bets.mjs

// Deleting bets now requires arbiter rights (see firestore.rules), so this
// connects as a transient arbiter — needs ARBITER_CODE alongside the Firebase
// config in .env.local.
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { connectAsArbiter } from './connect.mjs';

const { db, cleanup } = await connectAsArbiter();
const snap = await getDocs(collection(db, 'bets'));
if (snap.empty) {
  console.log('No bets to delete.');
  await cleanup();
  process.exit(0);
}
const batch = writeBatch(db);
snap.forEach(d => batch.delete(d.ref));
await batch.commit();
console.log(`Deleted ${snap.size} bet(s).`);
await cleanup();
process.exit(0);
