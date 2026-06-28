// Seeds the 32 knockout-stage fixtures (matches 73–104: Round of 32 → Final)
// of the 2026 World Cup into the `matches` collection.
//
// Run ONCE, after the group stage exists:
//   node --env-file=.env.local scripts/seed-knockout.mjs
//
// IMPORTANT: this writes ONLY ids 73–104, so it never touches the 72 finished
// group docs. (Re-running the full scripts/seed.mjs WOULD wipe entered results —
// don't. This script is the safe way to add the bracket.) Idempotent on 73–104:
// re-running resets those to UPCOMING with placeholder teams, so don't re-run
// once knockout results are in.
//
// Teams start as human slot labels ("Winner A", "Runner-up B", "3rd C/D/F/G/H",
// "Winner M73", "Loser M101"). They are NOT real team names, so the app treats
// the slot as not-yet-bettable until the live poller (scripts/poll.mjs) fills in
// the real qualifiers as each round resolves — it matches a knockout slot to the
// ESPN fixture by kickoff time and overwrites home/away.
//
// Kickoff sources are the official schedule in each venue's local time; we store
// Turkey time (UTC+3) like the group seed, with the per-match UTC offset applied.
import { writeBatch, doc } from 'firebase/firestore';
import { connectAsArbiter } from './connect.mjs';

// [id, stage, homeSlot, awaySlot, date, localTime(24h), utcOffset, stadium, city]
const FIXTURES = [
  // Round of 32
  [73, 'R32', 'Runner-up A', 'Runner-up B', 'Jun 28', '12:00', -7, 'SoFi Stadium', 'Los Angeles'],
  [74, 'R32', 'Winner E', '3rd C/D/F/G/H', 'Jun 29', '16:30', -4, 'Gillette Stadium', 'Boston'],
  [75, 'R32', 'Winner F', 'Runner-up C', 'Jun 29', '19:00', -6, 'Estadio BBVA', 'Monterrey'],
  [76, 'R32', 'Winner C', 'Runner-up F', 'Jun 29', '12:00', -5, 'NRG Stadium', 'Houston'],
  [77, 'R32', 'Winner I', '3rd C/D/F/G/H', 'Jun 30', '17:00', -4, 'MetLife Stadium', 'New York/New Jersey'],
  [78, 'R32', 'Runner-up E', 'Runner-up I', 'Jun 30', '12:00', -5, 'AT&T Stadium', 'Dallas'],
  [79, 'R32', 'Winner A', '3rd C/E/F/H/I', 'Jun 30', '19:00', -6, 'Estadio Azteca', 'Mexico City'],
  [80, 'R32', 'Winner L', '3rd E/H/I/J/K', 'Jul 1', '12:00', -4, 'Mercedes-Benz Stadium', 'Atlanta'],
  [81, 'R32', 'Winner D', '3rd B/E/F/I/J', 'Jul 1', '17:00', -7, "Levi's Stadium", 'San Francisco Bay Area'],
  [82, 'R32', 'Winner G', '3rd A/E/H/I/J', 'Jul 1', '13:00', -7, 'Lumen Field', 'Seattle'],
  [83, 'R32', 'Runner-up K', 'Runner-up L', 'Jul 2', '19:00', -4, 'BMO Field', 'Toronto'],
  [84, 'R32', 'Winner H', 'Runner-up J', 'Jul 2', '12:00', -7, 'SoFi Stadium', 'Los Angeles'],
  [85, 'R32', 'Winner B', '3rd E/F/G/I/J', 'Jul 2', '20:00', -7, 'BC Place', 'Vancouver'],
  [86, 'R32', 'Winner J', 'Runner-up H', 'Jul 3', '18:00', -4, 'Hard Rock Stadium', 'Miami'],
  [87, 'R32', 'Winner K', '3rd D/E/I/J/L', 'Jul 3', '20:30', -5, 'Arrowhead Stadium', 'Kansas City'],
  [88, 'R32', 'Runner-up D', 'Runner-up G', 'Jul 3', '13:00', -5, 'AT&T Stadium', 'Dallas'],
  // Round of 16
  [89, 'R16', 'Winner M74', 'Winner M77', 'Jul 4', '17:00', -4, 'Lincoln Financial Field', 'Philadelphia'],
  [90, 'R16', 'Winner M73', 'Winner M75', 'Jul 4', '12:00', -5, 'NRG Stadium', 'Houston'],
  [91, 'R16', 'Winner M76', 'Winner M78', 'Jul 5', '16:00', -4, 'MetLife Stadium', 'New York/New Jersey'],
  [92, 'R16', 'Winner M79', 'Winner M80', 'Jul 5', '18:00', -6, 'Estadio Azteca', 'Mexico City'],
  [93, 'R16', 'Winner M83', 'Winner M84', 'Jul 6', '14:00', -5, 'AT&T Stadium', 'Dallas'],
  [94, 'R16', 'Winner M81', 'Winner M82', 'Jul 6', '17:00', -7, 'Lumen Field', 'Seattle'],
  [95, 'R16', 'Winner M86', 'Winner M88', 'Jul 7', '12:00', -4, 'Mercedes-Benz Stadium', 'Atlanta'],
  [96, 'R16', 'Winner M85', 'Winner M87', 'Jul 7', '13:00', -7, 'BC Place', 'Vancouver'],
  // Quarter-finals
  [97, 'QF', 'Winner M89', 'Winner M90', 'Jul 9', '16:00', -4, 'Gillette Stadium', 'Boston'],
  [98, 'QF', 'Winner M93', 'Winner M94', 'Jul 10', '12:00', -7, 'SoFi Stadium', 'Los Angeles'],
  [99, 'QF', 'Winner M91', 'Winner M92', 'Jul 11', '17:00', -4, 'Hard Rock Stadium', 'Miami'],
  [100, 'QF', 'Winner M95', 'Winner M96', 'Jul 11', '20:00', -5, 'Arrowhead Stadium', 'Kansas City'],
  // Semi-finals
  [101, 'SF', 'Winner M97', 'Winner M98', 'Jul 14', '14:00', -5, 'AT&T Stadium', 'Dallas'],
  [102, 'SF', 'Winner M99', 'Winner M100', 'Jul 15', '15:00', -4, 'Mercedes-Benz Stadium', 'Atlanta'],
  // Third place + Final
  [103, 'THIRD', 'Loser M101', 'Loser M102', 'Jul 18', '17:00', -4, 'Hard Rock Stadium', 'Miami'],
  [104, 'FINAL', 'Winner M101', 'Winner M102', 'Jul 19', '15:00', -4, 'MetLife Stadium', 'New York/New Jersey'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [m, i]));

