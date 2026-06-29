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

// --- Value analytics ------------------------------------------------------
// The "Value Table" rewards calling outcomes the crowd missed, so risky-but-
// right beats safe-and-right. For each finished match every punter who picked
// the actual result banks a rarity score based on how few of the group also
// called it:
//   P_outcome = (correct picks for the result) / (total committed picks)
//   Score     = 1 - log2(P_outcome)
// A unanimous correct call (P = 1.0) banks exactly 1.0 (the consensus cap —
// log2(1) = 0); a lone-wolf correct call in a 6-way field (P = 1/6) banks
// ~3.58. Wrong picks bank nothing. Punters are ranked by total banked value.
export interface ValueRecord {
  id: string;
  name: string;
  avatar: string;
  value: number;   // total rarity-weighted value banked across finished matches
  hits: number;    // correct picks that scored
  best: number;    // biggest single-match haul (rarest correct call)
}
export interface ValueStats {
  records: ValueRecord[];   // sorted by value desc
  scored: number;           // finished matches that contributed (had >=1 pick)
}

export function computeValueStats(
  users: Player[],
  bets: Record<string, Bet | undefined>,
  matches: Match[],
): ValueStats {
  const finished = finishedInOrder(matches);
  const record: Record<string, ValueRecord> = {};
  for (const u of users) record[u.id] = { id: u.id, name: u.name, avatar: u.avatar, value: 0, hits: 0, best: 0 };
  let scored = 0;

  for (const m of finished) {
    const result = outcomeOf(m);
    if (!result) continue;
    // Committed picks for this match, tallied per option.
    const counts: Record<Pick, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
    const pickers: { id: string; pick: Pick }[] = [];
    for (const u of users) {
      const pick = bets[`${u.id}_${m.id}`]?.pick;
      if (!pick) continue;
      counts[pick]++;
      pickers.push({ id: u.id, pick });
    }
    const total = pickers.length;
    if (total === 0) continue;   // no predictions — nothing to value
    scored++;

    // Selection ratio of the winning outcome. Zero-bound protection: clamp the
    // count to a single phantom voter so log2 stays finite even if nobody backed
    // the result (no punter actually banks it, but the maths is defined).
    const correctCount = Math.max(1, counts[result]);
    const p = correctCount / total;
    const score = 1 - Math.log2(p);   // P = 1 -> 1.0 (consensus cap); rarer -> higher

    for (const { id, pick } of pickers) {
      if (pick !== result) continue;
      record[id].value += score;
      record[id].hits++;
      if (score > record[id].best) record[id].best = score;
    }
  }

  const records = Object.values(record)
    .sort((a, b) => b.value - a.value || b.hits - a.hits || a.name.localeCompare(b.name));
  return { records, scored };
}

// --- Knockout analytics ---------------------------------------------------
// Two bracket-specific punter stats, derived from finished knockout matches and
// each punter's committed picks. A knockout has a definite winner (`outcomeOf`
// reads `advance`, so ET/penalties are respected), and the other side is OUT.
//   - koHits  : picked the side that went through  -> "Knockout Hero" (most)
//   - bottles : picked the side that got knocked out -> "Bottler" (most; you
//               were "eliminated from the World Cup" that many times)
export interface KnockoutRecord {
  id: string;
  name: string;
  avatar: string;
  koPlayed: number;   // knockout matches this punter committed a pick on
  koHits: number;     // correct (picked the advancing side)
  bottles: number;    // wrong on the elimination (picked the team that went out)
}
export interface KnockoutStats {
  koFinished: number;            // finished knockout matches counted
  records: KnockoutRecord[];
  hero: KnockoutRecord | null;   // most knockout picks right
  bottler: KnockoutRecord | null; // most times backing the eliminated side
}

