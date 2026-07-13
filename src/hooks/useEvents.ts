import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { CommunityEvent } from '../types';

function isExpired(e: CommunityEvent): boolean {
  const ts: any = e.expiresAt;
  if (!ts) return false; // no expiry field = legacy doc, keep it
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : null;
  if (ms === null) return false;
  return ms < Date.now();
}

export function useEvents(cityId: string) {
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId) return;
    setLoading(true);
    const q = query(
      collection(db, 'events'),
      where('cityId', '==', cityId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as CommunityEvent))
          .filter((e) => !isExpired(e))               // hide expired events client-side
          .sort((a, b) => a.startDate.localeCompare(b.startDate));
        setEvents(list);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [cityId]);

  return { events, loading, error };
}
