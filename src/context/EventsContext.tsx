/**
 * EventsContext — per-user events feed with:
 *  - Dismissed events (hidden from feed, persisted per user)
 *  - Read events (badge cleared but still visible in feed)
 *  - Favorite events (pinned + upcoming notifications)
 *
 * Storage:
 *  - Firestore `users/{uid}` fields: dismissedEvents, readEvents, favoriteEvents
 *  - AsyncStorage: local copy per uid (offline + guests)
 *  - AsyncStorage: notification IDs (device-only, not synced)
 */

import React, {
  createContext, useContext, useState, useEffect, useRef,
  useMemo, useCallback, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc, getDoc, setDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db } from '../services/firebase';
import { useCityId } from '../hooks/useCityId';
import { useAuth } from './AuthContext';
import { CommunityEvent } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isExpired(e: CommunityEvent): boolean {
  // Explicit expiry timestamp wins
  const ts: any = e.expiresAt;
  if (ts) {
    const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
    if (ms !== null && ms < Date.now()) return true;
  }
  // Auto-expire: events whose start date has fully passed (end of that day)
  if (e.startDate) {
    const d = new Date(e.startDate);
    d.setHours(23, 59, 59, 999);
    if (d.getTime() < Date.now()) return true;
  }
  return false;
}

function localKey(type: 'dismissed' | 'favorites' | 'notifIds' | 'read', uid: string | null) {
  const suffix = uid ?? 'guest';
  return `@events_${type}_${suffix}`;
}

function userDocRef(uid: string) {
  return doc(db, 'users', uid);
}

// ── Storage ───────────────────────────────────────────────────────────────────

async function loadPrefs(uid: string | null): Promise<{
  dismissed: Set<string>;
  favorites: Set<string>;
  read: Set<string>;
}> {
  if (uid) {
    try {
      const snap = await getDoc(userDocRef(uid));
      if (snap.exists()) {
        return {
          dismissed: new Set<string>(snap.data().dismissedEvents ?? []),
          favorites:  new Set<string>(snap.data().favoriteEvents  ?? []),
          read:       new Set<string>(snap.data().readEvents      ?? []),
        };
      }
    } catch {}
  }
  // AsyncStorage fallback (guests + offline)
  const [dRaw, fRaw, rRaw] = await Promise.all([
    AsyncStorage.getItem(localKey('dismissed', uid)),
    AsyncStorage.getItem(localKey('favorites',  uid)),
    AsyncStorage.getItem(localKey('read',       uid)),
  ]);
  return {
    dismissed: new Set<string>(dRaw ? JSON.parse(dRaw) : []),
    favorites:  new Set<string>(fRaw ? JSON.parse(fRaw) : []),
    read:       new Set<string>(rRaw ? JSON.parse(rRaw) : []),
  };
}

