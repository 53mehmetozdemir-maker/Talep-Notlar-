export const isImage = (name: string): boolean => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);

export function fileEmoji(name: string): string {
  if (/\.pdf$/i.test(name)) return '📄';
  if (/\.(doc|docx)$/i.test(name)) return '📝';
  if (/\.(xls|xlsx)$/i.test(name)) return '📊';
  if (isImage(name)) return '🖼';
  return '📎';
}

/** Yalnızca http(s) bağlantılarına izin verir (javascript: gibi şemaları engeller). */
export const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url);

export const fmtSize = (bytes: number): string =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
