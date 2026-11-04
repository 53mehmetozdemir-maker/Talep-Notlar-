const pad = (n: number): string => String(n).padStart(2, '0');

/** Yerel saate göre YYYY-AA-GG (toISOString UTC verdiği için kullanılmıyor). */
export function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDateString(d);
}

/** Şu anki saat, "SS:DD" biçiminde (eski uygulamadaki timeNow ile aynı). */
export const timeNow = (): string =>
  new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