async function saveDismissed(uid: string | null, ids: Set<string>) {
  const arr = [...ids];
  AsyncStorage.setItem(localKey('dismissed', uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { dismissedEvents: arr }, { merge: true }).catch(() => {});
}

async function saveFavorites(uid: string | null, ids: Set<string>) {
  const arr = [...ids];
  AsyncStorage.setItem(localKey('favorites', uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { favoriteEvents: arr }, { merge: true }).catch(() => {});
}

async function saveRead(uid: string | null, ids: Set<string>) {
  const arr = [...ids];
  AsyncStorage.setItem(localKey('read', uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { readEvents: arr }, { merge: true }).catch(() => {});
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function ensureEventChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('events', {
      name: 'תזכורות אירועים',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
}

async function scheduleEventReminders(event: CommunityEvent, uid: string | null) {
  const startMs = new Date(event.startDate).getTime();
  const nowMs   = Date.now();
  if (startMs <= nowMs) return;

  await ensureEventChannel();

  const notifIds: Record<string, string> = {};

  async function schedule(titleHe: string, offsetMs: number) {
    const fireMs = startMs - offsetMs;
    const secondsUntil = Math.floor((fireMs - nowMs) / 1000);
    if (secondsUntil < 60) return;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: titleHe,
          body:  event.title,
          data:  { eventId: event.id },
          sound: 'default',
          ...(Platform.OS === 'android' ? { channelId: 'events' } : {}),
        },
        trigger: { seconds: secondsUntil, repeats: false } as any,
      });
      return id;
    } catch {
      return undefined;
    }
  }

  const dayId  = await schedule('📅 אירוע מחר', 24 * 60 * 60 * 1000);
  const hourId = await schedule('⏰ אירוע בעוד שעה', 60 * 60 * 1000);

  if (dayId)  notifIds.dayBefore  = dayId;
  if (hourId) notifIds.hourBefore = hourId;

  if (Object.keys(notifIds).length === 0) return;

  const key = localKey('notifIds', uid);
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  const all: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
  all[event.id] = notifIds;
  AsyncStorage.setItem(key, JSON.stringify(all)).catch(() => {});
}

async function cancelEventReminders(eventId: string, uid: string | null) {
  const key = localKey('notifIds', uid);
  const raw = await AsyncStorage.getItem(key).catch(() => null);
  if (!raw) return;
  const all: Record<string, Record<string, string>> = JSON.parse(raw);
  const ids = all[eventId];
  if (!ids) return;
  await Promise.all(
    Object.values(ids).map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
  delete all[eventId];
  AsyncStorage.setItem(key, JSON.stringify(all)).catch(() => {});
}

// ── Context ───────────────────────────────────────────────────────────────────

interface EventsCtx {
  /** Non-dismissed, non-expired events sorted by date */
  events: CommunityEvent[];
  /** Only favorited events, non-expired */
  favoriteEvents: CommunityEvent[];
  loading: boolean;
  error: string | null;
  /** Count of events not yet marked as read (drives the home-screen badge) */
  unreadCount: number;
  isFavorite:     (id: string) => boolean;
  isRead:         (id: string) => boolean;
  dismiss:        (id: string) => void;
  /** Mark event as "read" — stays in feed, badge clears */
  markRead:       (id: string) => void;
  /** Mark all current events as read */
  markAllRead:    () => void;
  toggleFavorite: (event: CommunityEvent) => void;
  /** Look up any event by id — including dismissed ones (used by detail screen) */
  findEvent:      (id: string) => CommunityEvent | undefined;
}

const EventsContext = createContext<EventsCtx>({
  events: [], favoriteEvents: [], loading: true, error: null, unreadCount: 0,
  isFavorite: () => false, isRead: () => false,
  dismiss: () => {}, markRead: () => {}, markAllRead: () => {},
  toggleFavorite: () => {}, findEvent: () => undefined,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function EventsProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const [all,        setAll]        = useState<CommunityEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set());
  const [favorites,  setFavorites]  = useState<Set<string>>(new Set());
  const [readEvents, setReadEvents] = useState<Set<string>>(new Set());

  // Keep a ref to `all` so callbacks can access it without re-creation
  const allRef = useRef(all);
  allRef.current = all;

  // Subscribe to city's events feed
  useEffect(() => {
    if (!cityId) return;
    setLoading(true);
    const q = query(collection(db, 'events'), where('cityId', '==', cityId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CommunityEvent))
          .filter((e) => !isExpired(e))
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        setAll(list);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
  }, [cityId]);

  // Reload per-user prefs whenever uid changes (login / logout)
  useEffect(() => {
    let cancelled = false;
    loadPrefs(uid).then(({ dismissed: d, favorites: f, read: r }) => {
      if (cancelled) return;
      setDismissed(d);
      setFavorites(f);
      setReadEvents(r);
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Lazy-prune stale IDs once feed loads
  useEffect(() => {
    if (all.length === 0) return;
    const liveIds = new Set(all.map((e) => e.id));
    setDismissed((prev) => {
      const pruned = new Set([...prev].filter((id) => liveIds.has(id)));
      if (pruned.size === prev.size) return prev;
      saveDismissed(uidRef.current, pruned);
      return pruned;
    });
    setFavorites((prev) => {
      const pruned = new Set([...prev].filter((id) => liveIds.has(id)));
      if (pruned.size === prev.size) return prev;
      saveFavorites(uidRef.current, pruned);
      return pruned;
    });
    setReadEvents((prev) => {
      const pruned = new Set([...prev].filter((id) => liveIds.has(id)));
      if (pruned.size === prev.size) return prev;
      saveRead(uidRef.current, pruned);
      return pruned;
    });
  }, [all]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(uidRef.current, next);
      return next;
    });
    setFavorites((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      saveFavorites(uidRef.current, next);
      cancelEventReminders(id, uidRef.current);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setReadEvents((prev) => {
      if (prev.has(id)) return prev; // already read — no-op
      const next = new Set(prev);
      next.add(id);
      saveRead(uidRef.current, next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadEvents(() => {
      const next = new Set(allRef.current.map((e) => e.id));
      saveRead(uidRef.current, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((event: CommunityEvent) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(event.id)) {
        next.delete(event.id);
        cancelEventReminders(event.id, uidRef.current);
      } else {
        next.add(event.id);
        scheduleEventReminders(event, uidRef.current);
      }
      saveFavorites(uidRef.current, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);
  const isRead     = useCallback((id: string) => readEvents.has(id), [readEvents]);
  const findEvent  = useCallback((id: string) => all.find((e) => e.id === id), [all]);

  const events = useMemo(
    () => all.filter((e) => !dismissed.has(e.id)),
    [all, dismissed],
  );

  const favoriteEvents = useMemo(
    () => all.filter((e) => favorites.has(e.id)),
    [all, favorites],
  );

  const unreadCount = useMemo(
    () => events.filter((e) => !readEvents.has(e.id)).length,
    [events, readEvents],
  );

  const value = useMemo<EventsCtx>(() => ({
    events, favoriteEvents, loading, error, unreadCount,
    isFavorite, isRead, dismiss, markRead, markAllRead, toggleFavorite, findEvent,
  }), [events, favoriteEvents, loading, error, unreadCount,
    isFavorite, isRead, dismiss, markRead, markAllRead, toggleFavorite, findEvent]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEventsFeed() {
  return useContext(EventsContext);
}
