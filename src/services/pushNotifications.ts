import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth, db } from './firebase';

const DEVICE_ID_KEY = 'kehila_device_id_v1';

// pushTokens is keyed by device, not by user — otherwise the same phone logging into two
// different accounts (e.g. a tester switching between roles) ends up with two Firestore
// docs pointing at the identical Expo token, and a broadcast reaching both accounts pushes
// to that one phone twice. A device keeps the same id for as long as the app stays
// installed; reinstalling is treated as a fresh device, which is the correct behavior.
async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// Saves this device's Expo push token to Firestore so admins can target it.
// Fails silently — push token is a nice-to-have, never a hard requirement.
//
// homeAreaId lets a send be narrowed to one settlement of a regional council
// (see sendPushToCity's areaIds param) — e.g. an eruv going down in Afikim
// has no reason to page a resident of Ginosar, 20km away. Absent for a
// single-area tenant, where every send is already city-wide and correct.
export async function registerPushToken(
  uid: string, cityId: string, role: string, roles?: string[], homeAreaId?: string,
): Promise<void> {
  try {
    // THE ONE SOURCE THAT CANNOT LAG. The rule this write must satisfy is
    // `data.uid == request.auth.uid`, and request.auth.uid is whatever the Auth
    // SDK holds at the moment the write leaves — so that is what the payload has
    // to be checked against, not a React ref or a value captured earlier.
    //
    // Both earlier attempts compared against something that trails the SDK. The
    // first closed over the caller's values, and a registration queued as a
    // guest fired after the user had signed in. The second read a ref refreshed
    // inside an effect, which is better and still wrong: the account can be live
    // in the SDK while React has not yet re-rendered, and it lost by 186ms —
    // the guest payload went out between `auth resolved (fetched account)` and
    // the effect that would have updated the ref.
    //
    // Whoever is signed in now owns this device's token. If that is not who this
    // call was made for, drop it: the caller's own effect has already re-run for
    // the new identity and will register it properly.
    const current = auth.currentUser?.uid ?? null;
    if (current !== uid) {
      console.warn(`[Push] skipped — queued for ${uid}, now signed in as ${current ?? 'nobody'}`);
      return;
    }

    const deviceId = await getDeviceId();
    // projectId is required for standalone builds; obtained from EAS config.
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await setDoc(doc(db, 'pushTokens', deviceId), {
      token: tokenData.data,
      uid, cityId,
      role,
      roles: roles ?? [role],
      ...(homeAreaId ? { homeAreaId } : {}),
      updatedAt: new Date(),
    });
  } catch (e: any) {
    // The payload, not just the error. This fails as permission-denied on every
    // sign-in, and the rule compares role and roles against the account's own
    // profile document — so the message that matters is what we sent, which the
    // bare error does not say. Order counts too: the rule tests array equality,
    // so ['gabbai','kosher_manager'] is not the same as the reverse.
    //
    // Swallowed on purpose — a push token is a nice-to-have and must never
    // block a sign-in — which is exactly why it has to be loud in the log. A
    // device that never registers never receives anything, and nothing else
    // would ever say so.
    console.warn(
      `[Push] registerPushToken failed (${e?.code ?? 'unknown'}) — sent uid=${uid} ` +
      `role=${role} roles=${JSON.stringify(roles ?? [role])} cityId=${cityId}`,
    );
  }
}

// Removes this device's push registration on logout, so a signed-out device stops
// receiving pushes meant for the account that just logged out.
export async function clearPushToken(): Promise<void> {
  try {
    const deviceId = await getDeviceId();
    await deleteDoc(doc(db, 'pushTokens', deviceId));
  } catch (e) {
    console.warn('[Push] clearPushToken failed:', e);
  }
}

interface SendPushArgs {
  cityId: string; title: string; body: string;
  data?: Record<string, unknown>; areaIds?: string[]; roles?: string[];
}

// The send runs in the sendPush Cloud Function, not here: the browser blocks a
// direct POST to exp.host (no CORS headers), so the web build could save a
// change but never notify anyone. The function also does the pushTokens lookup,
// which the caller is not always allowed to read.
const callSendPush = httpsCallable<SendPushArgs, { sent: number; targeted: number }>(
  getFunctions(app, 'europe-west1'),
  'sendPush',
);

// Sends a push notification to every device registered for the given city —
// or, when areaIds is given, only devices whose owner's homeAreaId falls in
// that set. A device with no homeAreaId on record is skipped by an
// areaIds-filtered send rather than guessed at.
export async function sendPushToCity(
  cityId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  areaIds?: string[],
): Promise<void> {
  try {
    await callSendPush({ cityId, title, body, data, areaIds });
  } catch (e) {
    console.warn('[Push] sendPushToCity failed:', e);
  }
}

// Sends a push notification only to devices belonging to users with one of the given roles.
export async function sendPushToRoles(
  cityId: string,
  roles: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await callSendPush({ cityId, title, body, data, roles });
  } catch (e) {
    console.warn('[Push] sendPushToRoles failed:', e);
  }
}
