import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

const TAB_SCREENS = new Set([
  'Home', 'Synagogues', 'PrayerTimes', 'Zmanim',
  'Restaurants', 'Mikveh', 'Events', 'Eruv', 'Gemach', 'Profile',
]);

/**
 * Navigate to a screen from a notification data payload.
 * Tab screens are wrapped through MainTabs so the tab bar is correct.
 * Stack screens (EventDetail, KashrutUpdates, …) push directly.
 */
export function navigateFromNotification(
  screen: string,
  params?: Record<string, unknown>,
): void {
  if (!navigationRef.isReady()) return;
  if (TAB_SCREENS.has(screen)) {
    navigationRef.navigate('MainTabs' as never, { screen, params } as never);
  } else {
    navigationRef.navigate(screen as never, params as never);
  }
}
