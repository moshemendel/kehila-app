import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/navigationRef';
import { mark } from '../utils/startupTrace';

const SEEN_KEY = '@seen_auth_prompt';

/**
 * Offers the login screen once, on the first launch after install.
 *
 * The app has no login wall — a guest gets everything except what needs an
 * identity, and that stays true. But dropping straight into guest mode means
 * the choice is never put to anyone: the app works, so nothing prompts signing
 * in, and the reasons to have an account are never met. Asking once, at the
 * only moment the answer is open, is the difference between offering an
 * account and hiding one.
 *
 * WHY THIS IS A HOOK RATHER THAN A COMPONENT IN THE TREE. As a component it
 * could only mount after the splash cleared, which put the disk read *after*
 * the first screen had already painted: the app flashed the home screen, then
 * jumped. The read now happens while the splash is still up — it has hundreds
 * of milliseconds of cover and needs about ten — and the jump itself runs in a
 * layout effect, which lands before the frame is drawn rather than after it.
 *
 * The plain effect below is a fallback for the case where the navigator is not
 * mounted yet at layout time. It restores the old behaviour, flash included,
 * rather than losing the offer altogether.
 *
 * Once, and only once, counted from the navigation actually happening — an
 * offer that could not be made leaves the flag unwritten so the next launch
 * tries again. LoginScreen's own "המשך כאורח" is the way out, and goes back to
 * the tabs underneath.
 */
export function useFirstRunAuthPrompt(opts: {
  /** True while the splash is still covering the screen. */
  splashVisible: boolean;
  /** Auth has settled — we know whether there is an account. */
  ready: boolean;
  /** A real account or demo mode: nothing to ask. */
  signedIn: boolean;
}): void {
  const { splashVisible, ready, signedIn } = opts;
  // null = not read yet, true = owed an offer, false = settled
  const [shouldOffer, setShouldOffer] = useState<boolean | null>(null);
  const asked = useRef(false);

  // Read while the splash is still up, so the answer is in hand by the time
  // the first real screen renders.
  useEffect(() => {
    if (!ready || shouldOffer !== null) return;
    if (signedIn) {
      // Mark it so a later sign-out does not read as a fresh install.
      AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
      mark('first-run prompt: already signed in, skipped');
      setShouldOffer(false);
      return;
    }
    AsyncStorage.getItem(SEEN_KEY)
      .then((seen) => {
        if (seen) mark('first-run prompt: already offered');
        setShouldOffer(!seen);
      })
      .catch(() => setShouldOffer(false));
  }, [ready, signedIn, shouldOffer]);

  const offer = () => {
    if (asked.current || !navigationRef.isReady()) return false;
    asked.current = true;
    navigationRef.navigate('Auth' as never);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
    return true;
  };

  // Before the frame is drawn — this is what keeps the home screen from
  // appearing first.
  useLayoutEffect(() => {
    if (splashVisible || shouldOffer !== true) return;
    if (offer()) mark('first-run prompt: offered');
  });

  // Only reached when the navigator was not ready at layout time.
  useEffect(() => {
    if (splashVisible || shouldOffer !== true || asked.current) return;
    if (offer()) mark('first-run prompt: offered (deferred)');
  });
}
