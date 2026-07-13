/**
 * Biometric / device-PIN gate for the management area.
 *
 * Signed-in sessions persist across cold restarts (see services/firebase.ts),
 * which is great UX but means a lost/borrowed phone could reach the manager
 * screens. To protect that destructive surface — without forcing managers to
 * re-enter an SMS code constantly — we require a quick biometric (Face ID /
 * fingerprint) or device-PIN check when *entering* the management area.
 *
 * Security note: this is a convenience barrier on top of Firestore security
 * rules, which already enforce the manager role server-side on every write.
 */

import * as LocalAuthentication from 'expo-local-authentication';

// Once authenticated, stay unlocked briefly so navigating between management
// screens (e.g. ManageMikveh → ManageAppointments) doesn't re-prompt.
const UNLOCK_WINDOW_MS = 5 * 60 * 1000;
let unlockedUntil = 0;

/**
 * Returns true if the user may enter the management area.
 * Prompts for biometric/PIN when needed; resolves false if the user cancels
 * or fails authentication.
 */
export async function requireManagerAuth(): Promise<boolean> {
  // Still within the unlock window — no re-prompt.
  if (Date.now() < unlockedUntil) return true;

  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());

  // Device has no biometrics or PIN configured — we can't gate locally.
  // Allow through; the server-side role rules remain the real protection.
  if (!enrolled) {
    unlockedUntil = Date.now() + UNLOCK_WINDOW_MS;
    return true;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'אימות זהות לכניסה לאזור הניהול',
    cancelLabel: 'ביטול',
    disableDeviceFallback: false, // fall back to device PIN if biometrics fail
  });

  if (result.success) {
    unlockedUntil = Date.now() + UNLOCK_WINDOW_MS;
    return true;
  }
  return false;
}

/** Re-lock the management area immediately (e.g. on logout). */
export function lockManagerArea(): void {
  unlockedUntil = 0;
}
