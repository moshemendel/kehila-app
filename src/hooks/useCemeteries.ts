import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Cemetery } from '../types';

export function useCemeteries(cityId: string, active = true) {
  const [cemeteries, setCemeteries] = useState<Cemetery[]>([]);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId || !active) return;
    setLoading(true);
    const q = query(collection(db, 'cemeteries'), where('cityId', '==', cityId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Cemetery))
          .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        setCemeteries(list);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [cityId, active]);

  return { cemeteries, loading, error };
}
