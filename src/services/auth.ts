import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  getAdditionalUserInfo,
  sendPasswordResetEmail,
  sendEmailVerification,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { AppUser, UserRole } from '../types';

/**
 * Where AuthContext keeps the last-known account document, so a cold start
 * can render immediately instead of holding the splash open for a Firestore
 * round-trip. Keyed by uid, so two accounts on one device never read each
 * other's copy.
 */
export const appUserCacheKey = (uid: string) => `@appuser_${uid}`;
import { clearPushToken } from './pushNotifications';

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
  cityId: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await createUserDoc(cred.user, cityId, 'user');
  // Fire-and-forget: a bounced or throttled verification mail must not fail a
  // registration that already succeeded. The user can resend from the banner.
  sendEmailVerification(cred.user).catch(() => {});
  return cred.user;
}

/**
 * Send the "reset your password" email.
 *
 * Deliberately does not report whether the address is registered — with email
 * enumeration protection on, Firebase resolves successfully either way, and
 * telling a caller "no such user" would hand out the membership list.
 */
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** Re-send the verification link to the signed-in user. */
export async function resendVerificationEmail(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('not-signed-in');
  await sendEmailVerification(user);
}

/**
 * Pull fresh auth state from the server.
 *
 * `emailVerified` is baked into the cached ID token, so it stays false locally
 * until the token refreshes — clicking the link in the mail changes nothing in
 * the app until this runs.
 */
export async function reloadAuthUser(): Promise<User | null> {
  const user = auth.currentUser;
  if (!user) return null;
  await user.reload();
  return auth.currentUser;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/**
 * Returns whether the profile document was created here, because the caller
 * needs to know: only a brand-new account requires a forced reload, and doing
 * it for everyone was costing a full Firestore round trip on every Google
 * sign-in (see LoginScreen).
 *
 * MEASURED, not assumed. Signing in with Google took 7-8 seconds against 2-3
 * for a password, and logcat put 3.4 of those seconds in the stretch after
 * Firebase returned, with nothing running but Firestore: this function's
 * existence check, the load that onAuthStateChanged does anyway, and a third
 * read from the caller's refreshUser. Three sequential round trips on a channel
 * that has just had its auth token swapped, where the password path does one.
 *
 * isNewUser comes back with the credential itself, so the existence check costs
 * nothing now. It answers a slightly different question — new to Firebase Auth,
 * rather than "has a profile document" — and the gap between them is an account
 * whose doc creation failed after its first sign-in. That account would land on
 * appUser null, which is exactly where the email/password path has always left
 * it; this is not a guarantee being given up, it is one that only Google
 * sign-in ever pretended to make.
 */
export async function signInWithGoogleCredential(
  idToken: string,
): Promise<{ user: User; created: boolean }> {
  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
  const created = getAdditionalUserInfo(cred)?.isNewUser ?? false;
  if (created) {
    await createUserDoc(cred.user, '', 'user');
  }
  return { user: cred.user, created };
}

export async function logout(): Promise<void> {
  // Must run before signOut — deleting the token doc requires still being authenticated.
  await clearPushToken().catch(() => {});
  // Drop the cached account document too. Nothing else would read it (the key
  // is uid-scoped, so a different account signing in on this device cannot see
  // it), but leaving someone's name, roles and city on disk after they have
  // explicitly signed out is not what signing out should mean.
  const uid = auth.currentUser?.uid;
  if (uid) await AsyncStorage.removeItem(appUserCacheKey(uid)).catch(() => {});
  await signOut(auth);
  // Also clears the native Google session — otherwise GoogleSignin.signIn() silently
  // re-authenticates with the same cached account next time instead of showing the
  // account picker, making it impossible to switch Google accounts. Harmless no-op
  // if the user never signed in with Google.
  await GoogleSignin.signOut().catch(() => {});
}

async function createUserDoc(user: User, cityId: string, role: UserRole): Promise<void> {
  await setDoc(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? null,
    cityId,
    // Starts equal to cityId; only ever changes if an admin reassigns this account
    // later (e.g. promoting them to city_admin for a different city) — never touched
    // by the personal "switch city" browsing preference.
    homeCityId: cityId,
    role,
    managedSynagogueIds: [],
    managedRestaurantIds: [],
    createdAt: serverTimestamp(),
  });
}


export async function getUserDoc(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}
