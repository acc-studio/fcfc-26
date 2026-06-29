// Fetches each nation's recent form (last 5 results across all competitions)
// from the unofficial ESPN feed and writes it to `teams/{name}` docs, which the
// app streams for the form indicators on each betting ticket.
//
//   node --env-file=.env.local scripts/form.mjs
//
// Runs a few times a day (form only changes when a team plays); see
// .github/workflows/form.yml. Writes as a transient arbiter (connect.mjs), so
// it needs ARBITER_CODE alongside the Firebase config. ~49 requests per run
// (1 team list + 48 schedules). The feed is unofficial — a failed team is
// skipped, never fatal.

import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { connectAsArbiter } from './connect.mjs';

// ESPN display name -> our canonical name (matches fixtures / TEAM_ISO).
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
const canon = (n) => ALIASES[n] ?? n;

// Order-stable signature of a form array, for change detection. Firestore
// returns map keys sorted (not in insertion order), so JSON.stringify of a
// read-back doc wouldn't match a freshly-built one — compare named fields.
const formSig = (form) =>
  (form || []).map((f) => `${f.date}|${f.opponent}|${f.gf}|${f.ga}|${f.result}|${f.competition}`).join('~');

const TEAMS_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams';
const schedUrl = (id) => `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${id}/schedule`;

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'fcfc26-form' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const teamsData = await fetchJson(TEAMS_URL);
  const teams = (teamsData.sports?.[0]?.leagues?.[0]?.teams || []).map((x) => x.team);
  if (!teams.length) throw new Error('No teams in ESPN feed');

  const { db, cleanup } = await connectAsArbiter();

  // Existing form docs, so we only write the teams whose last-5 actually
  // changed. form refreshes every poll cycle now (same cadence as scores), and
  // a team's form only moves when it plays — unconditional writes would blow
  // Firestore's free-tier write quota, so skip the unchanged ones.
  const existing = new Map();
  try {
    const snap = await getDocs(collection(db, 'teams'));
    snap.forEach((d) => existing.set(d.id, d.data()));
  } catch (e) {
    console.warn(`could not read existing form (will write all): ${e.message}`);
  }

  let written = 0, skipped = 0;
  for (const t of teams) {
    try {
      const sch = await fetchJson(schedUrl(t.id));
      const completed = (sch.events || []).filter(
        (e) => e.competitions?.[0]?.status?.type?.state === 'post'
      );
      const form = completed.slice(0, 5).map((e) => {
        const c = e.competitions[0];
        const me = c.competitors.find((x) => x.team?.id === t.id);
        const opp = c.competitors.find((x) => x.team?.id !== t.id);
        const gf = Number(me?.score?.displayValue ?? me?.score ?? 0);
        const ga = Number(opp?.score?.displayValue ?? opp?.score ?? 0);
        return {
          date: (e.date || '').slice(0, 10),
          opponent: opp?.team?.displayName || '?',
          gf, ga,
          result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
          competition: e.league?.name || e.league?.abbreviation || '',
        };
      });
      const name = canon(t.displayName);
      // Skip the write when the last-5 is byte-for-byte unchanged (ignore the
      // updatedAt-only diff) — keeps writes near-zero on a quiet cycle.
      const prev = existing.get(name);
      if (prev && formSig(prev.form) === formSig(form)) {
        skipped++;
        continue;
      }
      await setDoc(doc(db, 'teams', name), { name, form, updatedAt: new Date().toISOString() });
      written++;
      console.log(`${name}: ${form.map((f) => f.result).join('') || '(none)'}`);
    } catch (e) {
      console.warn(`skip ${t.displayName}: ${e.message}`);
    }
  }

  await cleanup();
  console.log(`Form: ${written} written, ${skipped} unchanged (of ${teams.length}).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
