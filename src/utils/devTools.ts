/**
 * Developer-only affordances, and the switch that hides them.
 *
 * A dev build carries a few controls that exist purely to make testing
 * possible — the 🕯️ button that forces the Shabbat lock screen on, its bypass,
 * and the demo login that opens every role without Firebase. They are already
 * gated on `__DEV__`, so a released build never shows them.
 *
 * The gap this closes: a DEMO of a dev build — showing the app to the Religious
 * Council, recording a walkthrough, taking screenshots for a deck — is still a
 * dev build, and those controls make it read as unfinished to someone who
 * doesn't know what they are. Flip PRESENTATION_MODE on and the running app
 * looks exactly like the store build, with no rebuild and no code deletion.
 *
 * Remember to flip it back — with it on you lose the ability to preview the
 * Shabbat lock and to enter demo mode.
 */
export const PRESENTATION_MODE = false;

/** True only in a dev build that is not currently being presented. */
export const SHOW_DEV_TOOLS = __DEV__ && !PRESENTATION_MODE;
