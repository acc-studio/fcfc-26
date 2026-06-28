// A notable in-match event (goal / card), supplied by the live results poller
// (scripts/poll.mjs from the ESPN feed). `team` is relative to THIS match's
// home/away, not the feed's. Display-only — scoring never depends on it.
export interface MatchEvent {
  minute: string;                 // e.g. "40'", "90+2'"
  player: string;
  team: 'HOME' | 'AWAY';
  kind: 'goal' | 'own-goal' | 'penalty' | 'red';
}

// A penalty kick in a knockout shootout. Display + tiebreak only — `advance`
// (not the shootout score) is what scoring reads.
export interface ShootoutKick {
  player: string;
  team: 'HOME' | 'AWAY';
  scored: boolean;
}

// Tournament stage. Absent or 'GROUP' = a group-stage fixture (every seeded
// match 1–72). The rest are the knockout rounds (matches 73–104). Knockout
// matches can't draw on aggregate, so they're bet/scored on who advances.
export type Stage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL';

export interface Match {
  id: number;
  home: string;
  away: string;
  date: string;
  time: string;
  stadium: string;
  status: 'UPCOMING' | 'LIVE' | 'FINISHED';
  result_home?: number;
  result_away?: number;
  // Populated while LIVE (cleared on finalize): the running clock label.
  minute?: string;
  // Goals + red cards in chronological order (LIVE and FINISHED).
  events?: MatchEvent[];
  // Knockout only. Undefined/'GROUP' for the 72 group-stage fixtures.
  stage?: Stage;
  // Knockout only: the side that progressed. This (not the scoreline) is the
  // scored outcome, so a tie settled in extra time / on penalties scores the
  // correct picker. Set on a finished knockout match.
  advance?: 'HOME' | 'AWAY';
  // Knockout only: penalty shootout tally (+ optional per-kick list). Present
  // only when a level match went to spot-kicks.
  shootout?: { home: number; away: number; takers?: ShootoutKick[] };
}

// Players self-register; the roster lives in the Firestore `players` collection,
// not in code. `pin` is a 4-char login code (stored plaintext — this is a
// private game, not real security; anyone with DB access can read it).
export interface Player {
  id: string;
  name: string;
  avatar: string;
  pin: string;
}

// Quick-pick avatar suggestions when creating a profile; the register modal
// also lets users type any emoji of their own.
export const AVATARS = ['😼', '🤡', '🥴', '😏', '🤠', '🫠', '🐐', '🦂', '👹', '🤖', '👽', '🦅'];

// The arbiter unlock code is no longer in the client. It lives in the
// Firestore `config/arbiter` doc (never client-readable); ArbiterModal proves
// knowledge of it by writing an `arbiters/{uid}` doc that the rules validate
// server-side. See firestore.rules.

// Players can only bet on matches kicking off within this window.
export const BET_WINDOW_MS = 48 * 60 * 60 * 1000;

const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// Kickoff as a UTC epoch (ms). Match date/time are stored as Turkey time
// (UTC+3) strings like "Jun 12" / "05:00", all in 2026.
export function kickoffMs(m: Match): number {
  const [mon, day] = m.date.split(' ');
  const [hh, mm] = m.time.split(':').map(Number);
  return Date.UTC(2026, MONTH_INDEX[mon] ?? 0, Number(day), hh - 3, mm);
}

// Outcome-only betting: a player picks the home win, away win, or a draw.
export type Pick = 'HOME' | 'DRAW' | 'AWAY';
export type BetOutcome = 'win' | 'loss' | 'none';

export interface Bet {
  user_id: string;
  match_id: number;
  pick: Pick;
  locked: boolean;
}

// The 90/120-minute scoreline expressed as an outcome (null until finalized).
export function resultOutcome(resultHome?: number, resultAway?: number): Pick | null {
  if (resultHome === undefined || resultAway === undefined) return null;
  if (resultHome > resultAway) return 'HOME';
  if (resultHome < resultAway) return 'AWAY';
  return 'DRAW';
}

// A knockout fixture (matches 73–104). Group matches have no/`'GROUP'` stage.
export function isKnockout(m: Match): boolean {
  return !!m.stage && m.stage !== 'GROUP';
}

// True once a knockout slot holds two real teams (not placeholder labels like
// "Winner Group A"). Real team names are exactly the TEAM_ISO keys.
export function teamsResolved(m: Match): boolean {
  return m.home in TEAM_ISO && m.away in TEAM_ISO;
}

// The scored outcome of a match: who *won*. For knockouts this is `advance`
// (so penalty/ET results score correctly); otherwise the scoreline decides.
// Null until finalized.
export function outcomeOf(m: Match): Pick | null {
  if (m.advance) return m.advance;
  return resultOutcome(m.result_home, m.result_away);
}

