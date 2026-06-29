// Push-notification sender for FCFC '26.
//
// Runs in CI right after the live-results poll (.github/workflows/poll-results.yml,
// via `npx tsx scripts/notify.ts`). It recomputes the leaderboard / Analytics-Lab
// titles with the SAME pure functions the app uses (lib/data.ts), diffs them
// against the last run's snapshot (notifyState/state), and web-pushes the changes
// to the devices in `pushSubs`. Authenticates as a transient arbiter (connect.mjs),
// so it can read bets/players and persist the snapshot.
//
// Run locally:  node --env-file=.env.local --import tsx scripts/notify.ts
// Env: NEXT_PUBLIC_FIREBASE_* + ARBITER_CODE (as the poller), plus a VAPID keypair:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@…).
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import webpush from 'web-push';
import { connectAsArbiter } from './connect.mjs';
import {
  type Match, type Bet, type Player, type PunterStat,
  kickoffMs, isKnockout, teamsResolved,
  computePunterStats, computeCrowdStats, computeKnockoutStats, computeValueStats, computeAffinityStats,
  AFFINITY_META, CONFEDERATIONS,
} from '../lib/data';

const CLOSING_MS = 4 * 60 * 60 * 1000; // "betting closing soon" lead time

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:fcfc@example.com';

// Snapshot persisted between runs so we only alert on *changes*.
interface NotifyState {
  matchStatus: Record<string, string>;   // id -> status
  eventCount: Record<string, number>;     // id -> events.length last seen
  koResolved: Record<string, boolean>;    // knockout id -> both teams resolved
  closingSent: Record<string, boolean>;   // `${uid}_${matchId}` reminders sent
  rank: Record<string, number>;           // uid -> table position (1-based)
  titles: Record<string, string>;         // titleKey -> holder uid
}

type Target = { kind: 'all' } | { kind: 'user'; userId: string };
type NotifyType = 'result' | 'goals' | 'knockout' | 'closing' | 'table' | 'titles';
interface Msg { target: Target; type: NotifyType; title: string; body: string; tag: string; }

const emptyState = (): NotifyState =>
  ({ matchStatus: {}, eventCount: {}, koResolved: {}, closingSent: {}, rank: {}, titles: {} });

// --- title copy (non-affinity); affinity copy comes from AFFINITY_META --------
// label is phrased to follow "You're now …".
const TITLE_COPY: Record<string, { emoji: string; label: string }> = {
  hottest:    { emoji: '🔥', label: 'the Hottest' },
  coldest:    { emoji: '🧊', label: 'the Coldest' },
  recordHot:  { emoji: '🏆', label: 'the all-time hot-streak record holder' },
  recordCold: { emoji: '❄️', label: 'the all-time cold-streak record holder' },
  jockey:     { emoji: '🏇', label: 'the Dark Jockey' },
  gambler:    { emoji: '🎲', label: 'the Gambler' },
  hero:       { emoji: '🦸', label: 'the Knockout Hero' },
  bottler:    { emoji: '🍾', label: 'the Bottler' },
  value:      { emoji: '💰', label: 'the Value leader' },
};

// Who currently holds each title (uid or null), keyed by title id.
function computeTitleHolders(players: Player[], bets: Record<string, Bet>, matches: Match[]): Record<string, string | null> {
  const { stats } = computePunterStats(players, bets, matches);
  const hottest = stats.filter(s => s.current.type === 'hot').sort((a, b) => b.current.length - a.current.length)[0];
  const coldest = stats.filter(s => s.current.type === 'cold').sort((a, b) => b.current.length - a.current.length)[0];
  const recordHot = [...stats].sort((a, b) => b.longestHot - a.longestHot).find(s => s.longestHot > 0);
  const recordCold = [...stats].sort((a, b) => b.longestCold - a.longestCold).find(s => s.longestCold > 0);
  const crowd = computeCrowdStats(players, bets, matches);
  const ko = computeKnockoutStats(players, bets, matches);
  const value = computeValueStats(players, bets, matches);
  const aff = computeAffinityStats(players, bets, matches);

  const holders: Record<string, string | null> = {
    hottest: hottest?.id ?? null,
    coldest: coldest?.id ?? null,
    recordHot: recordHot?.id ?? null,
    recordCold: recordCold?.id ?? null,
    jockey: crowd.jockey?.id ?? null,
    gambler: crowd.gambler?.id ?? null,
    hero: ko.hero?.id ?? null,
    bottler: ko.bottler?.id ?? null,
    value: value.records[0] && value.records[0].value > 0 ? value.records[0].id : null,
  };
  for (const c of CONFEDERATIONS) holders[`aff-${c}`] = aff[c]?.id ?? null;
  return holders;
}

