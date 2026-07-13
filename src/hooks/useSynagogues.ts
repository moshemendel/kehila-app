import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Synagogue } from '../types';

export function useSynagogues(cityId: string, active = true) {
  const [synagogues, setSynagogues] = useState<Synagogue[]>([]);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId || !active) return;
    setLoading(true);
    const q = query(collection(db, 'synagogues'), where('cityId', '==', cityId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSynagogues(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Synagogue)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [cityId, active]);

  return { synagogues, loading, error };
}
