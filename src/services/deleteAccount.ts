import { getFunctions, httpsCallable } from 'firebase/functions';
import app from './firebase';

/**
 * Deletes the signed-in account, from the server.
 *
 * Not done here on the client: firestore.rules deliberately has no delete on
 * users/{uid} — removing the profile while the login still worked would leave
 * an account that can sign in with no role and no city — and the cascade
 * touches collections a user is not allowed to query. See deleteMyAccount in
 * functions/src/index.ts, which also documents what is removed and what is
 * kept with the name stripped off.
 *
 * Region matters: the functions live in europe-west1, and calling the default
 * us-central1 would fail with a bare "not found" that reads like a bug in the
 * caller.
 */
export interface DeletionSummary {
  removed: Record<string, number>;
  kept: Record<string, number>;
}

export async function deleteMyAccount(): Promise<DeletionSummary> {
  const call = httpsCallable<void, DeletionSummary>(
    getFunctions(app, 'europe-west1'),
    'deleteMyAccount',
  );
  return (await call()).data;
}