// Correct pick = win (1 pt), otherwise loss. No exact-score tier.
export function betOutcome(pick: Pick | undefined, m: Match): BetOutcome {
  const actual = outcomeOf(m);
  if (!pick || !actual) return 'none';
  return pick === actual ? 'win' : 'loss';
}

// --- Punter analytics -----------------------------------------------------
// Everything the "Advanced FCFC Football Analytics Lab" needs, derived purely
// from finished matches + each punter's committed picks. No home/away or
// "betting %" nonsense — in a World Cup there's rarely a home side and everyone
// bets every match, so those metrics carry no signal. We track the race
// (cumulative points over time) and win/loss streaks instead.
export interface PunterStreak {
  type: 'hot' | 'cold' | 'none';   // hot = on a winning run, cold = losing run
  length: number;
}
export interface PunterStat {
  id: string;
  name: string;
  avatar: string;
  points: number;
  current: PunterStreak;   // the streak they're riding right now
  longestHot: number;      // longest winning run this punter has ever had
  longestCold: number;     // longest losing run this punter has ever had
  timeline: number[];      // cumulative points after each finished match (index 0 = 0)
}

// Finished matches in chronological (kickoff) order — the x-axis of the race.
export function finishedInOrder(matches: Match[]): Match[] {
  return matches
    .filter(m => m.status === 'FINISHED' && m.result_home !== undefined && m.result_away !== undefined)
    .sort((a, b) => kickoffMs(a) - kickoffMs(b) || a.id - b.id);
}

// Per-punter race timeline + streaks. A correct pick extends a hot streak and
// scores a point; a wrong pick extends a cold streak; a match with no committed
// pick is skipped (neither extends nor breaks the run).
export function computePunterStats(
  users: Player[],
  bets: Record<string, Bet | undefined>,
  matches: Match[],
): { finished: Match[]; stats: PunterStat[] } {
  const finished = finishedInOrder(matches);
  const stats = users.map(u => {
    let points = 0, longestHot = 0, longestCold = 0;
    let runType: 'hot' | 'cold' | null = null, runLen = 0;
    const timeline: number[] = [0];
    for (const m of finished) {
      const bet = bets[`${u.id}_${m.id}`];
      const out = bet?.pick ? betOutcome(bet.pick, m) : 'none';
      if (out === 'win') {
        points += 1;
        if (runType === 'hot') runLen++; else { runType = 'hot'; runLen = 1; }
        if (runLen > longestHot) longestHot = runLen;
      } else if (out === 'loss') {
        if (runType === 'cold') runLen++; else { runType = 'cold'; runLen = 1; }
        if (runLen > longestCold) longestCold = runLen;
      }
      timeline.push(points);
    }
    const current: PunterStreak = runType ? { type: runType, length: runLen } : { type: 'none', length: 0 };
    return { id: u.id, name: u.name, avatar: u.avatar, points, current, longestHot, longestCold, timeline };
  });
  return { finished, stats };
}

// --- Crowd / risk analytics -----------------------------------------------
// Group-betting tendencies derived from each finished match's committed picks.
// A "risky" pick is an underdog pick: the option you took drew at most 2 backers
// while another option pulled at least 3 — you went against the crowd. It "pays
// off" when that option is the actual result.
const MAJORITY = 4;   // a clear majority of the 6-player group
const FAVORITE = 3;   // the crowd's favourite option
const UNDERDOG = 2;   // an underdog option draws at most this many backers

// Wilson score lower bound (95%, z=1.96) on the success rate `hits/total`. A
// confidence-adjusted hit rate: it returns the bottom of the interval, so a
// small sample is penalised (1/1 → 0.21) while a larger one at the same rate
// scores higher. 0 hits (or no bets) → 0. Used to rank the Dark Jockey.
function wilsonLower(hits: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = hits / total;
  return (p + (z * z) / (2 * total) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total))
    / (1 + (z * z) / total);
}

export interface RiskRecord {
  id: string;
  name: string;
  avatar: string;
  risky: number;   // risky picks made
  hits: number;    // risky picks that paid off
}
export interface CrowdStats {
  wisdomPct: number | null;   // % of majority games the crowd got right
  wisdomGames: number;        // games that had a qualifying majority
  darkHorsePct: number | null; // % of underdog-situation games the underdog won
  darkHorseGames: number;      // games where an underdog option existed
  jockey: RiskRecord | null;   // sharpest underdog-caller: best hit rate on risky bets
  gambler: RiskRecord | null;  // most risky bets overall
}