export function computeKnockoutStats(
  users: Player[],
  bets: Record<string, Bet | undefined>,
  matches: Match[],
): KnockoutStats {
  const ko = finishedInOrder(matches).filter(isKnockout);
  const record: Record<string, KnockoutRecord> = {};
  for (const u of users) record[u.id] = { id: u.id, name: u.name, avatar: u.avatar, koPlayed: 0, koHits: 0, bottles: 0 };

  for (const m of ko) {
    const winner = outcomeOf(m);
    if (winner !== 'HOME' && winner !== 'AWAY') continue; // a knockout can't be a draw
    const eliminated: Pick = winner === 'HOME' ? 'AWAY' : 'HOME';
    for (const u of users) {
      const pick = bets[`${u.id}_${m.id}`]?.pick;
      if (!pick) continue;
      record[u.id].koPlayed++;
      if (pick === winner) record[u.id].koHits++;
      else if (pick === eliminated) record[u.id].bottles++;
    }
  }

  const records = Object.values(record);
  const hero = records.some(r => r.koHits > 0)
    ? [...records].sort((a, b) => b.koHits - a.koHits || a.bottles - b.bottles || a.name.localeCompare(b.name))[0]
    : null;
  const bottler = records.some(r => r.bottles > 0)
    ? [...records].sort((a, b) => b.bottles - a.bottles || a.koHits - b.koHits || a.name.localeCompare(b.name))[0]
    : null;

  return { koFinished: ko.length, records, hero, bottler };
}

// --- Confederation affinities ---------------------------------------------
// Which confederation each WC-2026 nation belongs to (mirrors the grouped
// TEAM_ISO comments below). Used to tag who you back when you pick a team to
// win, so the lab can crown the punter most loyal to each region.
export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

export const TEAM_CONFEDERATION: Record<string, Confederation> = {
  // CONCACAF (incl. hosts)
  Canada: 'CONCACAF', Mexico: 'CONCACAF', USA: 'CONCACAF',
  'Curaçao': 'CONCACAF', Haiti: 'CONCACAF', Panama: 'CONCACAF',
  // AFC
  Australia: 'AFC', Iran: 'AFC', Iraq: 'AFC', Japan: 'AFC', Jordan: 'AFC',
  'South Korea': 'AFC', Qatar: 'AFC', 'Saudi Arabia': 'AFC', Uzbekistan: 'AFC',
  // CAF
  Algeria: 'CAF', 'Cape Verde': 'CAF', 'Ivory Coast': 'CAF', 'DR Congo': 'CAF',
  Egypt: 'CAF', Ghana: 'CAF', Morocco: 'CAF', Senegal: 'CAF',
  'South Africa': 'CAF', Tunisia: 'CAF',
  // CONMEBOL
  Argentina: 'CONMEBOL', Brazil: 'CONMEBOL', Colombia: 'CONMEBOL',
  Ecuador: 'CONMEBOL', Paraguay: 'CONMEBOL', Uruguay: 'CONMEBOL',
  // OFC
  'New Zealand': 'OFC',
  // UEFA
  Austria: 'UEFA', Belgium: 'UEFA', 'Bosnia and Herzegovina': 'UEFA',
  Croatia: 'UEFA', Czechia: 'UEFA', England: 'UEFA', France: 'UEFA',
  Germany: 'UEFA', Netherlands: 'UEFA', Norway: 'UEFA', Portugal: 'UEFA',
  Scotland: 'UEFA', Spain: 'UEFA', Sweden: 'UEFA', Switzerland: 'UEFA',
  'Türkiye': 'UEFA',
};

export const CONFEDERATIONS: Confederation[] = ['UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC'];

// Each confederation's affinity title + emoji — the punter who backs its teams
// the most wears the (deliberately tongue-in-cheek) crown. Shared by the
// Analytics Lab UI and the push-notification sender (scripts/notify.ts), so it
// lives here in the framework-free data module rather than in a client component.
export const AFFINITY_META: { confed: Confederation; title: string; emoji: string }[] = [
  { confed: 'UEFA', title: 'Colonialist', emoji: '🎩' },
  { confed: 'CONMEBOL', title: 'Sambist', emoji: '💃' },
  { confed: 'CAF', title: 'Blacked', emoji: '🌍' },
  { confed: 'CONCACAF', title: 'Cowboy', emoji: '🤠' },
  { confed: 'AFC', title: 'Tempura', emoji: '🍤' },
  { confed: 'OFC', title: 'Surfer', emoji: '🏄' },
];

