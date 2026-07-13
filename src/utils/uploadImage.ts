import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebase';

/**
 * Uploads a local image URI to Firebase Storage and returns the download URL.
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
  // Build a real Blob via XHR (works on both Android and iOS)
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload  = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('לא ניתן לקרוא את הקובץ'));
    xhr.responseType = 'blob';
    xhr.open('GET', localUri, true);
    xhr.send(null);
  });

  const storageRef = ref(storage, storagePath);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);

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
