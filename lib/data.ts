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

// Code to unlock arbiter (result-entry) mode.
export const ARBITER_CODE = '317098';

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

// The actual match result expressed as an outcome (null until finalized).
export function resultOutcome(resultHome?: number, resultAway?: number): Pick | null {
  if (resultHome === undefined || resultAway === undefined) return null;
  if (resultHome > resultAway) return 'HOME';
  if (resultHome < resultAway) return 'AWAY';
  return 'DRAW';
}

// Correct pick = win (1 pt), otherwise loss. No exact-score tier.
export function betOutcome(pick: Pick | undefined, resultHome?: number, resultAway?: number): BetOutcome {
  const actual = resultOutcome(resultHome, resultAway);
  if (!pick || !actual) return 'none';
  return pick === actual ? 'win' : 'loss';
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