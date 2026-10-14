import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { storage } from '../services/firebase';

/**
 * Longest edge, in pixels, of anything this app uploads. Every image here is
 * shown on a phone screen — a detail-page header, a gallery circle, an eruv
 * report a manager opens — and 1280px is already more than any of those draws.
 * A straight-from-camera photo is 4000px+ and 2–5MB; at this size it is
 * ~150–250KB, which is what every later viewer downloads.
 */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

/**
 * Resized, re-encoded copy of a local image, or the original if that fails.
 *
 * This is the one place compression happens, so the pickers hand over full
 * quality instead of compressing twice. Re-encoding also drops the EXIF block,
 * which on a phone photo carries the GPS position it was taken at — not
 * something an eruv report or a gallery photo should publish.
 *
 * A failure here must never block the upload itself: the original is still a
 * valid image, just a heavier one.
 */
async function shrink(localUri: string): Promise<{ uri: string; jpeg: boolean }> {
  try {
    const original = await ImageManipulator.manipulate(localUri).renderAsync();
    const { width, height } = original;
    const context = ImageManipulator.manipulate(original);
    if (Math.max(width, height) > MAX_EDGE) {
      context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    return { uri: saved.uri, jpeg: true };
  } catch (e) {
    console.warn('[uploadImage] resize failed, uploading the original:', e);
    return { uri: localUri, jpeg: false };
  }
}

/**
 * Uploads a local image URI to Firebase Storage and returns the download URL.
 * The image is resized and re-encoded as JPEG first (see shrink above), so a
 * caller's `storagePath` extension is replaced with `.jpg` to match.
 *
 * NOTE: We use XMLHttpRequest instead of fetch().blob() because on Android
 * the Hermes JS engine returns a non-standard Blob that Firebase Storage
 * rejects with "storage/unknown". XHR always produces a proper Blob.
 */
export async function uploadImage(
  localUri:    string,
  storagePath: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { uri, jpeg } = await shrink(localUri);
  const path = jpeg ? storagePath.replace(/\.[a-z0-9]+$/i, '.jpg') : storagePath;

  // Build a real Blob via XHR (works on both Android and iOS)
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload  = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

  const storageRef = ref(storage, path);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, jpeg ? { contentType: 'image/jpeg' } : undefined);

    task.on(
      'state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes > 0) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}
