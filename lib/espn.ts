/* eslint-disable @typescript-eslint/no-explicit-any */
// Client-side fetch of starting XIs from the (unofficial) ESPN feed. Both the
// scoreboard and summary endpoints send `Access-Control-Allow-Origin: *`, so the
// browser can call them directly — no server, no storage. Lineups are published
// ~1h before kickoff and during/after the match; before that the feed has no
// rosters and we surface "not published yet".

import { Match, kickoffMs } from './data';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';

// ESPN display name -> our canonical name (matches fixtures / TEAM_ISO).
const ALIASES: Record<string, string> = {
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
const canon = (n: string) => ALIASES[n] ?? n;
const norm = (s: string) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ').replace(/\band\b/g, ' ').replace(/[^a-z0-9]+/g, '');
const sameTeam = (espnName: string, ours: string) => norm(canon(espnName)) === norm(ours);

export interface LineupPlayer {
  name: string;
  jersey: string;
  pos: string;
  subbedOut: boolean;
}
export interface TeamLineup {
  team: string;
  formation: string;
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}
export interface MatchLineups {
  home: TeamLineup | null;
  away: TeamLineup | null;
}

// YYYYMMDD range [kickoff-1d, kickoff+1d] in US Eastern (the dates ESPN files WC
// games under), so we find the event regardless of our Turkey-time date drift.
function espnDateRange(ms: number): string {
  const et = ms - 4 * 3600 * 1000; // EDT = UTC-4 in June/July
  const fmt = (m: number) => {
    const d = new Date(m);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  return `${fmt(et - 86400000)}-${fmt(et + 86400000)}`;
}

function parseRoster(r: any): TeamLineup {
  const players: LineupPlayer[] = (r.roster || []).map((p: any) => ({
    name: p.athlete?.displayName || p.athlete?.fullName || '?',
    jersey: String(p.jersey ?? p.athlete?.jersey ?? ''),
    pos: p.position?.abbreviation || '',
    subbedOut: !!p.subbedOut,
  }));
  return {
    team: canon(r.team?.displayName || ''),
    formation: r.formation || '',
    starters: players.filter((_, i) => (r.roster?.[i]?.starter)),
    subs: players.filter((_, i) => !(r.roster?.[i]?.starter)),
  };
}

// Resolve the ESPN event for a fixture, then return both XIs. Returns null when
// the event can't be found; returns lineups with empty starters when the event
// exists but rosters aren't published yet.
export async function fetchLineups(match: Match): Promise<MatchLineups | null> {
  const sb = await fetch(`${BASE}/scoreboard?dates=${espnDateRange(kickoffMs(match))}`).then(r => r.json());
  const ev = (sb.events || []).find((e: any) => {
    const cs = e.competitions?.[0]?.competitors || [];
    if (cs.length !== 2) return false;
    return (
      (sameTeam(cs[0].team?.displayName, match.home) && sameTeam(cs[1].team?.displayName, match.away)) ||
      (sameTeam(cs[0].team?.displayName, match.away) && sameTeam(cs[1].team?.displayName, match.home))
    );
  });
  if (!ev) return null;

  const sum = await fetch(`${BASE}/summary?event=${ev.id}`).then(r => r.json());
  const rosters: any[] = sum.rosters || [];
  const pick = (team: string) => {
    const r = rosters.find((x) => sameTeam(x.team?.displayName || '', team));
    return r ? parseRoster(r) : null;
  };
  return { home: pick(match.home), away: pick(match.away) };
}
