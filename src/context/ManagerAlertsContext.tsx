/**
 * Counts of things waiting for a manager/admin — the "!" badge on the tab
 * bar, the same numbers on Home and Profile.
 *
 * useManagerAlerts() opens up to four live listeners internally (content
 * reports, pending gemachs, pending events, eruv reports — however many the
 * caller's roles permit). It was called from three places at once —
 * MainTabNavigator (mounted for the whole session, since the tab bar always
 * needs the badge count), HomeScreen, and ProfileScreen — meaning an admin
 * with every role could have three copies of up to four listeners each
 * running simultaneously for identical data. Same shape as the
 * synagogues/businesses duplication, same fix: one hook instance, mounted
 * once, shared.
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useManagerAlerts, ManagerAlerts } from '../hooks/useManagerAlerts';

const EMPTY: ManagerAlerts = {
  reports: 0, pendingGemachs: 0, pendingEvents: 0, eruvReports: 0, total: 0,
};

const ManagerAlertsContext = createContext<ManagerAlerts>(EMPTY);

export function ManagerAlertsProvider({ children }: { children: ReactNode }) {
  const alerts = useManagerAlerts();
  return (
    <ManagerAlertsContext.Provider value={alerts}>
      {children}
    </ManagerAlertsContext.Provider>
  );
}

export function useManagerAlertsFeed(): ManagerAlerts {
  return useContext(ManagerAlertsContext);
}
