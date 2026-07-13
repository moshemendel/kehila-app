import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { auth, db } from './firebase';
import { AppUser, UserRole } from '../types';
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
  return cred.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signInWithGoogleCredential(idToken: string): Promise<User> {
  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
  const exists = await userDocExists(cred.user.uid);
  if (!exists) {
    await createUserDoc(cred.user, '', 'user');
  }
  return cred.user;
}

export async function logout(): Promise<void> {
  // Must run before signOut — deleting the token doc requires still being authenticated.
  await clearPushToken().catch(() => {});
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

async function userDocExists(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists();
}

export async function getUserDoc(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as AppUser;
}