export function computeCrowdStats(
  users: Player[],
  bets: Record<string, Bet | undefined>,
  matches: Match[],
): CrowdStats {
  const finished = finishedInOrder(matches);
  let wisdomGames = 0, wisdomHits = 0, darkHorseGames = 0, darkHorseHits = 0;
  const record: Record<string, RiskRecord> = {};
  for (const u of users) record[u.id] = { id: u.id, name: u.name, avatar: u.avatar, risky: 0, hits: 0 };

  for (const m of finished) {
    const result = outcomeOf(m);
    if (!result) continue;
    // Committed picks for this match, tallied per option.
    const counts: Record<Pick, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
    const picks: { id: string; pick: Pick }[] = [];
    for (const u of users) {
      const pick = bets[`${u.id}_${m.id}`]?.pick;
      if (!pick) continue;
      counts[pick]++;
      picks.push({ id: u.id, pick });
    }

    // Wisdom of the crowd: a single option backed by >=4 of the group.
    const majority = (['HOME', 'DRAW', 'AWAY'] as Pick[]).find(o => counts[o] >= MAJORITY);
    if (majority) {
      wisdomGames++;
      if (majority === result) wisdomHits++;
    }

    // Underdog situation: some option is a favourite (>=3) while another draws
    // 1–2 backers. The dark horse "pays off" when that underdog is the result.
    const hasFavorite = (['HOME', 'DRAW', 'AWAY'] as Pick[]).some(o => counts[o] >= FAVORITE);
    const hasUnderdog = (['HOME', 'DRAW', 'AWAY'] as Pick[]).some(o => counts[o] >= 1 && counts[o] <= UNDERDOG);
    if (hasFavorite && hasUnderdog) {
      darkHorseGames++;
      if (counts[result] >= 1 && counts[result] <= UNDERDOG) darkHorseHits++;
    }

    // Per-punter: a pick is risky if it drew <=2 backers while another option
    // drew >=3. It paid off if it was the result.
    for (const { id, pick } of picks) {
      const otherFavorite = (['HOME', 'DRAW', 'AWAY'] as Pick[]).some(o => o !== pick && counts[o] >= FAVORITE);
      if (counts[pick] <= UNDERDOG && otherFavorite) {
        record[id].risky++;
        if (pick === result) record[id].hits++;
      }
    }
  }

  const pct = (hit: number, total: number) => (total > 0 ? Math.round((hit / total) * 100) : null);
  const riskers = Object.values(record).filter(r => r.risky > 0);
  // Dark Jockey = the sharpest underdog-caller. Ranking by raw hit rate is no
  // good with tiny samples (1/1 would beat 3/4), and ranking by raw count just
  // rewards volume (that's the Gambler). So we score each punter by the Wilson
  // score lower bound on their risky-bet hit rate: it shrinks small samples
  // toward zero, so you need both a strong rate *and* enough evidence to top
  // the list. This yields 3/4 > 1/1 (low confidence) and 3/4 > 4/10 (weak rate).
  const callers = riskers.filter(r => r.hits > 0);
  const jockey = callers.length
    ? [...callers].sort((a, b) =>
        wilsonLower(b.hits, b.risky) - wilsonLower(a.hits, a.risky)
        || b.hits - a.hits || a.risky - b.risky)[0]
    : null;
  // Gambler = the most prolific risk-taker by raw volume, win or lose.
  const gambler = riskers.length
    ? [...riskers].sort((a, b) => b.risky - a.risky || b.hits - a.hits)[0]
    : null;

  return {
    wisdomPct: pct(wisdomHits, wisdomGames),
    wisdomGames,
    darkHorsePct: pct(darkHorseHits, darkHorseGames),
    darkHorseGames,
    jockey,
    gambler,
  };
}

// --- Recent form ----------------------------------------------------------
// A nation's recent results across all competitions, fetched from ESPN by
// scripts/form.mjs and stored in `teams/{name}` docs. Display-only.
export interface FormMatch {
  date: string;        // "2026-06-13"
  opponent: string;    // full opponent name (may be a non-WC nation)
  gf: number;          // goals for (this team)
  ga: number;          // goals against
  result: 'W' | 'D' | 'L';
  competition: string; // e.g. "FIFA World Cup", "Men's International Friendly"
}
export interface TeamForm {
  name: string;        // canonical team name (matches TEAM_ISO / fixtures)
  form: FormMatch[];   // most-recent first; render reversed so newest is rightmost
  updatedAt?: string;
}

