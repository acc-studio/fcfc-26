// Group notification when an invitee replies to a Pro session.
//
// The client writes responses.{uid} on the proSessions/{id} doc, then POSTs
// { sessionId, userId } here. This route posts one message to the FCFC Telegram
// group announcing the reply (with the rejection "sebep" if any), and — on the
// reply that crosses a threshold — appends a milestone line:
//   • "Pro Çıktı!"      once positives (host + acceptances) reach 3
//   • "<host> Emdi"     once so many have rejected that 3 can no longer be met
// The host counts as one positive (they're playing), so 2 acceptances = 3.
//
// proSessions/players are publicly readable (firestore.rules), so no auth is
// needed — just the bot creds. Env on Vercel: NEXT_PUBLIC_FIREBASE_*,
// TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and (optional) TELEGRAM_USER_MAP.
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { escapeHtml, mentionFor, parseUserMap, sendTelegram } from '@/lib/telegram';
import type { ProSession, ProResponse, Player } from '@/lib/data';

export const runtime = 'nodejs';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const PRO_TARGET = 3; // positives (host + acceptances) needed for the session to happen

// accepted / rejected counts over the invitee responses, optionally skipping one
// responder (to reconstruct the state *before* their reply).
const tally = (session: ProSession, skipId?: string) => {
  let accepted = 0, rejected = 0;
  for (const id of session.invitees ?? []) {
    if (id === skipId) continue;
    const s = session.responses?.[id]?.status;
    if (s === 'accepted') accepted++;
    else if (s === 'rejected') rejected++;
  }
  // The responder stays in the pool for "before" state — only their response is
  // skipped, not their invitee slot — so maxPositives reflects them as undecided.
  const n = (session.invitees ?? []).length;
  return {
    positives: 1 + accepted,               // host is always one positive
    maxPositives: 1 + (n - rejected),      // host + acceptances + everyone still undecided
  };
};

export async function POST(req: NextRequest) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!TG_TOKEN || !TG_CHAT || !firebaseConfig.projectId) {
    return NextResponse.json({ error: 'telegram not configured' }, { status: 500 });
  }
  const userMap = parseUserMap(process.env.TELEGRAM_USER_MAP);

  let sessionId = '', userId = '';
  try {
    const body = await req.json();
    sessionId = String(body?.sessionId ?? '');
    userId = String(body?.userId ?? '');
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!sessionId || !userId) return NextResponse.json({ error: 'missing sessionId/userId' }, { status: 400 });

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const snap = await getDoc(doc(db, 'proSessions', sessionId));
  if (!snap.exists()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const session = snap.data() as ProSession;
  const resp: ProResponse | undefined = session.responses?.[userId];
  if (!resp) return NextResponse.json({ ok: true, sent: 0 }); // nothing to announce yet

  const playerSnap = await getDocs(collection(db, 'players'));
  const nameById = new Map(playerSnap.docs.map(d => { const p = d.data() as Player; return [p.id, p.name]; }));
  const hostName = nameById.get(session.host) ?? '?';
  const hostMention = mentionFor(hostName, userMap);
  const who = escapeHtml(nameById.get(userId) ?? '?');

  // State after this reply, and before it (skip the responder) — so a milestone
  // line fires only on the reply that actually crosses the threshold.
  const after = tally(session);
  const before = tally(session, userId);
  const newPro = after.positives >= PRO_TARGET && before.positives < PRO_TARGET;
  const newEmdi = after.maxPositives < PRO_TARGET && before.maxPositives >= PRO_TARGET;

  const verdict = resp.status === 'accepted' ? 'geliyor ✅' : 'gelmiyor ❌';
  const sebep = resp.status === 'rejected' && resp.sebep ? ` — “${escapeHtml(resp.sebep)}”` : '';
  const lines = [
    `<b>🎮 Pro · ${escapeHtml(hostName)}</b>`,
    `${hostMention} ${who} ${verdict}${sebep}  (${after.positives}/${PRO_TARGET})`,
  ];
  if (newPro) lines.push('🎉 <b>Pro Çıktı!</b>');
  if (newEmdi) lines.push(`💀 ${hostMention} Emdi`);

  const ok = await sendTelegram(TG_TOKEN, TG_CHAT, lines.join('\n'));
  return NextResponse.json({ ok, sent: ok ? 1 : 0 });
}
