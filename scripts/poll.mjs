// Live results poller for FCFC '26.
//
// Pulls the (unofficial, undocumented) ESPN World Cup scoreboard and writes
// live scores, the running clock, goalscorers/red cards, and final results
// into the `matches` collection. The app's onSnapshot listeners stream those
// straight to every device, so this is the only moving part needed for live
// scores. Auto-finalizing (status -> FINISHED + scores) is what drives the
// existing scoring/leaderboard; the manual arbiter stays as a fallback and an
// override for anything the feed gets wrong or doesn't cover.
//
// Run locally:   node --env-file=.env.local scripts/poll.mjs
// In CI it runs every ~5 min from .github/workflows/poll-results.yml.
//
// Writes go through the client SDK as a transient arbiter (see connect.mjs) —
// same public NEXT_PUBLIC_FIREBASE_* config as the app plus ARBITER_CODE, no
// service account. Caveat: the ESPN feed is unofficial and can change shape or
// 404 without notice. The script logs any team it can't map so aliases can be
// patched mid-tournament; it never throws on a single bad match.

import { collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { connectAsArbiter } from './connect.mjs';

// No arg -> today's scoreboard (the cron's normal mode). Pass a date to backfill
// past games' scores/scorers, e.g. `node scripts/poll.mjs 20260611` or a range
// `20260611-20260612` (ESPN uses YYYYMMDD). Finished games whose events were
// never captured (e.g. finalized manually before the poller existed) get filled.
const dateArg = process.argv[2];
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'
  + (dateArg ? `?dates=${dateArg}` : '');

// ESPN's display name -> our canonical team name (the names used in the seed /
// TEAM_ISO). Only the ones that differ after normalization need an entry; the
// normalizer below already handles accents, punctuation, "and", and spacing.
const ALIASES = {
  'United States': 'USA',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Turkey': 'Türkiye',
  'Czech Republic': 'Czechia',
  'Korea Republic': 'South Korea',
  'Korea, Republic of': 'South Korea',
  "Côte d'Ivoire": 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Congo DR': 'DR Congo',
  'Cape Verde Islands': 'Cape Verde',
};

// Collapse a team name to a comparison key: lowercase, strip accents, drop the
// word "and"/"&", remove all non-alphanumerics. "Bosnia and Herzegovina" and
// ESPN's "Bosnia-Herzegovina" both become "bosniaherzegovina".
function norm(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

const pairKey = (a, b) => [norm(a), norm(b)].sort().join('|');
const canonical = (espnName) => ALIASES[espnName] ?? espnName;

function eventKind(d) {
  if (d.ownGoal) return 'own-goal';
  if (d.redCard) return 'red';
  if (d.scoringPlay) return d.penaltyKick ? 'penalty' : 'goal';
  return null; // ignore yellows, subs, VAR, etc.
}

async function main() {
  const res = await fetch(ESPN_URL, { headers: { 'User-Agent': 'fcfc26-poller' } });
  if (!res.ok) throw new Error(`ESPN feed HTTP ${res.status}`);
  const feed = await res.json();
  const games = feed.events || [];

  const { db, cleanup } = await connectAsArbiter();

  // Index our fixtures by the unordered normalized team pair.
  const snap = await getDocs(collection(db, 'matches'));
  const byPair = new Map();
  snap.forEach((d) => {
    const m = d.data();
    byPair.set(pairKey(m.home, m.away), m);
  });

  let updated = 0, live = 0, finalized = 0;
  const unmatched = [];

  for (const g of games) {
    const state = g.status?.type?.state; // 'pre' | 'in' | 'post'
    if (state !== 'in' && state !== 'post') continue; // skip not-yet-started

    const comp = g.competitions?.[0];
    const competitors = comp?.competitors || [];
    if (competitors.length !== 2) continue;

    const match = byPair.get(pairKey(
      canonical(competitors[0].team?.displayName),
      canonical(competitors[1].team?.displayName),
    ));
    if (!match) {
      unmatched.push(competitors.map(c => c.team?.displayName).join(' v '));
      continue;
    }

    // Which ESPN competitor is OUR home side? Map by team id for events too.
    const sideByTeamId = {};
    let result_home = 0, result_away = 0;
    for (const c of competitors) {
      const isHome = norm(canonical(c.team?.displayName)) === norm(match.home);
      sideByTeamId[c.team?.id] = isHome ? 'HOME' : 'AWAY';
      const score = Number(c.score) || 0;
      if (isHome) result_home = score; else result_away = score;
    }

    const events = (comp.details || [])
      .map((d) => {
        const kind = eventKind(d);
        const side = sideByTeamId[d.team?.id];
        if (!kind || !side) return null;
        const ath = d.athletesInvolved?.[0];
        return {
          minute: d.clock?.displayValue || '',
          player: ath?.displayName || ath?.shortName || 'Unknown',
          team: side,
          kind,
        };
      })
      .filter(Boolean);

    const isFinal = state === 'post';
    const minute = (g.status?.type?.shortDetail || g.status?.displayClock || '').trim();

    // Skip the write if nothing actually changed (saves Firestore quota).
    const same =
      match.status === (isFinal ? 'FINISHED' : 'LIVE') &&
      match.result_home === result_home &&
      match.result_away === result_away &&
      JSON.stringify(match.events || []) === JSON.stringify(events) &&
      (isFinal ? match.minute === undefined : match.minute === minute);
    if (same) continue;

    const payload = {
      status: isFinal ? 'FINISHED' : 'LIVE',
      result_home,
      result_away,
      events,
      minute: isFinal ? deleteField() : minute,
    };
    await updateDoc(doc(db, 'matches', String(match.id)), payload);
    updated++;
    if (isFinal) finalized++; else live++;
    console.log(`#${match.id} ${match.home} ${result_home}-${result_away} ${match.away} [${isFinal ? 'FINAL' : minute}] (${events.length} ev)`);
  }

  if (unmatched.length) {
    console.warn(`Unmatched (add to ALIASES): ${unmatched.join(', ')}`);
  }
  console.log(`Done. ${updated} updated (${live} live, ${finalized} finalized) of ${games.length} feed games.`);
  await cleanup();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
