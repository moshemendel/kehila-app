import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from '../navigation/navigationRef';

const SEEN_KEY = '@seen_auth_prompt';

/**
 * Offers the login screen once, on the first launch after install.
 *
 * The app has no login wall — a guest gets everything except the things that
 * need an identity, and that stays true. But dropping straight into guest mode
 * means the choice is never actually put to anyone: the app works, so there is
 * no moment that prompts signing in, and the reasons to have an account
 * (favourites that follow you, reminders, reporting wrong information) are
 * never encountered. Asking once, at the only moment the answer is genuinely
 * open, is the difference between offering an account and hiding one.
 *
 * Once, and only once. The flag is written before navigating, so a crash or a
 * force-quit on the login screen cannot turn this into a wall that greets every
 * launch. LoginScreen's own "המשך כאורח" is the way out, and it goes back to
 * the tabs the modal opened over.
 *
 * Skipped entirely for an account that is already signed in — an app restored
 * from backup, or a reinstall over an existing session — where the question has
 * already been answered.
 */
export default function FirstRunAuthPrompt() {
  const { loading, isGuest, isDemo, firebaseUser } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || loading) return;
    handled.current = true;

    const signedIn = isDemo || (!!firebaseUser && !isGuest);
    if (signedIn) {
      // Nothing to ask, but mark it so a later sign-out does not trigger the
      // prompt as if this were a fresh install.
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
      return;
    }

    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (seen) return;
        AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
        if (navigationRef.isReady()) navigationRef.navigate('Auth' as never);
      })
      .catch(() => {});
  }, [loading, isGuest, isDemo, firebaseUser]);

  return null;
}
