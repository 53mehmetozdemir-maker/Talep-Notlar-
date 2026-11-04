import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';
import type { RecordFile } from './types';

/**
 * Dosyaları sırayla `records/{recordId}/...` altına yükler.
 * Eski uygulamayla aynı yol biçimi kullanılır.
 */
export async function uploadFiles(
  recordId: string,
  files: File[],
  onProgress?: (percent: number, fileName: string) => void,
): Promise<RecordFile[]> {
  const result: RecordFile[] = [];

  for (const [i, file] of files.entries()) {
    const storageRef = ref(storage, `records/${recordId}/${Date.now()}_${file.name}`);
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        (snap) => {
          const pct = Math.round(((i + snap.bytesTransferred / snap.totalBytes) / files.length) * 100);
          onProgress?.(pct, file.name);
        },
        reject,
        () => resolve(),
      );
    });
    const url = await getDownloadURL(storageRef);
    result.push({ name: file.name, url, path: storageRef.fullPath });
  }

  return result;
}
