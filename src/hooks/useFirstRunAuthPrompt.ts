import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mark } from '../utils/startupTrace';

const SEEN_KEY = '@seen_auth_prompt';

/**
 * Whether this launch should open on the login screen — the first one after
 * install, and no other.
 *
 * The app has no login wall — a guest gets everything except what needs an
 * identity, and that stays true. But dropping straight into guest mode means
 * the choice is never put to anyone: the app works, so nothing prompts signing
 * in, and the reasons to have an account are never met. Asking once, at the
 * only moment the answer is open, is the difference between offering an
 * account and hiding one.
 *
 * THIS ANSWERS A QUESTION; IT DOES NOT NAVIGATE. That is the whole fix. It used
 * to call navigate('Auth') from a layout effect, on the theory that a layout
 * effect lands before the frame is drawn. The theory was fine and the premise
 * was wrong: RootNavigator returns the splash *instead of* the navigator, so
 * while the splash is up there is no navigator to drive, and the moment it
 * clears the navigator mounts its initial route — MainTabs — and paints the
 * home screen. Only then could any navigation run, and Auth is a modal, so it
 * then slid up over a home screen the user had already seen. No effect timing
 * can win that race, because the race is not about timing: a navigator has to
 * mount a first screen before it can be told to show a different one.
 *
 * So the caller uses this to choose initialRouteName instead, and the login
 * screen simply *is* the first screen mounted. Nothing renders before it.
 *
 * `pending` exists so the splash can be held for the answer. The read takes
 * about ten milliseconds against a splash that stays up for at least nine
 * hundred, so in practice it costs nothing — but it has to be a dependency
 * rather than a race, or a slow disk puts us straight back to a home screen
 * that flashes.
 */
export interface FirstRunOffer {
  /** Still reading — the caller should keep the splash up. */
  pending: boolean;
  /** Open on the login screen. */
  owed: boolean;
}

export function useFirstRunAuthPrompt(opts: {
  /** Auth has settled — we know whether there is an account. */
  ready: boolean;
  /** A real account or demo mode: nothing to ask. */
  signedIn: boolean;
}): FirstRunOffer {
  const { ready, signedIn } = opts;
  // null = not read yet
  const [owed, setOwed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready || owed !== null) return;

    if (signedIn) {
      // Mark it so a later sign-out does not read as a fresh install.
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
      mark('first-run prompt: already signed in, skipped');
      setOwed(false);
      return;
    }

    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (seen) {
          mark('first-run prompt: already offered');
          setOwed(false);
          return;
        }
        // Written now rather than when the screen appears: the offer is made by
        // the navigator's own initial route, so unlike the old navigate() call
        // there is no step left that can fail to happen.
        AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
        mark('first-run prompt: opening on login');
        setOwed(true);
      })
      .catch(() => setOwed(false));
  }, [ready, signedIn, owed]);

  return { pending: owed === null, owed: owed === true };
}
