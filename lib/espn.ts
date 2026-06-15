/* eslint-disable @typescript-eslint/no-explicit-any */
// Client-side fetch of starting XIs from the (unofficial) ESPN feed. Every
// endpoint sends `Access-Control-Allow-Origin: *`, so the browser calls them
// directly — no server, no storage. For a fixture whose lineup is published
// (~1h pre-kickoff onward) we show the real XIs; before that we fall back to
// each team's most recent line-up (from their last game, across competitions),
// labelled with who/when on its side of the pitch.

import { Match, kickoffMs } from './data';

const SOCCER = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const WC = `${SOCCER}/fifa.world`;

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

export interface LineupPlayer { name: string; jersey: string; pos: string; subbedOut: boolean; }
export interface TeamLineup { team: string; formation: string; starters: LineupPlayer[]; subs: LineupPlayer[]; }
export interface MatchLineups {
  source: 'match' | 'last';   // real fixture XI, or each team's previous-game XI
  home: TeamLineup | null;
  away: TeamLineup | null;
  homeNote?: string;          // e.g. "vs. Spain - 06.06.2026" (only when source = 'last')
  awayNote?: string;
}

const json = (url: string) => fetch(url).then((r) => r.json());

// YYYYMMDD range [kickoff-1d, kickoff+1d] in US Eastern (the dates ESPN files WC
// games under), so we find the event despite Turkey-time date drift.
function espnDateRange(ms: number): string {
  const et = ms - 4 * 3600 * 1000;
  const fmt = (m: number) => {
    const d = new Date(m);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  return `${fmt(et - 86400000)}-${fmt(et + 86400000)}`;
}

function parseRoster(r: any): TeamLineup {
  const entries: any[] = r.roster || [];
  const players: LineupPlayer[] = entries.map((p) => ({
    name: p.athlete?.displayName || p.athlete?.fullName || '?',
    jersey: String(p.jersey ?? p.athlete?.jersey ?? ''),
    pos: p.position?.abbreviation || '',
    subbedOut: !!p.subbedOut,
  }));
  return {
    team: canon(r.team?.displayName || ''),
    formation: r.formation || '',
    starters: players.filter((_, i) => entries[i]?.starter),
    subs: players.filter((_, i) => !entries[i]?.starter),
  };
}

// Canonical name -> ESPN team id. Hardcoded because the /teams endpoint (unlike
// scoreboard/schedule/summary) does NOT send CORS headers, so the browser can't
// fetch it. These ids are stable.
const TEAM_ESPN_ID: Record<string, string> = {
  'Algeria': '624', 'Argentina': '202', 'Australia': '628', 'Austria': '474',
  'Belgium': '459', 'Bosnia and Herzegovina': '452', 'Brazil': '205', 'Canada': '206',
  'Cape Verde': '2597', 'Colombia': '208', 'Croatia': '477', 'Curaçao': '11678',
  'Czechia': '450', 'DR Congo': '2850', 'Ecuador': '209', 'Egypt': '2620',
  'England': '448', 'France': '478', 'Germany': '481', 'Ghana': '4469',
  'Haiti': '2654', 'Iran': '469', 'Iraq': '4375', 'Ivory Coast': '4789',
  'Japan': '627', 'Jordan': '2917', 'Mexico': '203', 'Morocco': '2869',
  'Netherlands': '449', 'New Zealand': '2666', 'Norway': '464', 'Panama': '2659',
  'Paraguay': '210', 'Portugal': '482', 'Qatar': '4398', 'Saudi Arabia': '655',
  'Scotland': '580', 'Senegal': '654', 'South Africa': '467', 'South Korea': '451',
  'Spain': '164', 'Sweden': '466', 'Switzerland': '475', 'Tunisia': '659',
  'Türkiye': '465', 'Uruguay': '212', 'USA': '660', 'Uzbekistan': '2570',
};
const ID_BY_NORM: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_ESPN_ID).map(([k, v]) => [norm(k), v])
);
const teamId = (name: string): string | null => ID_BY_NORM[norm(name)] ?? null;

// A team's most recent completed match -> its XI + opponent/date for the label.
async function fetchLastXI(team: string): Promise<{ lineup: TeamLineup; opponent: string; date: string } | null> {
  const id = teamId(team);
  if (!id) return null;
  const sch = await json(`${SOCCER}/all/teams/${id}/schedule`);
  const ev = (sch.events || []).find((e: any) => e.competitions?.[0]?.status?.type?.state === 'post');
  if (!ev) return null;

  const slug = ev.league?.slug || 'fifa.world';
  const sum = await json(`${SOCCER}/${slug}/summary?event=${ev.id}`);
  const r = (sum.rosters || []).find((x: any) => sameTeam(x.team?.displayName || '', team));
  if (!r) return null;
  const lineup = parseRoster(r);
  if (!lineup.starters.length) return null;

  const opp = (ev.competitions[0].competitors || []).find((x: any) => !sameTeam(x.team?.displayName || '', team));
  const [y, m, d] = (ev.date || '').slice(0, 10).split('-');
  return {
    lineup,
    opponent: opp ? canon(opp.team?.displayName || '?') : '?',
    date: d && m && y ? `${d}.${m}.${y}` : '',
  };
}

export async function fetchLineups(match: Match): Promise<MatchLineups | null> {
  // 1) This fixture's own published line-up.
  try {
    const sb = await json(`${WC}/scoreboard?dates=${espnDateRange(kickoffMs(match))}`);
    const ev = (sb.events || []).find((e: any) => {
      const cs = e.competitions?.[0]?.competitors || [];
      return cs.length === 2 &&
        ((sameTeam(cs[0].team?.displayName, match.home) && sameTeam(cs[1].team?.displayName, match.away)) ||
         (sameTeam(cs[0].team?.displayName, match.away) && sameTeam(cs[1].team?.displayName, match.home)));
    });
    if (ev) {
      const sum = await json(`${WC}/summary?event=${ev.id}`);
      const rosters: any[] = sum.rosters || [];
      const pick = (t: string) => {
        const r = rosters.find((x) => sameTeam(x.team?.displayName || '', t));
        return r ? parseRoster(r) : null;
      };
      const home = pick(match.home), away = pick(match.away);
      if (home?.starters.length || away?.starters.length) return { source: 'match', home, away };
    }
  } catch { /* fall through to last-game */ }

  // 2) Not announced yet -> each team's previous-game XI.
  const [hr, ar] = await Promise.all([
    fetchLastXI(match.home).catch(() => null),
    fetchLastXI(match.away).catch(() => null),
  ]);
  if (!hr && !ar) return null;
  return {
    source: 'last',
    home: hr?.lineup ?? null,
    away: ar?.lineup ?? null,
    homeNote: hr ? `vs. ${hr.opponent} - ${hr.date}` : undefined,
    awayNote: ar ? `vs. ${ar.opponent} - ${ar.date}` : undefined,
  };
}
