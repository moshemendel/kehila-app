import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Mikveh } from '../types';

export function useMikvaot(cityId: string, active = true) {
  const [mikvaot, setMikvaot] = useState<Mikveh[]>([]);
  const [loading, setLoading] = useState(active);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cityId || !active) return;
    setLoading(true);
    const q = query(collection(db, 'mikvaot'), where('cityId', '==', cityId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMikvaot(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Mikveh)));
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [cityId, active]);

  return { mikvaot, loading, error };
}
