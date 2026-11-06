import * as XLSX from 'xlsx';
import type { TalepRecord } from '../../lib/types';
import { localDate } from '../../lib/localdate';

const isImage = (n: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(n);

/** Süzülmüş talepleri Excel dosyası olarak indirir (eski uygulamayla aynı sütunlar). */
export function exportRecordsToExcel(records: TalepRecord[]): void {
  const maxImgs = Math.max(0, ...records.map((r) => (r.files ?? []).filter((f) => isImage(f.name)).length));

  const headers = ['Talep No', 'Tarih', 'Saat', 'Bölüm', 'Açıklama', 'Ekleyen', 'Dosya Sayısı'];
  for (let i = 0; i < maxImgs; i++) headers.push('Görsel ' + (i + 1));

  const aoa: unknown[][] = [headers];
  for (const r of records) {
    const imgs = (r.files ?? []).filter((f) => isImage(f.name));
    const row: unknown[] = [r.no, r.date, r.time ?? '', r.dept ?? '', r.desc ?? '', r.user ?? '', (r.files ?? []).length];
    for (let i = 0; i < maxImgs; i++) {
      const img = imgs[i];
      if (img) {
        const label = 'Görsel ' + (i + 1);
        const url = img.url.replace(/"/g, '""');
        row.push({ f: `HYPERLINK("${url}","${label}")`, t: 's', v: label });
      } else {
        row.push('');
      }
    }
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 50 }, { wch: 28 }, { wch: 12 },
    ...Array.from({ length: maxImgs }, () => ({ wch: 16 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Talepler');
  XLSX.writeFile(wb, 'Talep_Raporu_' + localDate() + '.xlsx');
}