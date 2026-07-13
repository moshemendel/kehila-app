import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const STORAGE_KEY_BASE = '@favorite_synagogues_v5';

function storageKey(uid: string | undefined): string {
  return uid ? `${STORAGE_KEY_BASE}_${uid}` : STORAGE_KEY_BASE;
}

export type PrayerType = 'shacharit' | 'mincha' | 'maariv';

/**
 * Array of slot indices selected for a specific prayer type.
 * Non-empty → those exact slots are watched.
 */
export type SlotIndices = number[];

/**
 * Per-prayer, per-slot selection.
 *  undefined  → prayer not watched
 *  number[]   → watch those slot indices (must be non-empty)
 */
export interface FavoriteCustom {
  // Prayers
  shacharit?: SlotIndices;
  mincha?:    SlotIndices;
  maariv?:    SlotIndices;
  // Shiurim (index into the combined synagogue shiurim list)
  // 'all'      → notify for every shiur
  // number[]   → notify for specific shiurim
  // undefined  → no shiurim notifications
  shiurim?: SlotIndices | 'all';
}

/**
 * 'all'          → all prayers + all shiurim
 * FavoriteCustom → fine-grained prayer / slot / shiur selection
 */
export type FavoriteSetting = 'all' | FavoriteCustom;

/** synagogueId → FavoriteSetting */
export type FavoritesMap = Record<string, FavoriteSetting>;

interface FavoritesContextValue {
  favorites:          FavoritesMap;
  isFavorite:         (id: string) => boolean;
  getFavoriteSetting: (id: string) => FavoriteSetting | null;
  setFavorite:        (id: string, setting: FavoriteSetting) => void;
  removeFavorite:     (id: string) => void;
}

const Ctx = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  const [favorites, setFavorites] = useState<FavoritesMap>({});

  // Reload from the user-scoped slot whenever the UID changes (login / logout / switch)
  useEffect(() => {
    setFavorites({});
    AsyncStorage.getItem(storageKey(uid)).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      } catch {}
    });
  }, [uid]);

  function persist(map: FavoritesMap) {
    AsyncStorage.setItem(storageKey(uid), JSON.stringify(map));
  }

  const isFavorite = useCallback(
    (id: string) => Object.prototype.hasOwnProperty.call(favorites, id),
    [favorites],
  );

  const getFavoriteSetting = useCallback(
    (id: string): FavoriteSetting | null => favorites[id] ?? null,
    [favorites],
  );

  const setFavorite = useCallback((id: string, setting: FavoriteSetting) => {
    setFavorites((prev) => {
      const next = { ...prev, [id]: setting };
      persist(next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = { ...prev };
      delete next[id];
      persist(next);
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ favorites, isFavorite, getFavoriteSetting, setFavorite, removeFavorite }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFavorites must be inside FavoritesProvider');
  return ctx;
}