// The team a committed pick backs to win — HOME/AWAY name a side; a DRAW backs
// nobody. (An unresolved knockout placeholder isn't a real team, so it later
// maps to no confederation and is skipped.)
function backedTeam(pick: Pick | undefined, m: Match): string | undefined {
  if (pick === 'HOME') return m.home;
  if (pick === 'AWAY') return m.away;
  return undefined;
}

export interface AffinityRecord {
  id: string;
  name: string;
  avatar: string;
  count: number;   // picks backing this confederation's teams
}

// For each confederation, the punter who has backed its teams the most — every
// pick that names a team to win counts (draws and unresolved knockout slots
// don't). Ties break to the alphabetically-first name (deterministic). Returns
// the leader (or null if nobody backed that region) keyed by confederation.
export function computeAffinityStats(
  users: Player[],
  bets: Record<string, Bet | undefined>,
  matches: Match[],
): Record<Confederation, AffinityRecord | null> {
  const byId = new Map<number, Match>();
  for (const m of matches) byId.set(m.id, m);
  const userById = new Map(users.map(u => [u.id, u]));

  const counts: Record<string, Record<Confederation, number>> = {};
  for (const u of users) counts[u.id] = { UEFA: 0, CONMEBOL: 0, CONCACAF: 0, CAF: 0, AFC: 0, OFC: 0 };

  for (const key in bets) {
    const bet = bets[key];
    if (!bet || !userById.has(bet.user_id)) continue; // skip ignored / unknown punters
    const m = byId.get(bet.match_id);
    if (!m) continue;
    const team = backedTeam(bet.pick, m);
    const confed = team ? TEAM_CONFEDERATION[team] : undefined;
    if (confed) counts[bet.user_id][confed]++;
  }

  const result = {} as Record<Confederation, AffinityRecord | null>;
  for (const c of CONFEDERATIONS) {
    let best: AffinityRecord | null = null;
    for (const u of users) {
      const count = counts[u.id][c];
      if (count <= 0) continue;
      if (!best || count > best.count || (count === best.count && u.name.localeCompare(best.name) < 0)) {
        best = { id: u.id, name: u.name, avatar: u.avatar, count };
      }
    }
    result[c] = best;
  }
  return result;
}

// Display order of the knockout tree, fixed by the seed's feeder map so each
// round's nodes sit between the two matches that feed them (top→bottom). Used by
// the Bracket tab. The third-place match is a side fixture, kept out of the tree.
export const BRACKET_ROUNDS: { stage: Stage; ids: number[] }[] = [
  { stage: 'R32', ids: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87] },
  { stage: 'R16', ids: [89, 90, 93, 94, 91, 92, 95, 96] },
  { stage: 'QF', ids: [97, 98, 99, 100] },
  { stage: 'SF', ids: [101, 102] },
  { stage: 'FINAL', ids: [104] },
];
export const THIRD_PLACE_ID = 103;

// --- Build Your Bracket (prediction minigame) -----------------------------
// Feeder map for the knockout tree: each parent node's two competitors are the
// WINNERS of these two matches (the slot labels in scripts/seed-knockout.mjs).
// R32 nodes (73–88) have no feeders — their teams come from the group stage.
// The third-place play-off (103) is fed by the SF *losers* and is left out of
// the bracket game.
export const BRACKET_FEEDERS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 104: [101, 102],
};

// Every bracket node id (R32 → Final), excluding the third-place game — the 31
// matches a completed bracket prediction must cover.
export const BRACKET_MATCH_IDS: number[] = BRACKET_ROUNDS.flatMap(r => r.ids);

// A player's "Build Your Bracket" prediction: the team they expect to advance
// from each bracket node (matchId → team name). Stored in `brackets/{user_id}`;
// permanent once `locked`.
export interface BracketPrediction {
  user_id: string;
  picks: Record<number, string>;   // matchId -> predicted advancing team name
  locked: boolean;
  updatedAt?: string;
}

// The two competitors at a bracket node for a given set of picks. R32 nodes read
// the live fixture teams; every higher node reads the predicted winners of its
// two feeder matches (undefined until both feeders are picked).
export function bracketSides(
  id: number,
  picks: Record<number, string>,
  byId: Map<number, Match>,
): { home?: string; away?: string } {
  const feeders = BRACKET_FEEDERS[id];
  if (!feeders) {
    const m = byId.get(id);
    return { home: m?.home, away: m?.away };
  }
  return { home: picks[feeders[0]], away: picks[feeders[1]] };
}

