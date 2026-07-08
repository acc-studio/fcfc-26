// Instant invite notification for a newly-created Pro session.
//
// The client writes the proSessions/{id} doc, then POSTs { sessionId } here. The
// GitHub Actions notifier only runs on its cron cadence, so this route exists to
// fire the *immediate* invite the moment a session is created — it posts one
// message to the FCFC Telegram group, @tagging the invitees. The recurring
// T-60min reminder still comes from notify.ts.
//
// proSessions and players are publicly readable (see firestore.rules), so this
// route needs no auth — just the bot creds. Needs these env vars on Vercel:
// NEXT_PUBLIC_FIREBASE_*, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and (optional)
// TELEGRAM_USER_MAP.
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { escapeHtml, mentionFor, parseUserMap, sendTelegram } from '@/lib/telegram';
import type { ProSession, Player } from '@/lib/data';

export const runtime = 'nodejs';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Turkey-time label for the message body (players are all in TR).
const fmt = (startMs: number) =>
  new Date(startMs).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  });

export async function POST(req: NextRequest) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
  if (!TG_TOKEN || !TG_CHAT || !firebaseConfig.projectId) {
    return NextResponse.json({ error: 'telegram not configured' }, { status: 500 });
  }
  const userMap = parseUserMap(process.env.TELEGRAM_USER_MAP);

  let sessionId = '';
  try {
    const body = await req.json();
    sessionId = String(body?.sessionId ?? '');
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const snap = await getDoc(doc(db, 'proSessions', sessionId));
  if (!snap.exists()) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const session = snap.data() as ProSession;
  // Only announce a real, still-future session — bounds abuse of this endpoint
  // (it can only re-trigger an actual upcoming session's invite).
  if (!session.startMs || session.startMs < Date.now()) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const playerSnap = await getDocs(collection(db, 'players'));
  const nameById = new Map(playerSnap.docs.map(d => { const p = d.data() as Player; return [p.id, p.name]; }));
  const hostName = nameById.get(session.host) ?? '?';

  // One group message, @tagging every invitee so they're each pinged.
  const mentions = (session.invitees ?? [])
    .map(id => mentionFor(nameById.get(id), userMap))
    .filter(Boolean)
    .join(' ');
  const head = '<b>🎮 New Pro session</b>';
  const line = `${escapeHtml(hostName)} · ${escapeHtml(fmt(session.startMs))}`;
  const text = mentions ? `${head}\n${mentions} — ${line}` : `${head}\n${line}`;

  const ok = await sendTelegram(TG_TOKEN, TG_CHAT, text);
  return NextResponse.json({ ok, sent: ok ? 1 : 0 });
}
