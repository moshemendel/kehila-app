/**
 * Reminders for a synagogue's own announcements — the ones a gabay posts on
 * `synagogue.synagogueEvents`, separate from the city-wide feed EventsContext
 * manages.
 *
 * They stay separate on purpose. Creating a doc in the `events` collection
 * requires an event_manager or admin role (see firestore.rules) — a
 * resident's private "remind me" tap could not write there even if it tried.
 * And it should not try to: turning a personal reminder into a city-wide
 * broadcast would publish something the gabay only posted for their own
 * congregation to everyone else's feed, which is not what tapping a bell icon
 * means.
 *
 * So only the INTENT is persisted per user — which announcement, which lead
 * times — and the content (title, date, location…) is joined live from
 * whatever synagogues are already loaded, the same way CommunityEvent
 * reminders join against the live events feed rather than caching a copy.
 * That live join is what makes an announcement the gabay removes silently
 * cancel its reminder, and is why `remindedEvents` below only ever reflects
 * announcements that still exist.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';
import { useCityId } from '../hooks/useCityId';
import { useSynagogues } from '../hooks/useSynagogues';
import { reconcileReminders, ReminderTarget } from '../utils/eventReminders';
import { EventCategory } from '../types';

export interface SynagogueEventRef {
  key: string;
  synagogueId: string;
  synagogueName: string;
  announcementId: string;
  title: string;
  description: string;
  category: EventCategory;
  startDate: string;
  location?: string;
  isAlert: boolean;
  minutes: number[];
}

function refKey(synagogueId: string, announcementId: string): string {
  return `syn:${synagogueId}:${announcementId}`;
}

function storageKey(uid: string | undefined): string {
  return uid ? `@syn_event_reminders_${uid}` : '@syn_event_reminders_guest';
}

function notifIdsKey(uid: string | undefined): string {
  return uid ? `@syn_event_notif_ids_${uid}` : '@syn_event_notif_ids_guest';
}

interface Ctx {
  /** Reminded announcements joined with live content — upcoming only,
   *  sorted by date. What EventsScreen renders as "my synagogue reminders". */
  remindedEvents: SynagogueEventRef[];
  getReminders: (synagogueId: string, announcementId: string) => number[];
  /** Replace one announcement's reminders. An empty list clears it. */
  setReminders: (synagogueId: string, announcementId: string, minutes: number[]) => void;
}

const Ctx = createContext<Ctx>({
  remindedEvents: [],
  getReminders: () => [],
  setReminders: () => {},
});

export function SynagogueEventRemindersProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const cityId = useCityId();
  const { synagogues, loading: synLoading } = useSynagogues(cityId);

  const [intents, setIntents] = useState<Record<string, number[]>>({});
  const [intentsLoaded, setIntentsLoaded] = useState(false);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  // Load — Firestore first for a signed-in user, AsyncStorage otherwise.
  useEffect(() => {
    let cancelled = false;
    setIntentsLoaded(false);
    (async () => {
      if (uid) {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          const remote = snap.exists() ? snap.data().synagogueEventReminders : null;
          if (remote && !cancelled) {
            setIntents(remote);
            setIntentsLoaded(true);
            return;
          }
        } catch {}
      }
      const raw = await AsyncStorage.getItem(storageKey(uid)).catch(() => null);
      if (cancelled) return;
      setIntents(raw ? JSON.parse(raw) : {});
      setIntentsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [uid]);

  const persist = useCallback((next: Record<string, number[]>) => {
    AsyncStorage.setItem(storageKey(uidRef.current), JSON.stringify(next)).catch(() => {});
    if (uidRef.current) {
      setDoc(doc(db, 'users', uidRef.current),
        { synagogueEventReminders: next }, { merge: true }).catch(() => {});
    }
  }, []);

  const getReminders = useCallback(
    (synagogueId: string, announcementId: string) => intents[refKey(synagogueId, announcementId)] ?? [],
    [intents],
  );

  const setReminders = useCallback(
    (synagogueId: string, announcementId: string, minutes: number[]) => {
      setIntents((prev) => {
        const key = refKey(synagogueId, announcementId);
        const next = { ...prev };
        if (minutes.length === 0) delete next[key];
        else next[key] = [...minutes].sort((a, b) => b - a);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // Join intents against live synagogue content.
  const remindedEvents = useMemo<SynagogueEventRef[]>(() => {
    if (!intentsLoaded) return [];
    const nowMs = Date.now();
    const list: SynagogueEventRef[] = [];
    for (const syn of synagogues) {
      for (const ann of syn.synagogueEvents ?? []) {
        const key = refKey(syn.id, ann.id);
        const minutes = intents[key];
        if (!minutes || minutes.length === 0) continue;
        if (new Date(ann.startDate).getTime() <= nowMs) continue;
        list.push({
          key, synagogueId: syn.id, synagogueName: syn.name, announcementId: ann.id,
          title: ann.title, description: ann.description, category: ann.category,
          startDate: ann.startDate, location: ann.location, isAlert: ann.isAlert, minutes,
        });
      }
    }
    return list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [synagogues, intents, intentsLoaded]);

  // Drop intents whose announcement is gone — the gabay deleted it, or (today)
  // edited it, which the admin screen implements as delete-and-recreate with a
  // new id. Gated on both loads finishing: "not found yet" during a city
  // switch or a cold start must not be mistaken for "deleted".
  useEffect(() => {
    if (!intentsLoaded || synLoading || synagogues.length === 0) return;
    const live = new Set<string>();
    for (const syn of synagogues) {
      for (const ann of syn.synagogueEvents ?? []) live.add(refKey(syn.id, ann.id));
    }
    setIntents((prev) => {
      const stale = Object.keys(prev).filter((k) => !live.has(k));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      stale.forEach((k) => delete next[k]);
      persist(next);
      return next;
    });
  }, [synagogues, synLoading, intentsLoaded, persist]);

  // Reconcile the actual scheduled notifications against `remindedEvents`,
  // through the same engine CommunityEvent reminders use.
  useEffect(() => {
    if (!intentsLoaded || synLoading) return;
    const wanted = new Map(
      remindedEvents.map((e) => [
        e.key,
        {
          target: { id: e.key, title: e.title, startDate: e.startDate } as ReminderTarget,
          leads: e.minutes,
          // Tapping the notification should land on the synagogue that
          // posted it, same mechanism EventDetail reminders use.
          data: { screen: 'SynagogueDetail', params: { synagogueId: e.synagogueId } },
        },
      ]),
    );
    reconcileReminders(wanted, notifIdsKey(uidRef.current)).catch(() => {});
  }, [remindedEvents, intentsLoaded, synLoading]);

  const value = useMemo<Ctx>(
    () => ({ remindedEvents, getReminders, setReminders }),
    [remindedEvents, getReminders, setReminders],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSynagogueEventReminders(): Ctx {
  return useContext(Ctx);
}
