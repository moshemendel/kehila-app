import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AppState } from 'react-native';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// ─── Module-level context (set once at login) ─────────────────────────────────

let _uid    = '';
let _cityId = '';

export function initAnalytics(uid: string, cityId: string) {
  _uid    = uid;
  _cityId = cityId;
}

export function clearAnalytics() {
  _uid    = '';
  _cityId = '';
}

// ─── Last-active stamp ────────────────────────────────────────────────────────
// users/{uid}.lastActiveAt lets the console count monthly active users and
// retention per city with cheap count() queries instead of scanning
// analyticsEvents. Written at most about once a day per device.

const TOUCH_EVERY_MS = 20 * 60 * 60 * 1000;
let _lastTouch = 0;

/** `stored` is the lastActiveAt already on the profile (Timestamp, Date, ISO string or missing). */
export function touchLastActive(uid: string, stored?: unknown): void {
  if (!uid) return;
  const now = Date.now();
  if (now - _lastTouch < TOUCH_EVERY_MS) return;
  const s = stored as any;
  const storedMs = s?.toMillis ? s.toMillis()
    : s instanceof Date ? s.getTime()
    : typeof s === 'string' ? Date.parse(s) : NaN;
  if (Number.isFinite(storedMs) && now - storedMs < TOUCH_EVERY_MS) { _lastTouch = now; return; }
  _lastTouch = now;
  updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() })
    .catch(() => { _lastTouch = 0; }); // never crash; retry on next foreground
}

// Long-lived sessions: count a return to the foreground as activity too.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && _uid) touchLastActive(_uid);
});

// ─── Rate-limiting ────────────────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000; // don't count the same screen twice within 5 min
const _lastTracked: Record<string, number> = {};

// ─── Core tracking function ───────────────────────────────────────────────────

export function trackScreen(feature: string): void {
  if (!_uid || !_cityId) return;

  const now = Date.now();
  if (_lastTracked[feature] && now - _lastTracked[feature] < COOLDOWN_MS) return;
  _lastTracked[feature] = now;

  const d = new Date();
  addDoc(collection(db, 'analyticsEvents'), {
    feature,
    cityId:    _cityId,
    uid:       _uid,
    hour:      d.getHours(),                // 0-23
    dayOfWeek: d.getDay(),                  // 0=Sun … 6=Sat
    date:      d.toISOString().slice(0, 10),// 'YYYY-MM-DD'
    ts:        Timestamp.now(),
  }).catch(() => {}); // analytics must never crash the app
}

// ─── Hook: one-liner for screens ──────────────────────────────────────────────

export function useAnalyticsTrack(feature: string): void {
  useFocusEffect(
    useCallback(() => { trackScreen(feature); }, [feature])
  );
}
