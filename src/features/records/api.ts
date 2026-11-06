import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { timeNow } from '../../lib/date';
import { uploadFiles } from '../../lib/storage';
import type { TalepRecord } from '../../lib/types';

export interface RecordEdit {
  no: string;
  date: string;
  dept: string;
  desc: string;
}

/** Kaydı günceller; yeni dosyaları yükleyip mevcut dosyaların yanına ekler. */
export async function saveRecordEdit(
  record: TalepRecord,
  edit: RecordEdit,
  newFiles: File[],
  onProgress?: (percent: number, fileName: string) => void,
): Promise<void> {
  const uploaded = newFiles.length ? await uploadFiles(record.id, newFiles, onProgress) : [];
  await updateDoc(doc(db, 'records', record.id), {
    ...edit,
    time: timeNow(),
    files: [...(record.files ?? []), ...uploaded],
  });
}

/** Önce Storage dosyalarını (hata olursa yok sayarak), sonra kaydı siler. */
export async function deleteRecord(record: TalepRecord): Promise<void> {
  for (const f of record.files ?? []) {
    if (!f.path) continue;
    try {
      await deleteObject(ref(storage, f.path));
    } catch (err) {
      console.warn('Dosya silinemedi (yok sayıldı):', f.path, err);
    }
  }
  await deleteDoc(doc(db, 'records', record.id));
}


/** Tek bir dosyayı önce Storage'dan, sonra kayıttan siler. */
export async function removeRecordFile(
  record: TalepRecord,
  file: NonNullable<TalepRecord['files']>[number],
): Promise<void> {
  if (file.path) {
    try {
      await deleteObject(ref(storage, file.path));
    } catch (err) {
      if ((err as { code?: string }).code !== 'storage/object-not-found') throw err;
    }
  }
  await updateDoc(doc(db, 'records', record.id), {
    files: (record.files ?? []).filter((f) => f.url !== file.url),
  });
}