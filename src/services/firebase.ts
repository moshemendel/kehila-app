import { initializeApp, getApps } from 'firebase/app';
// getReactNativePersistence ships in Firebase's React Native build but is not
// in the web type definitions, so TS doesn't see it — the import resolves
// correctly at runtime thanks to metro.config.js (package exports disabled).
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC65pFWSyXz7vZrTdHQRLGXh3fg_Prov5g",
  authDomain: "kehila-app-386ab.firebaseapp.com",
  projectId: "kehila-app-386ab",
  storageBucket: "kehila-app-386ab.firebasestorage.app",
  messagingSenderId: "991729726938",
  appId: "1:991729726938:web:929b7f639020bf3cf5bce3",
  measurementId: "G-EY4HPXF834"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Persist the auth session to AsyncStorage so signed-in users (and managers)
// stay logged in across cold restarts. Sensitive areas (management) are
// additionally protected by a biometric/PIN gate — see utils/managerAuth.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
