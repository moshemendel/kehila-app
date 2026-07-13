import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { NusachOption } from '../types';

export function useNusachOptions(cityId: string | undefined) {
  const [options, setOptions] = useState<NusachOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) { setLoading(false); return; }
    getDoc(doc(db, 'cities', cityId)).then(snap => {
      const opts = snap.data()?.nusachOptions as NusachOption[] | undefined;
      setOptions(opts ?? []);
    }).finally(() => setLoading(false));
  }, [cityId]);

  const addOption = async (label: string): Promise<boolean> => {
    if (!cityId || !label.trim()) return false;
    const trimmed = label.trim();
    if (options.some(o => o.label === trimmed || o.key === trimmed)) return false;
    const newOpt: NusachOption = { key: trimmed, label: trimmed };
    await updateDoc(doc(db, 'cities', cityId), {
      nusachOptions: arrayUnion(newOpt),
    });
    setOptions(prev => [...prev, newOpt]);
    return true;
  };

  const labelFor = (key: string) =>
    options.find(o => o.key === key)?.label ?? key;

  return { options, loading, addOption, labelFor };
}
