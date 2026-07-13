import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Gemach } from '../types';

export function useGemachs(cityId: string) {
  const [gemachs, setGemachs] = useState<Gemach[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) return;
    const q = query(
      collection(db, 'gemachs'),
      where('cityId', '==', cityId),
      where('isActive', '==', true),
    );
    return onSnapshot(
      q,
      snap => {
        setGemachs(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Gemach));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [cityId]);

  return { gemachs, loading };
}
