import React, {
  createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useCityId } from '../hooks/useCityId';
import { useAuth } from './AuthContext';
import { subscribeKashrutUpdates } from '../services/kashrutUpdates';
import { KashrutUpdate } from '../types';

// ── Expiry helpers ────────────────────────────────────────────────────────────

function toMs(u: KashrutUpdate): number {
  const c: any = u.createdAt;
  if (c?.toMillis) return c.toMillis();
  if (c?.seconds) return c.seconds * 1000;
  return Date.now();
}

function timestampToMs(ts: any): number | null {
  if (!ts) return null;
  if (ts?.toMillis) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  return null;
}

function isExpired(u: KashrutUpdate): boolean {
  const ms = timestampToMs(u.expiresAt);
  if (ms === null) return false;
  return ms < Date.now();
}

// ── Per-user storage helpers ──────────────────────────────────────────────────

function dismissKey(uid: string | null) {
  return uid ? `@kashrut_dismissed_${uid}` : '@kashrut_dismissed_guest';
}

function readKey(uid: string | null) {
  return uid ? `@kashrut_read_${uid}` : '@kashrut_read_guest';
}

function userDocRef(uid: string) {
  return doc(db, 'users', uid);
}

async function loadDismissed(uid: string | null): Promise<Set<string>> {
  if (uid) {
    try {
      const snap = await getDoc(userDocRef(uid));
      if (snap.exists()) {
        return new Set<string>(snap.data().kashrutDismissed ?? []);
      }
    } catch {}
  }
  try {
    const raw = await AsyncStorage.getItem(dismissKey(uid));
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {}
  return new Set();
}

async function saveDismissed(uid: string | null, ids: Set<string>): Promise<void> {
  const arr = [...ids];
  AsyncStorage.setItem(dismissKey(uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { kashrutDismissed: arr }, { merge: true }).catch(() => {});
}

async function loadRead(uid: string | null): Promise<Set<string>> {
  if (uid) {
    try {
      const snap = await getDoc(userDocRef(uid));
      if (snap.exists()) {
        return new Set<string>(snap.data().kashrutRead ?? []);
      }
    } catch {}
  }
  try {
    const raw = await AsyncStorage.getItem(readKey(uid));
    if (raw) return new Set<string>(JSON.parse(raw));
  } catch {}
  return new Set();
}

async function saveRead(uid: string | null, ids: Set<string>): Promise<void> {
  const arr = [...ids];
  AsyncStorage.setItem(readKey(uid), JSON.stringify(arr)).catch(() => {});
  if (uid) setDoc(userDocRef(uid), { kashrutRead: arr }, { merge: true }).catch(() => {});
}

// ── Context ───────────────────────────────────────────────────────────────────

interface Ctx {
  /** All visible (non-dismissed, non-expired) updates — shown in the list */
  updates: KashrutUpdate[];
  /** Count of *unread* updates — drives the badge only */
  count: number;
  /** Total count of visible updates (dismissed = 0) — drives banner visibility */
  totalCount: number;
  /** True if any *unread* update is a downgrade (drives badge red) */
  hasDowngrade: boolean;
  isRead:      (id: string) => boolean;
  dismiss:     (id: string) => void;
  dismissAll:  () => void;
  /** Mark update as read — stays in list, badge count decreases */
  markRead:    (id: string) => void;
  /** Undo "קראתי" — restores unread state and badge count */
  markUnread:  (id: string) => void;
  markAllRead: () => void;
}

const KashrutUpdatesContext = createContext<Ctx>({
  updates: [], count: 0, totalCount: 0, hasDowngrade: false,
  isRead: () => false, dismiss: () => {}, dismissAll: () => {},
  markRead: () => {}, markUnread: () => {}, markAllRead: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function KashrutUpdatesProvider({ children }: { children: ReactNode }) {
  const cityId = useCityId();
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? null;

  const [all,       setAll]       = useState<KashrutUpdate[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [readIds,   setReadIds]   = useState<Set<string>>(new Set());

  const uidRef = useRef(uid);
  uidRef.current = uid;
  const allRef = useRef(all);
  allRef.current = all;

  // Reload dismissed + read sets when user changes
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDismissed(uid), loadRead(uid)]).then(([d, r]) => {
      if (!cancelled) { setDismissed(d); setReadIds(r); }
    });
    return () => { cancelled = true; };
  }, [uid]);

  // Subscribe to the city's kashrut updates feed
  useEffect(() => {
    if (!cityId) return;
    return subscribeKashrutUpdates(cityId, setAll);
  }, [cityId]);

  // Lazy-prune stale IDs once the live feed loads
  useEffect(() => {
    if (all.length === 0) return;
    const liveIds = new Set(all.map((u) => u.id));
    setDismissed((prev) => {
      const pruned = new Set([...prev].filter((id) => liveIds.has(id)));
      if (pruned.size === prev.size) return prev;
      saveDismissed(uidRef.current, pruned);
      return pruned;
    });
    setReadIds((prev) => {
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
  }, []);

  const dismissAll = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const u of allRef.current) {
        if (!isExpired(u)) next.add(u.id);
      }
      saveDismissed(uidRef.current, next);
      return next;
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveRead(uidRef.current, next);
      return next;
    });
  }, []);

  const markUnread = useCallback((id: string) => {
    setReadIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      saveRead(uidRef.current, next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(() => {
      const next = new Set(allRef.current.map((u) => u.id));
      saveRead(uidRef.current, next);
      return next;
    });
  }, []);

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  // All non-dismissed, non-expired updates (shown in list)
  const updates = useMemo(() => {
    return [...all]
      .filter((u) => !isExpired(u) && !dismissed.has(u.id))
      .sort((a, b) => toMs(b) - toMs(a));
  }, [all, dismissed]);

  // Unread updates only — drives badge + banners
  const unreadUpdates = useMemo(
    () => updates.filter((u) => !readIds.has(u.id)),
    [updates, readIds],
  );

  const value = useMemo<Ctx>(() => ({
    updates,
    count:        unreadUpdates.length,
    totalCount:   updates.length,
    hasDowngrade: unreadUpdates.some((u) => u.direction === 'down'),
    isRead,
    dismiss,
    dismissAll,
    markRead,
    markUnread,
    markAllRead,
  }), [updates, unreadUpdates, isRead, dismiss, dismissAll, markRead, markUnread, markAllRead]);

  return (
    <KashrutUpdatesContext.Provider value={value}>
      {children}
    </KashrutUpdatesContext.Provider>
  );
}

export function useKashrutUpdates() {
  return useContext(KashrutUpdatesContext);
}
