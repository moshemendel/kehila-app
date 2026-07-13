import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
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
