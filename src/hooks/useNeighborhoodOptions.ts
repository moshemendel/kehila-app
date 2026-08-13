import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';

// Mirrors useNusachOptions — a city's neighborhood list lives on the city doc
// itself (City.neighborhoods) so every screen that needs to pick one (mikveh,
// synagogue, business) offers a consistent, growing dropdown instead of free
// text that inevitably drifts ("רמת אשכול" vs "רמת אשכול ב'" vs typos).
export function useNeighborhoodOptions(cityId: string | undefined) {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) { setLoading(false); return; }
    getDoc(doc(db, 'cities', cityId)).then((snap) => {
      const opts = snap.data()?.neighborhoods as string[] | undefined;
      setOptions(opts ?? []);
    }).finally(() => setLoading(false));
  }, [cityId]);

  const addOption = async (name: string): Promise<boolean> => {
    if (!cityId || !name.trim()) return false;
    const trimmed = name.trim();
    if (options.includes(trimmed)) return false;
    await updateDoc(doc(db, 'cities', cityId), {
      neighborhoods: arrayUnion(trimmed),
    });
    setOptions((prev) => [...prev, trimmed]);
    return true;
  };

  return { options, loading, addOption };
}
