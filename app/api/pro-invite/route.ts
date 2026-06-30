// Instant invite push for a newly-created Pro session.
//
// The client writes the proSessions/{id} doc, then POSTs { sessionId } here. The
// app can't web-push directly (the VAPID private key and the pushSubs read are
// server-only), and the GitHub Actions notifier only runs on its cron cadence —
// so this route exists purely to fire the *immediate* invite the moment a
// session is created. The recurring T-60min reminder still comes from notify.ts.
//
// Runs as a transient arbiter (anon sign-in + arbiters/{uid}) so it may read the
// closed pushSubs collection, exactly like the scripts. Needs these env vars on
// Vercel (server-side): NEXT_PUBLIC_FIREBASE_*, ARBITER_CODE, VAPID_PRIVATE_KEY,
// NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_SUBJECT.
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import webpush from 'web-push';
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

// Turkey-time label for the push body (devices and players are all in TR).
const fmt = (startMs: number) =>
  new Date(startMs).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
  });

export async function POST(req: NextRequest) {
  const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:fcfc@example.com';
  const code = process.env.ARBITER_CODE;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !code || !firebaseConfig.projectId) {
    return NextResponse.json({ error: 'push not configured' }, { status: 500 });
  }

  let sessionId = '';
  try {
    const body = await req.json();
    sessionId = String(body?.sessionId ?? '');
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!sessionId) return NextResponse.json({ error: 'missing sessionId' }, { status: 400 });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser!.uid;
  await setDoc(doc(db, 'arbiters', uid), { code });

  try {
    const snap = await getDoc(doc(db, 'proSessions', sessionId));
    if (!snap.exists()) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const session = snap.data() as ProSession;
    // Only push for a real, still-future session — bounds abuse of this endpoint
    // (it can only re-trigger an actual upcoming session's invite).
    if (!session.startMs || session.startMs < Date.now()) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const [playerSnap, subSnap] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'pushSubs')),
    ]);
    const hostName = playerSnap.docs
      .map(d => d.data() as Player)
      .find(p => p.id === session.host)?.name ?? '?';

    const invitees = new Set(session.invitees ?? []);
    const payload = JSON.stringify({
      title: '🎮 Pro session',
      body: `${hostName} · ${fmt(session.startMs)}`,
      url: '/',
      tag: `pro-${sessionId}`,
    });

    let sent = 0;
    for (const d of subSnap.docs) {
      const data = d.data() as { user_id: string; subscription: webpush.PushSubscription; prefs?: Record<string, boolean> };
      if (!invitees.has(data.user_id)) continue;
      if (data.prefs?.pro === false) continue;     // honour per-device opt-out
      try {
        await webpush.sendNotification(data.subscription, payload);
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          try { await deleteDoc(doc(db, 'pushSubs', d.id)); } catch { /* ignore */ }
        }
      }
    }
    return NextResponse.json({ ok: true, sent });
  } finally {
    try { await deleteDoc(doc(db, 'arbiters', uid)); } catch { /* best effort */ }
  }
}
