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
import { db } from '../services/firebase';
import { useCityId } from '../hooks/useCityId';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationsContext';
import { DEFAULT_EVENT_LEAD_TIMES, syncEventReminders } from '../utils/eventReminders';
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

function localKey(
  type: 'dismissed' | 'favorites' | 'notifIds' | 'read' | 'reminders',
  uid: string | null,
) {
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
  reminders: Record<string, number[]>;
}> {
  if (uid) {
    try {
      const snap = await getDoc(userDocRef(uid));
      if (snap.exists()) {
        return {
          dismissed: new Set<string>(snap.data().dismissedEvents ?? []),
          favorites:  new Set<string>(snap.data().favoriteEvents  ?? []),
          read:       new Set<string>(snap.data().readEvents      ?? []),
          reminders:  (snap.data().eventReminders ?? {}) as Record<string, number[]>,
        };
      }
    } catch {}
  }
  // AsyncStorage fallback (guests + offline)
  const [dRaw, fRaw, rRaw, remRaw] = await Promise.all([
    AsyncStorage.getItem(localKey('dismissed', uid)),
    AsyncStorage.getItem(localKey('favorites',  uid)),
    AsyncStorage.getItem(localKey('read',       uid)),
    AsyncStorage.getItem(localKey('reminders',  uid)),
  ]);
  return {
    dismissed: new Set<string>(dRaw ? JSON.parse(dRaw) : []),
    favorites:  new Set<string>(fRaw ? JSON.parse(fRaw) : []),
    read:       new Set<string>(rRaw ? JSON.parse(rRaw) : []),
    reminders:  remRaw ? JSON.parse(remRaw) : {},
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

/** The chosen distances sync like the stars do — the intent should survive a
 *  new phone. The scheduled notification ids stay device-local. */
async function saveReminders(uid: string | null, map: Record<string, number[]>) {
  AsyncStorage.setItem(localKey('reminders', uid), JSON.stringify(map)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { eventReminders: map }, { merge: true }).catch(() => {});
}

async function saveRead(uid: string | null, ids: Set<string>) {
  const arr = [...ids];
  AsyncStorage.setItem(localKey('read', uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { readEvents: arr }, { merge: true }).catch(() => {});
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
  /** Minutes-before list chosen for one event; empty means "use the default set" */
  getReminders:   (id: string) => number[];
  /** Replace one event's reminders. An empty list unstars it. */
  setReminders:   (event: CommunityEvent, minutes: number[]) => void;
  /** Look up any event by id — including dismissed ones (used by detail screen) */
  findEvent:      (id: string) => CommunityEvent | undefined;
}

const EventsContext = createContext<EventsCtx>({
  events: [], favoriteEvents: [], loading: true, error: null, unreadCount: 0,
  isFavorite: () => false, isRead: () => false,
  dismiss: () => {}, markRead: () => {}, markAllRead: () => {},
  toggleFavorite: () => {},
  getReminders: () => [], setReminders: () => {},
  findEvent: () => undefined,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function EventsProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { firebaseUser } = useAuth();
  const { settings: notifSettings } = useNotifications();
  const uid = firebaseUser?.uid ?? null;
  const uidRef = useRef(uid);
  uidRef.current = uid;

  const [all,        setAll]        = useState<CommunityEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set());
  const [favorites,  setFavorites]  = useState<Set<string>>(new Set());
  const [readEvents, setReadEvents] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [reminders,  setRemindersState] = useState<Record<string, number[]>>({});

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
    setPrefsLoaded(false);
    loadPrefs(uid).then(({ dismissed: d, favorites: f, read: r, reminders: rem }) => {
      if (cancelled) return;
      setDismissed(d);
      setFavorites(f);
      setReadEvents(r);
      setRemindersState(rem);
      setPrefsLoaded(true);
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

  // Keep the scheduled reminders matching the feed, the stars and the chosen
  // lead times. This is what makes a postponed event move its reminder and a
  // deleted one drop it — neither happened while scheduling was tied to the
  // star alone.
  const leadKey = (notifSettings.eventLeadTimes ?? DEFAULT_EVENT_LEAD_TIMES).join(',');
  useEffect(() => {
    // Both inputs start empty and fill in asynchronously. Running before they
    // arrive would read as "nothing is starred" and cancel every reminder the
    // user has, only to rebuild it a moment later — and lose the lot if the
    // app were killed in between.
    if (loading || !prefsLoaded) return;
    const defaults = leadKey ? leadKey.split(',').map(Number) : [];
    syncEventReminders(
      all, favorites, reminders, defaults, localKey('notifIds', uidRef.current),
    ).catch(() => {});
  }, [all, favorites, reminders, leadKey, loading, prefsLoaded]);

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

  /** The quick star, from the list. Uses the default set; open the event to
   *  choose distances for it specifically. */
  const toggleFavorite = useCallback((event: CommunityEvent) => {
    let removing = false;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(event.id)) { next.delete(event.id); removing = true; }
      else next.add(event.id);
      saveFavorites(uidRef.current, next);
      return next;
    });
    // Drop any custom distances along with the star, so re-starring later
    // does not silently resurrect choices the user thought they had cleared.
    if (removing) {
      setRemindersState((prev) => {
        if (!(event.id in prev)) return prev;
        const next = { ...prev };
        delete next[event.id];
        saveReminders(uidRef.current, next);
        return next;
      });
    }
    // Scheduling is not done here — the reconcile effect below owns it, so
    // that a moved or deleted event is handled the same way as an unstarred
    // one instead of needing its own path.
  }, []);

  const getReminders = useCallback(
    (id: string) => reminders[id] ?? [],
    [reminders],
  );

  /** An empty list means "no reminders", which for an event is the same as
   *  not starring it — otherwise a starred event with nothing set would
   *  silently fall back to the default set the user just cleared. */
  const setReminders = useCallback((event: CommunityEvent, minutes: number[]) => {
    const uid = uidRef.current;
    setRemindersState((prev) => {
      const next = { ...prev };
      if (minutes.length === 0) delete next[event.id];
      else next[event.id] = [...minutes].sort((a, b) => b - a);
      saveReminders(uid, next);
      return next;
    });
    setFavorites((prev) => {
      const next = new Set(prev);
      if (minutes.length === 0) next.delete(event.id);
      else next.add(event.id);
      saveFavorites(uid, next);
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
    isFavorite, isRead, dismiss, markRead, markAllRead, toggleFavorite,
    getReminders, setReminders, findEvent,
  }), [events, favoriteEvents, loading, error, unreadCount,
    isFavorite, isRead, dismiss, markRead, markAllRead, toggleFavorite,
    getReminders, setReminders, findEvent]);

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEventsFeed() {
  return useContext(EventsContext);
}