// After a pick changes, drop any higher-round pick that's no longer one of its
// node's two (re-derived) competitors — e.g. you switched a R32 winner, so the
// R16 pick that named the old winner is now stale. Processing rounds low→high in
// one pass cascades the clears all the way to the final.
export function prunePicks(
  picks: Record<number, string>,
  byId: Map<number, Match>,
): Record<number, string> {
  const next = { ...picks };
  for (const round of BRACKET_ROUNDS) {
    for (const id of round.ids) {
      if (!BRACKET_FEEDERS[id]) continue; // R32 competitors are fixed fixtures
      const { home, away } = bracketSides(id, next, byId);
      const pick = next[id];
      if (pick && pick !== home && pick !== away) delete next[id];
    }
  }
  return next;
}

// How many of a bracket's predicted advancers match reality. Counts every
// finished bracket node with a settled winner; a pick is correct when the team
// it named actually advanced. pct is null until at least one node is decided.
export function bracketAccuracy(
  picks: Record<number, string>,
  byId: Map<number, Match>,
): { correct: number; decided: number; pct: number | null } {
  let correct = 0, decided = 0;
  for (const id of BRACKET_MATCH_IDS) {
    const m = byId.get(id);
    if (!m || m.status !== 'FINISHED') continue;
    const out = outcomeOf(m);
    if (out !== 'HOME' && out !== 'AWAY') continue; // need a settled advancer
    decided++;
    if (picks[id] === (out === 'HOME' ? m.home : m.away)) correct++;
  }
  return { correct, decided, pct: decided > 0 ? Math.round((correct / decided) * 100) : null };
}

// --- Recent form ----------------------------------------------------------
// One result in a nation's recent form. Built by buildTeamForm() from the WC
// fixtures in state (see below). Display-only.
export interface FormMatch {
  date: string;        // fixture date string
  opponent: string;    // the other WC nation in that fixture
  gf: number;          // goals for (this team)
  ga: number;          // goals against
  result: 'W' | 'D' | 'L';
  competition: string; // WC stage label, e.g. "Group stage", "Round of 16"
}
export interface TeamForm {
  name: string;        // canonical team name (matches TEAM_ISO / fixtures)
  form: FormMatch[];   // most-recent first; render reversed so newest is rightmost
  updatedAt?: string;
}

// Readable competition label for a fixture's stage (group games have no stage).
function wcStageLabel(m: Match): string {
  switch (m.stage) {
    case 'R32': return 'Round of 32';
    case 'R16': return 'Round of 16';
    case 'QF': return 'Quarter-final';
    case 'SF': return 'Semi-final';
    case 'THIRD': return 'Third place';
    case 'FINAL': return 'Final';
    default: return 'Group stage';
  }
}

// Recent form derived entirely from the WC fixtures we already pull — no ESPN
// team-schedule feed. During the tournament these nations only play World Cup
// games, so each team's last-`n` finished matches *are* their current form.
// Returns `{ teamName -> FormMatch[] }`, most-recent first, mirroring what the
// old `teams` collection provided so MatchCard's form strip is unchanged.
export function buildTeamForm(matches: Match[], n = 5): Record<string, FormMatch[]> {
  const finished = matches
    .filter(m => m.status === 'FINISHED' && m.result_home !== undefined && m.result_away !== undefined)
    .sort((a, b) => kickoffMs(b) - kickoffMs(a) || b.id - a.id);   // most-recent first
  const out: Record<string, FormMatch[]> = {};
  const add = (team: string, m: Match, home: boolean) => {
    const list = (out[team] ??= []);
    if (list.length >= n) return;
    const gf = (home ? m.result_home : m.result_away) as number;
    const ga = (home ? m.result_away : m.result_home) as number;
    list.push({
      date: m.date,
      opponent: home ? m.away : m.home,
      gf, ga,
      result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
      competition: wcStageLabel(m),
    });
  };
  for (const m of finished) { add(m.home, m, true); add(m.away, m, false); }
  return out;
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