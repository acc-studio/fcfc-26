// Seeds the `matches` collection in Firestore with the 2026 World Cup
// group-stage schedule (72 matches; final draw Dec 5 2025).
//
// Run once, after filling NEXT_PUBLIC_FIREBASE_* in .env.local:
//   node --env-file=.env.local scripts/seed.mjs
//
// Idempotent: doc id = match id, so re-running overwrites (and resets status
// to UPCOMING / clears results). Safe to re-run before the tournament starts;
// do NOT re-run once real results have been entered or you'll wipe them.
//
// The FIXTURES array below stores the source times in US Eastern (ET, = UTC-4
// in June) as published by the schedule sources. They are converted to Turkey
// time (TRT, UTC+3 — i.e. ET + 7h, rolling the date when it crosses midnight)
// before writing, since that's what the players read. Times are display only;
// betting does not depend on them.

import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.projectId) {
  console.error('Missing Firebase config. Run with: node --env-file=.env.local scripts/seed.mjs');
  process.exit(1);
}

// [id, home, away, date, time(ET), stadium, city]
const FIXTURES = [
  // Matchday 1
  [1, 'Mexico', 'South Africa', 'Jun 11', '3:00 PM ET', 'Estadio Azteca', 'Mexico City'],
  [2, 'South Korea', 'Czechia', 'Jun 11', '10:00 PM ET', 'Estadio Akron', 'Guadalajara'],
  [3, 'Canada', 'Bosnia and Herzegovina', 'Jun 12', '3:00 PM ET', 'BMO Field', 'Toronto'],
  [4, 'USA', 'Paraguay', 'Jun 12', '9:00 PM ET', 'SoFi Stadium', 'Los Angeles'],
  [5, 'Qatar', 'Switzerland', 'Jun 13', '3:00 PM ET', "Levi's Stadium", 'San Francisco Bay Area'],
  [6, 'Brazil', 'Morocco', 'Jun 13', '6:00 PM ET', 'MetLife Stadium', 'New York/New Jersey'],
  [7, 'Haiti', 'Scotland', 'Jun 13', '9:00 PM ET', 'Gillette Stadium', 'Boston'],
  [8, 'Australia', 'Türkiye', 'Jun 14', '12:00 AM ET', 'BC Place', 'Vancouver'],
  [9, 'Germany', 'Curaçao', 'Jun 14', '1:00 PM ET', 'NRG Stadium', 'Houston'],
  [10, 'Netherlands', 'Japan', 'Jun 14', '4:00 PM ET', 'AT&T Stadium', 'Dallas'],
  [11, 'Ivory Coast', 'Ecuador', 'Jun 14', '7:00 PM ET', 'Lincoln Financial Field', 'Philadelphia'],
  [12, 'Sweden', 'Tunisia', 'Jun 14', '10:00 PM ET', 'Estadio BBVA', 'Monterrey'],
  [13, 'Spain', 'Cape Verde', 'Jun 15', '12:00 PM ET', 'Mercedes-Benz Stadium', 'Atlanta'],
  [14, 'Belgium', 'Egypt', 'Jun 15', '3:00 PM ET', 'Lumen Field', 'Seattle'],
  [15, 'Saudi Arabia', 'Uruguay', 'Jun 15', '6:00 PM ET', 'Hard Rock Stadium', 'Miami'],
  [16, 'Iran', 'New Zealand', 'Jun 15', '9:00 PM ET', 'SoFi Stadium', 'Los Angeles'],
  [17, 'France', 'Senegal', 'Jun 16', '3:00 PM ET', 'MetLife Stadium', 'New York/New Jersey'],
  [18, 'Iraq', 'Norway', 'Jun 16', '6:00 PM ET', 'Gillette Stadium', 'Boston'],
  [19, 'Argentina', 'Algeria', 'Jun 16', '9:00 PM ET', 'Arrowhead Stadium', 'Kansas City'],
  [20, 'Austria', 'Jordan', 'Jun 17', '12:00 AM ET', "Levi's Stadium", 'San Francisco Bay Area'],
  [21, 'Portugal', 'DR Congo', 'Jun 17', '1:00 PM ET', 'NRG Stadium', 'Houston'],
  [22, 'England', 'Croatia', 'Jun 17', '4:00 PM ET', 'AT&T Stadium', 'Dallas'],
  [23, 'Ghana', 'Panama', 'Jun 17', '7:00 PM ET', 'BMO Field', 'Toronto'],
  [24, 'Uzbekistan', 'Colombia', 'Jun 17', '10:00 PM ET', 'Estadio Azteca', 'Mexico City'],
  // Matchday 2
  [25, 'Czechia', 'South Africa', 'Jun 18', '12:00 PM ET', 'Mercedes-Benz Stadium', 'Atlanta'],
  [26, 'Switzerland', 'Bosnia and Herzegovina', 'Jun 18', '3:00 PM ET', 'SoFi Stadium', 'Los Angeles'],
  [27, 'Canada', 'Qatar', 'Jun 18', '6:00 PM ET', 'BC Place', 'Vancouver'],
  [28, 'Mexico', 'South Korea', 'Jun 18', '9:00 PM ET', 'Estadio Akron', 'Guadalajara'],
  [29, 'USA', 'Australia', 'Jun 19', '3:00 PM ET', 'Lumen Field', 'Seattle'],
  [30, 'Scotland', 'Morocco', 'Jun 19', '6:00 PM ET', 'Gillette Stadium', 'Boston'],
  [31, 'Brazil', 'Haiti', 'Jun 19', '8:30 PM ET', 'Lincoln Financial Field', 'Philadelphia'],
  [32, 'Türkiye', 'Paraguay', 'Jun 20', '12:00 AM ET', "Levi's Stadium", 'San Francisco Bay Area'],
  [33, 'Netherlands', 'Sweden', 'Jun 20', '1:00 PM ET', 'NRG Stadium', 'Houston'],
  [34, 'Germany', 'Ivory Coast', 'Jun 20', '4:00 PM ET', 'BMO Field', 'Toronto'],
  [35, 'Ecuador', 'Curaçao', 'Jun 20', '8:00 PM ET', 'Arrowhead Stadium', 'Kansas City'],
  [36, 'Tunisia', 'Japan', 'Jun 21', '12:00 AM ET', 'Estadio BBVA', 'Monterrey'],
  [37, 'Spain', 'Saudi Arabia', 'Jun 21', '12:00 PM ET', 'Mercedes-Benz Stadium', 'Atlanta'],
  [38, 'Belgium', 'Iran', 'Jun 21', '3:00 PM ET', 'SoFi Stadium', 'Los Angeles'],
  [39, 'Uruguay', 'Cape Verde', 'Jun 21', '6:00 PM ET', 'Hard Rock Stadium', 'Miami'],
  [40, 'New Zealand', 'Egypt', 'Jun 21', '9:00 PM ET', 'BC Place', 'Vancouver'],
  [41, 'Argentina', 'Austria', 'Jun 22', '1:00 PM ET', 'AT&T Stadium', 'Dallas'],
  [42, 'France', 'Iraq', 'Jun 22', '5:00 PM ET', 'Lincoln Financial Field', 'Philadelphia'],
  [43, 'Norway', 'Senegal', 'Jun 22', '8:00 PM ET', 'MetLife Stadium', 'New York/New Jersey'],
  [44, 'Jordan', 'Algeria', 'Jun 22', '11:00 PM ET', "Levi's Stadium", 'San Francisco Bay Area'],
  [45, 'Portugal', 'Uzbekistan', 'Jun 23', '1:00 PM ET', 'NRG Stadium', 'Houston'],
  [46, 'England', 'Ghana', 'Jun 23', '4:00 PM ET', 'Gillette Stadium', 'Boston'],
  [47, 'Panama', 'Croatia', 'Jun 23', '7:00 PM ET', 'BMO Field', 'Toronto'],
  [48, 'Colombia', 'DR Congo', 'Jun 23', '10:00 PM ET', 'Estadio Akron', 'Guadalajara'],
  // Matchday 3 (simultaneous kickoffs per group)
  [49, 'Switzerland', 'Canada', 'Jun 24', '3:00 PM ET', 'BC Place', 'Vancouver'],
  [50, 'Bosnia and Herzegovina', 'Qatar', 'Jun 24', '3:00 PM ET', 'Lumen Field', 'Seattle'],
  [51, 'Scotland', 'Brazil', 'Jun 24', '6:00 PM ET', 'Hard Rock Stadium', 'Miami'],
  [52, 'Morocco', 'Haiti', 'Jun 24', '6:00 PM ET', 'Mercedes-Benz Stadium', 'Atlanta'],
  [53, 'Czechia', 'Mexico', 'Jun 24', '9:00 PM ET', 'Estadio Azteca', 'Mexico City'],
  [54, 'South Africa', 'South Korea', 'Jun 24', '9:00 PM ET', 'Estadio BBVA', 'Monterrey'],
  [55, 'Curaçao', 'Ivory Coast', 'Jun 25', '4:00 PM ET', 'Lincoln Financial Field', 'Philadelphia'],
  [56, 'Ecuador', 'Germany', 'Jun 25', '4:00 PM ET', 'MetLife Stadium', 'New York/New Jersey'],
  [57, 'Japan', 'Sweden', 'Jun 25', '7:00 PM ET', 'AT&T Stadium', 'Dallas'],
  [58, 'Tunisia', 'Netherlands', 'Jun 25', '7:00 PM ET', 'Arrowhead Stadium', 'Kansas City'],
  [59, 'Türkiye', 'USA', 'Jun 25', '10:00 PM ET', 'SoFi Stadium', 'Los Angeles'],
  [60, 'Paraguay', 'Australia', 'Jun 25', '10:00 PM ET', "Levi's Stadium", 'San Francisco Bay Area'],
  [61, 'Norway', 'France', 'Jun 26', '3:00 PM ET', 'Gillette Stadium', 'Boston'],
  [62, 'Senegal', 'Iraq', 'Jun 26', '3:00 PM ET', 'BMO Field', 'Toronto'],
  [63, 'Cape Verde', 'Saudi Arabia', 'Jun 26', '8:00 PM ET', 'NRG Stadium', 'Houston'],
  [64, 'Uruguay', 'Spain', 'Jun 26', '8:00 PM ET', 'Estadio Akron', 'Guadalajara'],
  [65, 'Egypt', 'Iran', 'Jun 26', '11:00 PM ET', 'Lumen Field', 'Seattle'],
  [66, 'New Zealand', 'Belgium', 'Jun 26', '11:00 PM ET', 'BC Place', 'Vancouver'],
  [67, 'Panama', 'England', 'Jun 27', '5:00 PM ET', 'MetLife Stadium', 'New York/New Jersey'],
  [68, 'Croatia', 'Ghana', 'Jun 27', '5:00 PM ET', 'Lincoln Financial Field', 'Philadelphia'],
  [69, 'Colombia', 'Portugal', 'Jun 27', '7:30 PM ET', 'Hard Rock Stadium', 'Miami'],
  [70, 'DR Congo', 'Uzbekistan', 'Jun 27', '7:30 PM ET', 'Mercedes-Benz Stadium', 'Atlanta'],
  [71, 'Algeria', 'Austria', 'Jun 27', '10:00 PM ET', 'Arrowhead Stadium', 'Kansas City'],
  [72, 'Jordan', 'Argentina', 'Jun 27', '10:00 PM ET', 'AT&T Stadium', 'Dallas'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Convert an ET ("Jun 11", "3:00 PM ET") fixture to Turkey time (UTC+3).
function toTurkey(date, time) {
  const day = parseInt(date.split(' ')[1], 10);
  const m = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let hour = parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) hour += 12;
  const min = parseInt(m[2], 10);
  // ET (UTC-4 in June) -> UTC, then UTC -> Turkey (UTC+3).
  const tr = new Date(Date.UTC(2026, 5, day, hour + 4, min) + 3 * 3600 * 1000);
  const hh = String(tr.getUTCHours()).padStart(2, '0');
  const mm = String(tr.getUTCMinutes()).padStart(2, '0');
  return { date: `${MONTHS[tr.getUTCMonth()]} ${tr.getUTCDate()}`, time: `${hh}:${mm}` };
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const batch = writeBatch(db);
  for (const [id, home, away, date, time, stadium, city] of FIXTURES) {
    const tr = toTurkey(date, time);
    batch.set(doc(db, 'matches', String(id)), {
      id,
      home,
      away,
      date: tr.date,
      time: tr.time,
      stadium: `${stadium}, ${city}`,
      status: 'UPCOMING',
    });
  }
  await batch.commit();
  console.log(`Seeded ${FIXTURES.length} matches into Firestore (Turkey time).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
