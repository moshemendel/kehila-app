import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
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
export async function registerPushToken(uid: string, cityId: string, role: string, roles?: string[]): Promise<void> {
  try {
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
      updatedAt: new Date(),
    });
  } catch (e) {
    console.warn('[Push] registerPushToken failed:', e);
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

interface TokenEntry { docId: string; token: string; }

// Sends a push notification to every device registered for the given city.
export async function sendPushToCity(
  cityId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    const snap = await getDocs(
      query(collection(db, 'pushTokens'), where('cityId', '==', cityId)),
    );
    const entries = snap.docs
      .map((d) => ({ docId: d.id, token: d.data().token as string }))
      .filter((e) => Boolean(e.token));
    await _sendBatch(entries, title, body, data);
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
    const snap = await getDocs(
      query(collection(db, 'pushTokens'), where('cityId', '==', cityId)),
    );
    const entries = snap.docs
      .filter((d) => roles.includes(d.data().role as string))
      .map((d) => ({ docId: d.id, token: d.data().token as string }))
      .filter((e) => Boolean(e.token));
    await _sendBatch(entries, title, body, data);
  } catch (e) {
    console.warn('[Push] sendPushToRoles failed:', e);
  }
}

async function _sendBatch(
  entries: TokenEntry[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!entries.length) return;
  // Expo Push API accepts up to 100 messages per request.
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        chunk.map(({ token }) => ({ to: token, title, body, data: data ?? {}, sound: 'default' })),
      ),
    });
    const json = await res.json().catch(() => null) as { data?: { status: string; details?: { error?: string } }[] } | null;
    // A device that's been uninstalled reports DeviceNotRegistered — prune it so it
    // doesn't keep showing up as a recipient (mirrors the same cleanup on the admin side).
    json?.data?.forEach((ticket, idx) => {
      if (ticket.status !== 'ok' && ticket.details?.error === 'DeviceNotRegistered') {
        const docId = chunk[idx]?.docId;
        if (docId) deleteDoc(doc(db, 'pushTokens', docId)).catch(() => {});
      }
    });
  }
}
