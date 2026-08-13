import React, { useCallback, useState } from 'react';
import NavigationAppSheet from '../components/NavigationAppSheet';
import { HAS_NATIVE_CHOOSER, openNativeChooser, type NavTarget } from '../utils/navigationApps';

/**
 * One way to start navigation from anywhere in the app.
 *
 * On Android this opens the OS "open with" chooser, so every navigation app the
 * user actually has (Waze, Google Maps, Moovit, …) is offered — not just ones
 * we thought to hardcode. iOS has no such chooser, so it falls back to an
 * in-app sheet listing the apps we can deep-link.
 *
 *   const { go, sheet } = useNavigateTo();
 *   <Button onPress={() => go({ latitude, longitude })} />
 *   {sheet}
 */
export function useNavigateTo() {
  const [target, setTarget] = useState<NavTarget | null>(null);

  const go = useCallback((t: NavTarget) => {
    if (HAS_NATIVE_CHOOSER) {
      openNativeChooser(t);
    } else {
      setTarget(t);
    }
  }, []);

  // Rendered by the caller; null on Android, where the OS chooser does the job.
  const sheet = target ? (
    <NavigationAppSheet
      visible
      target={target}
      onClose={() => setTarget(null)}
    />
  ) : null;

  return { go, sheet };
}