// Convert a venue-local kickoff ("Jul 1", "17:00", offset -7) to Turkey time
// (UTC+3), rolling the date if it crosses midnight. UTC = local - offset.
function toTurkey(date, time, offset) {
  const [mon, dayS] = date.split(' ');
  const [h, m] = time.split(':').map(Number);
  const tr = new Date(Date.UTC(2026, MONTH_INDEX[mon], Number(dayS), h - offset, m) + 3 * 3600 * 1000);
  const hh = String(tr.getUTCHours()).padStart(2, '0');
  const mm = String(tr.getUTCMinutes()).padStart(2, '0');
  return { date: `${MONTHS[tr.getUTCMonth()]} ${tr.getUTCDate()}`, time: `${hh}:${mm}` };
}

async function main() {
  const { db, cleanup } = await connectAsArbiter();

  const batch = writeBatch(db);
  for (const [id, stage, home, away, date, time, offset, stadium, city] of FIXTURES) {
    const tr = toTurkey(date, time, offset);
    batch.set(doc(db, 'matches', String(id)), {
      id,
      home,
      away,
      date: tr.date,
      time: tr.time,
      stadium: `${stadium}, ${city}`,
      status: 'UPCOMING',
      stage,
    });
  }
  await batch.commit();
  console.log(`Seeded ${FIXTURES.length} knockout matches (73–104) into Firestore (Turkey time).`);
  await cleanup();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