// --- Group stage ----------------------------------------------------------
// The 12 groups of the 2026 final draw (Dec 5 2025), in canonical names that
// match the fixtures/TEAM_ISO. Standings are computed from our own results.
export const GROUPS: Record<string, string[]> = {
  A: ['Mexico', 'Czechia', 'South Korea', 'South Africa'],
  B: ['Canada', 'Bosnia and Herzegovina', 'Switzerland', 'Qatar'],
  C: ['Brazil', 'Scotland', 'Haiti', 'Morocco'],
  D: ['Paraguay', 'Türkiye', 'Australia', 'USA'],
  E: ['Ecuador', 'Germany', 'Ivory Coast', 'Curaçao'],
  F: ['Netherlands', 'Sweden', 'Japan', 'Tunisia'],
  G: ['Belgium', 'Iran', 'Egypt', 'New Zealand'],
  H: ['Spain', 'Uruguay', 'Saudi Arabia', 'Cape Verde'],
  I: ['Norway', 'France', 'Senegal', 'Iraq'],
  J: ['Argentina', 'Austria', 'Algeria', 'Jordan'],
  K: ['Colombia', 'Portugal', 'Uzbekistan', 'DR Congo'],
  L: ['England', 'Croatia', 'Panama', 'Ghana'],
};

export interface Standing {
  team: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
}

// Group table from finished matches. Pass all matches — only those between two
// of `teams` count. Sorted by points, then GD, then GF (a display-level subset
// of FIFA's tiebreakers; head-to-head etc. are not applied).
export function computeStandings(teams: string[], matches: Match[]): Standing[] {
  const table = new Map<string, Standing>(
    teams.map(t => [t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }])
  );
  for (const m of matches) {
    if (m.status !== 'FINISHED' || m.result_home === undefined || m.result_away === undefined) continue;
    const H = table.get(m.home), A = table.get(m.away);
    if (!H || !A) continue; // not an intra-group match
    H.p++; A.p++;
    H.gf += m.result_home; H.ga += m.result_away;
    A.gf += m.result_away; A.ga += m.result_home;
    if (m.result_home > m.result_away) { H.w++; A.l++; H.pts += 3; }
    else if (m.result_home < m.result_away) { A.w++; H.l++; A.pts += 3; }
    else { H.d++; A.d++; H.pts++; A.pts++; }
  }
  const rows = [...table.values()];
  rows.forEach(s => { s.gd = s.gf - s.ga; });
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
  return rows;
}

// Finished matches played between two teams of the given group, in schedule order.
export function groupMatches(teams: string[], matches: Match[]): Match[] {
  return matches
    .filter(m => m.status === 'FINISHED' && teams.includes(m.home) && teams.includes(m.away))
    .sort((a, b) => a.id - b.id);
}

// Map Country Name -> ISO Code for FlagCDN.
// Keys MUST match the team names used in the fixtures seed (scripts/seed.mjs)
// exactly, otherwise the flag falls back to a "?" swatch.
// Note: England/Scotland use special GB subdivision codes.
// Covers all 48 teams of the 2026 World Cup (final draw, Dec 5 2025).
export const TEAM_ISO: Record<string, string> = {
  // Hosts
  "Canada": "ca",
  "Mexico": "mx",
  "USA": "us",

  // AFC
  "Australia": "au",
  "Iran": "ir",
  "Iraq": "iq",
  "Japan": "jp",
  "Jordan": "jo",
  "South Korea": "kr",
  "Qatar": "qa",
  "Saudi Arabia": "sa",
  "Uzbekistan": "uz",

  // CAF
  "Algeria": "dz",
  "Cape Verde": "cv",
  "Ivory Coast": "ci",
  "DR Congo": "cd",
  "Egypt": "eg",
  "Ghana": "gh",
  "Morocco": "ma",
  "Senegal": "sn",
  "South Africa": "za",
  "Tunisia": "tn",

  // Concacaf
  "Curaçao": "cw",
  "Haiti": "ht",
  "Panama": "pa",

  // CONMEBOL
  "Argentina": "ar",
  "Brazil": "br",
  "Colombia": "co",
  "Ecuador": "ec",
  "Paraguay": "py",
  "Uruguay": "uy",

  // OFC
  "New Zealand": "nz",

  // UEFA
  "Austria": "at",
  "Belgium": "be",
  "Bosnia and Herzegovina": "ba",
  "Croatia": "hr",
  "Czechia": "cz",
  "England": "gb-eng", // Special code
  "France": "fr",
  "Germany": "de",
  "Netherlands": "nl",
  "Norway": "no",
  "Portugal": "pt",
  "Scotland": "gb-sct", // Special code
  "Spain": "es",
  "Sweden": "se",
  "Switzerland": "ch",
  "Türkiye": "tr",
};