function titleCopy(key: string): { emoji: string; label: string } {
  if (key.startsWith('aff-')) {
    const meta = AFFINITY_META.find(m => `aff-${m.confed}` === key);
    return { emoji: meta?.emoji ?? '🏅', label: meta?.title ?? 'a title' };
  }
  return TITLE_COPY[key] ?? { emoji: '🏅', label: 'a title' };
}

const EVENT_VERB: Record<string, string> = {
  goal: '⚽', 'own-goal': '⚽ (OG)', penalty: '⚽ (pen)', red: '🟥',
};

async function main() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error('Missing VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — skipping notify.');
    process.exit(0);
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const { db, cleanup } = await connectAsArbiter();
  try {
    // --- load everything --------------------------------------------------
    const [matchSnap, playerSnap, betSnap, subSnap, stateSnap] = await Promise.all([
      getDocs(collection(db, 'matches')),
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'bets')),
      getDocs(collection(db, 'pushSubs')),
      getDoc(doc(db, 'notifyState', 'state')),
    ]);

    const matches = matchSnap.docs.map(d => d.data() as Match).sort((a, b) => a.id - b.id);
    const players = playerSnap.docs.map(d => d.data() as Player);
    const bets: Record<string, Bet> = {};
    for (const d of betSnap.docs) {
      const b = d.data() as Bet;
      if (b && b.pick) bets[d.id] = b;   // doc id === `${user_id}_${match_id}`
    }
    const subs = subSnap.docs.map(d => {
      const data = d.data() as { user_id: string; subscription: webpush.PushSubscription; prefs?: Record<string, boolean> };
      return { id: d.id, user_id: data.user_id, subscription: data.subscription, prefs: data.prefs ?? {} };
    });
    // A device gets a message of a given type unless it opted that type out.
    const wants = (s: { prefs: Record<string, boolean> }, type: NotifyType) => s.prefs[type] !== false;

    const byUser = new Map<string, typeof subs>();
    for (const s of subs) {
      if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
      byUser.get(s.user_id)!.push(s);
    }

    const now = Date.now();
    const playerIds = new Set(players.map(p => p.id));

    // --- compute current snapshot ----------------------------------------
    const next = emptyState();
    for (const m of matches) {
      const id = String(m.id);
      next.matchStatus[id] = m.status;
      next.eventCount[id] = (m.events ?? []).length;
      if (isKnockout(m) && teamsResolved(m)) next.koResolved[id] = true;
    }

    // table ranks (points desc, name tiebreak — mirrors Leaderboard)
    const { stats } = computePunterStats(players, bets, matches);
    const ranked: PunterStat[] = [...stats].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    ranked.forEach((s, i) => { next.rank[s.id] = i + 1; });

    const titleHolders = computeTitleHolders(players, bets, matches);
    for (const [k, v] of Object.entries(titleHolders)) if (v) next.titles[k] = v;

    // --- seed guard: first ever run sends nothing ------------------------
    if (!stateSnap.exists()) {
      // carry forward closing reminders as already-handled so the first real
      // run doesn't blast every imminent match.
      for (const m of matches) {
        const k = kickoffMs(m);
        if (m.status === 'UPCOMING' && k > now && k <= now + CLOSING_MS) {
          for (const p of players) next.closingSent[`${p.id}_${m.id}`] = true;
        }
      }
      await setDoc(doc(db, 'notifyState', 'state'), next);
      console.log('notify: seeded baseline state (no notifications sent).');
      return;
    }
    const prev = { ...emptyState(), ...(stateSnap.data() as Partial<NotifyState>) };
    next.closingSent = { ...prev.closingSent };

    // --- build messages ---------------------------------------------------
    const msgs: Msg[] = [];
    const byId = new Map(matches.map(m => [m.id, m] as const));

    for (const m of matches) {
      const id = String(m.id);
      const label = `${m.home} vs ${m.away}`;

      // Result is in (broadcast)
      if (m.status === 'FINISHED' && prev.matchStatus[id] !== 'FINISHED') {
        const pens = m.shootout ? ` (pens ${m.shootout.home}-${m.shootout.away})` : '';
        msgs.push({
          target: { kind: 'all' },
          type: 'result',
          title: "FCFC '26 · full time",
          body: `${m.home} ${m.result_home}–${m.result_away} ${m.away}${pens}`,
          tag: `m${id}-final`,
        });
      }

      // Live goals / red cards (broadcast) — only while LIVE, so a match that
      // finalizes in one poll doesn't replay its whole event list.
      if (m.status === 'LIVE') {
        const events = m.events ?? [];
        const seen = prev.eventCount[id] ?? 0;
        for (let i = seen; i < events.length; i++) {
          const e = events[i];
          const team = e.team === 'HOME' ? m.home : m.away;
          msgs.push({
            target: { kind: 'all' },
            type: 'goals',
            title: `${EVENT_VERB[e.kind] ?? '⚽'} ${m.home} ${m.result_home}–${m.result_away} ${m.away}`,
            body: `${e.minute} ${e.player} (${team})`,
            tag: `m${id}-ev${i}`,
          });
        }
      }

      // Knockout fixture newly resolved → bettable (broadcast)
      if (isKnockout(m) && teamsResolved(m) && !prev.koResolved[id] && m.status === 'UPCOMING') {
        msgs.push({
          target: { kind: 'all' },
          type: 'knockout',
          title: '🗝️ Knockout fixture unlocked',
          body: `${label} — place your bets`,
          tag: `m${id}-ko`,
        });
      }

      // Betting closing soon (per user, once each)
      const k = kickoffMs(m);
      if (m.status === 'UPCOMING' && teamsResolved(m) && k > now && k <= now + CLOSING_MS) {
        for (const p of players) {
          const key = `${p.id}_${m.id}`;
          if (next.closingSent[key]) continue;
          const bet = bets[`${p.id}_${m.id}`];
          if (bet?.pick) continue;                 // already picked
          next.closingSent[key] = true;
          if (!byUser.has(p.id)) continue;          // no device subscribed
          const hrs = Math.max(1, Math.round((k - now) / 3600000));
          msgs.push({
            target: { kind: 'user', userId: p.id },
            type: 'closing',
            title: '⏰ Bets close soon',
            body: `${label} kicks off in ~${hrs}h — you haven't picked.`,
            tag: `m${id}-close`,
          });
        }
      }
    }

    // Table moves (per user) — skip players new to the table (no prior rank).
    for (const s of ranked) {
      const newRank = next.rank[s.id];
      const oldRank = prev.rank[s.id];
      if (oldRank === undefined || oldRank === newRank) continue;
      const up = newRank < oldRank;
      msgs.push({
        target: { kind: 'user', userId: s.id },
        type: 'table',
        title: up ? '📈 Climbing' : '📉 Slipping',
        body: up ? `You're now ${ordinal(newRank)} in the table` : `You slipped to ${ordinal(newRank)} in the table`,
        tag: 'rank',
      });
    }

    // Title changes (per user) — notify the new holder (roast titles included).
    for (const [key, holder] of Object.entries(titleHolders)) {
      if (!holder || prev.titles[key] === holder) continue;
      if (!playerIds.has(holder)) continue;
      const { emoji, label } = titleCopy(key);
      msgs.push({
        target: { kind: 'user', userId: holder },
        type: 'titles',
        title: `${emoji} New title`,
        body: `You're now ${label}`,
        tag: `title-${key}`,
      });
    }

    // --- send -------------------------------------------------------------
    let sent = 0, pruned = 0;
    for (const msg of msgs) {
      const pool = msg.target.kind === 'all' ? subs : (byUser.get(msg.target.userId) ?? []);
      const targets = pool.filter((s) => wants(s, msg.type));   // honour per-device type prefs
      const payload = JSON.stringify({ title: msg.title, body: msg.body, url: '/', tag: msg.tag });
      for (const s of targets) {
        try {
          await webpush.sendNotification(s.subscription, payload);
          sent++;
        } catch (err: unknown) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            try { await deleteDoc(doc(db, 'pushSubs', s.id)); pruned++; } catch { /* ignore */ }
          } else {
            console.warn(`push failed (${code ?? 'err'}) for ${s.id}`);
          }
        }
      }
    }

    // prune closing reminders for matches that are no longer upcoming
    for (const key of Object.keys(next.closingSent)) {
      const mid = Number(key.split('_')[1]);
      const m = byId.get(mid);
      if (!m || m.status !== 'UPCOMING') delete next.closingSent[key];
    }

    await setDoc(doc(db, 'notifyState', 'state'), next);
    console.log(`notify: ${msgs.length} change(s) → ${sent} push(es) sent, ${pruned} stale sub(s) pruned.`);
  } finally {
    await cleanup();
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
