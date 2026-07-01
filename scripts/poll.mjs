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

import { collection, getDocs, doc, updateDoc, deleteField, query, where } from 'firebase/firestore';
import { writeFileSync } from 'node:fs';
import { connectAsArbiter } from './connect.mjs';

// Hand-off file the notify step reads (same CI job/workspace) so it doesn't have
// to re-scan the matches collection. Overridable for local runs.
const NOTIFY_HANDOFF = process.env.NOTIFY_HANDOFF || 'notify-matches.json';

// No arg -> a rolling window from yesterday to +5 days (the cron's normal mode).
// The look-ahead matters for the knockout bracket-fill: ESPN lists a fixture's
// teams as soon as the feeding round finishes, so polling a few days ahead fills
// our slots with the real qualifiers *before* they enter the 48h betting window
// (the bare scoreboard only returns today, which would be too late to bet).
//
// The window starts one day *before* today (UTC) on purpose: ESPN buckets a game
// under its US Eastern (UTC-4/-5) calendar date, but our dates and stored
// kickoffs are UTC/Turkey-time. An early-morning-Turkey kickoff (e.g. a 4am
// Türkiye = 1am UTC match) lands late the previous evening Eastern, so ESPN files
// it under the prior day — a window that began at today-UTC would miss it and the
// game would never propagate. Re-scanning yesterday is safe on the rolling cron
// because it queries only non-FINISHED matches (see `scopedToLive`), so an
// already-finalized past game isn't in `byPair`/`koSlots` and can't be clobbered.
// Pass an explicit date/range to backfill past games, e.g. `node scripts/poll.mjs
// 20260611` or `20260611-20260612` (ESPN uses YYYYMMDD); one request covers it.
const dateArg = process.argv[2];
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};
const DAY = 86400000;
const dates = dateArg || `${ymd(Date.now() - DAY)}-${ymd(Date.now() + 5 * DAY)}`;
const ESPN_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dates}`;

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

const MONTH_INDEX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// Kickoff as UTC ms from our stored Turkey-time (UTC+3) strings — mirrors
// lib/data.kickoffMs. Used to match a knockout fixture to its bracket slot.
function kickoffMs(m) {
  const [mon, day] = String(m.date).split(' ');
  const [hh, mm] = String(m.time).split(':').map(Number);
  return Date.UTC(2026, MONTH_INDEX[mon] ?? 0, Number(day), hh - 3, mm);
}
const isKnockout = (m) => m.stage && m.stage !== 'GROUP';

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

  // Index our fixtures by the unordered normalized team pair; keep the knockout
  // slots aside for the bracket-fill pass below. The rolling cron skips FINISHED
  // matches — it never rewrites them anyway, and the notify step reuses this set
  // (see the hand-off file at the end) — which shrinks the read every cycle as
  // the tournament progresses. An explicit backfill (date arg) reads the full
  // set so it can still re-finalize/correct an already-finished match.
  const scopedToLive = !dateArg;
  const snap = await getDocs(
    scopedToLive ? query(collection(db, 'matches'), where('status', '!=', 'FINISHED')) : collection(db, 'matches'),
  );
  const byPair = new Map();
  const koSlots = [];
  const liveMatches = [];
  snap.forEach((d) => {
    const m = d.data();
    liveMatches.push(m);
    byPair.set(pairKey(m.home, m.away), m);
    if (isKnockout(m)) koSlots.push(m);
  });

  let updated = 0, live = 0, finalized = 0;
  const unmatched = [];

  // --- Bracket-fill pass: as ESPN schedules each knockout fixture, write the
  // real qualifiers into our slot (which starts as a placeholder label). Match a
  // game to a slot by kickoff time (the schedules share a source, so they line
  // up to the minute); adopt ESPN's home/away orientation. Runs for any game
  // state — teams are known once the fixture appears, before kickoff.
  for (const g of games) {
    const competitors = g.competitions?.[0]?.competitors || [];
    if (competitors.length !== 2) continue;
    const startMs = Date.parse(g.date);
    if (Number.isNaN(startMs)) continue;

    let slot = null, best = 2 * 60 * 60 * 1000; // 2h tolerance, nearest wins
    for (const m of koSlots) {
      const dt = Math.abs(kickoffMs(m) - startMs);
      if (dt <= best) { best = dt; slot = m; }
    }
    if (!slot) continue;

    const homeC = competitors.find(c => c.homeAway === 'home') || competitors[0];
    const awayC = competitors.find(c => c.homeAway === 'away') || competitors[1];
    const home = canonical(homeC.team?.displayName);
    const away = canonical(awayC.team?.displayName);
    if (!home || !away) continue;
    if (norm(home) === norm(slot.home) && norm(away) === norm(slot.away)) continue; // already set

    await updateDoc(doc(db, 'matches', String(slot.id)), { home, away });
    console.log(`#${slot.id} ${slot.stage} ${slot.home} v ${slot.away} -> ${home} v ${away}`);
    byPair.delete(pairKey(slot.home, slot.away));
    slot.home = home; slot.away = away;
    byPair.set(pairKey(home, away), slot);
    updated++;
  }

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

    // Knockout final: capture who advanced (survives ET/penalties; ESPN flags
    // the winner) plus the shootout tally/takers when the match went to spot
    // kicks. This — not the level scoreline — is what the app scores.
    let advance, shootout;
    if (isKnockout(match) && isFinal) {
      const winC = competitors.find(c => c.winner === true);
      if (winC) advance = sideByTeamId[winC.team?.id];
      if (competitors.some(c => c.shootoutScore != null)) {
        let sh = 0, sa = 0;
        for (const c of competitors) {
          const v = Number(c.shootoutScore) || 0;
          if (sideByTeamId[c.team?.id] === 'HOME') sh = v; else sa = v;
        }
        const takers = (comp.details || [])
          .filter((d) => d.shootout)
          .map((d) => {
            const side = sideByTeamId[d.team?.id];
            if (!side) return null;
            const ath = d.athletesInvolved?.[0];
            return { player: ath?.displayName || ath?.shortName || 'Unknown', team: side, scored: !!d.scoringPlay };
          })
          .filter(Boolean);
        shootout = takers.length ? { home: sh, away: sa, takers } : { home: sh, away: sa };
      }
    }

    // Skip the write if nothing actually changed (saves Firestore quota).
    const koUnchanged = !(isKnockout(match) && isFinal)
      || ((match.advance ?? null) === (advance ?? null)
        && JSON.stringify(match.shootout ?? null) === JSON.stringify(shootout ?? null));
    const same =
      match.status === (isFinal ? 'FINISHED' : 'LIVE') &&
      match.result_home === result_home &&
      match.result_away === result_away &&
      JSON.stringify(match.events || []) === JSON.stringify(events) &&
      (isFinal ? match.minute === undefined : match.minute === minute) &&
      koUnchanged;
    if (same) continue;

    const payload = {
      status: isFinal ? 'FINISHED' : 'LIVE',
      result_home,
      result_away,
      events,
      minute: isFinal ? deleteField() : minute,
    };
    if (isKnockout(match) && isFinal) {
      payload.advance = advance ?? deleteField();
      payload.shootout = shootout ?? deleteField();
    }
    await updateDoc(doc(db, 'matches', String(match.id)), payload);
    // Mirror the write into our in-memory copy (same object ref lives in
    // liveMatches) so the notify hand-off file below reflects the fresh state.
    match.status = payload.status;
    match.result_home = result_home;
    match.result_away = result_away;
    match.events = events;
    if (isFinal) delete match.minute; else match.minute = minute;
    if (isKnockout(match) && isFinal) {
      if (advance != null) match.advance = advance; else delete match.advance;
      if (shootout != null) match.shootout = shootout; else delete match.shootout;
    }
    updated++;
    if (isFinal) finalized++; else live++;
    console.log(`#${match.id} ${match.home} ${result_home}-${result_away} ${match.away} [${isFinal ? 'FINAL' : minute}]${shootout ? ` (pens ${shootout.home}-${shootout.away})` : ''}${advance ? ` adv:${advance}` : ''} (${events.length} ev)`);
  }

  if (unmatched.length) {
    console.warn(`Unmatched (add to ALIASES): ${unmatched.join(', ')}`);
  }
  console.log(`Done. ${updated} updated (${live} live, ${finalized} finalized) of ${games.length} feed games.`);

  // Hand the post-write fixtures to the notify step so it skips its own scan.
  // `full` tells notify whether FINISHED games are included (only on a backfill);
  // on the rolling cron it re-reads the full set itself when it actually needs it.
  try {
    liveMatches.sort((a, b) => a.id - b.id);
    writeFileSync(NOTIFY_HANDOFF, JSON.stringify({ full: !scopedToLive, matches: liveMatches }));
  } catch (e) {
    console.warn(`Could not write notify hand-off file: ${e.message}`);
  }

  await cleanup();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
