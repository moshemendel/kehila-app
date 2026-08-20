/**
 * External URLs the app links out to.
 *
 * One place, because these are the things that get wired up once and then rot
 * quietly. Any entry left as an empty string is treated as "not published yet"
 * and its row is hidden rather than rendered as a button that does nothing —
 * a dead menu row reads as a bug to the user and gets reported as one.
 *
 * PRIVACY_POLICY_URL is not optional for the Play Store: an app that requests
 * location must link a reachable policy, and the reviewer checks that the page
 * actually loads and matches the Data Safety form.
 *
 * The document lives in this repo at `public/privacy.html`. After editing it,
 * republish with:
 *   npx firebase-tools deploy --only hosting --project kehila-app-386ab
 * Deployed and live since 2026-08-16. A custom domain later only needs this
 * constant changed — nothing else references the URL.
 */

export const PRIVACY_POLICY_URL = 'https://kehila-app-386ab.web.app/privacy';

/** Optional. A short "about" page or the community's own site. */
export const ABOUT_URL = '';

/**
 * Where a user should turn for help. A mailto: for now — the same address the
 * privacy policy names for account-deletion requests, so there is one inbox to
 * watch rather than two.
 */
export const SUPPORT_URL = 'mailto:mome.apps@gmail.com?subject=%D7%A7%D7%94%D7%99%D7%9C%D7%94%20-%20%D7%A4%D7%A0%D7%99%D7%94';
