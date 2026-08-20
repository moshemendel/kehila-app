/**
 * Features built but held back from the pilot.
 *
 * Nothing is deleted or unwired — each flag only changes what the user is
 * offered, so releasing a feature is flipping one boolean here and shipping an
 * OTA update. Keeping the code live also means managers can keep preparing the
 * data behind the scenes (kashrut certificates, mikveh hours) while congregants
 * see בקרוב.
 *
 * Why these three for the pilot:
 *  • kashrut        — certificate data isn't verified for every business yet,
 *                     and wrong kashrut information is the worst thing this app
 *                     could publish.
 *  • mikvehBooking  — bookings need the mikveh attendants on board first;
 *                     an empty booking system takes appointments nobody sees.
 *  • zmanimSettings — one city, one accepted calculation; letting users change
 *                     it invites "the app says a different time than the shul".
 */
export const COMING_SOON = {
  kashrut:        true,
  mikvehBooking:  true,
  zmanimSettings: true,
} as const;

export type ComingSoonKey = keyof typeof COMING_SOON;

export const isComingSoon = (key: ComingSoonKey): boolean => COMING_SOON[key];
