import type { ReactNode } from 'react';

/** Arama için: küçük harf + Türkçe karakterleri sadeleştirme. Uzunluğu korur. */
const MAP: Record<string, string> = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const low = s.charAt(i).toLocaleLowerCase('tr').charAt(0) || s.charAt(i);
    out += MAP[low] ?? low;
  }
  return out;
}

export function searchTerms(q: string): string[] {
  return fold(q).split(/\s+/).filter(Boolean);
}

const SENSITIVE_TAGS = ['şifre', 'sunucu bağlantı', 'bearer', 'hd', 'vpn'];
const SENSITIVE_WORDS = /(şifre|sifre|password|parola|secret|token|bearer|api[_ -]?key|vpn|teamviewer|anydesk)/i;
const CODE_START = /^\s*(--|\/\*|select|declare|update|insert|delete|with|create|alter|exec|use|set|if|drop|truncate)\b/i;

export function isCodeNote(tags: string[], content: string): boolean {
  return tags.some((t) => fold(t) === 'sql kodlari') || CODE_START.test(content);
}

/** Gizli sayılan notlar varsayılan olarak bulanık gösterilir. */
export function isSensitiveNote(tags: string[], content: string): boolean {
  if (tags.some((t) => SENSITIVE_TAGS.includes(t.toLocaleLowerCase('tr')))) return true;
  return !isCodeNote(tags, content) && SENSITIVE_WORDS.test(content);
}

export function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const f = fold(text);
  const ranges: [number, number][] = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const i = f.indexOf(t, from);
      if (i < 0) break;
      ranges.push([i, i + t.length]);
      from = i + t.length;
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], i) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(<mark key={i}>{text.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

const SQL_KEYWORDS =
  'select|from|where|and|or|not|in|is|null|like|between|exists|case|when|then|else|end|as|on|join|inner|left|right|outer|full|cross|group|by|order|having|top|distinct|union|all|insert|into|values|update|set|delete|create|alter|drop|table|index|view|procedure|function|declare|begin|exec|execute|with|over|partition|desc|asc|if|while|return|truncate|rollback|commit|transaction|use|go|print|cast|convert|isnull|coalesce|count|sum|avg|min|max|datepart|dateadd|datediff|getdate|round|len|substring|replace|rtrim|ltrim|upper|lower|row_number|primary|key|default|identity|nolock|with';

const SQL_RE = new RegExp(
  `(--[^\\n]*|/\\*[\\s\\S]*?\\*/)|('(?:[^']|'')*')|(\\b(?:${SQL_KEYWORDS})\\b)|(@@?\\w+)|(\\b\\d+(?:\\.\\d+)?\\b)`,
  'gi',
);

/** Basit SQL renklendirme (HTML enjekte etmeden, sadece span üretir). */
export function highlightSql(code: string, terms: string[]): ReactNode {
  const out: ReactNode[] = [];
  let pos = 0;
  let n = 0;
  for (const m of code.matchAll(SQL_RE)) {
    const i = m.index ?? 0;
    if (i > pos) out.push(<span key={n++}>{highlight(code.slice(pos, i), terms)}</span>);
    const cls = m[1] ? 'sq-c' : m[2] ? 'sq-s' : m[3] ? 'sq-k' : m[4] ? 'sq-v' : 'sq-n';
    out.push(
      <span key={n++} className={cls}>
        {highlight(m[0], terms)}
      </span>,
    );
    pos = i + m[0].length;
  }
  if (pos < code.length) out.push(<span key="end">{highlight(code.slice(pos), terms)}</span>);
  return out;
}

const LINE_KV = /^(\s*)([^:=\n]{1,40}?)\s*[:=]\s*(\S.*)$/;

export function splitKeyValue(line: string): { label: string; value: string } | null {
  const m = LINE_KV.exec(line);
  if (!m) return null;
  const value = m[3].trim();
  // "http://..." gibi adreslerde ilk ":" etiket sayılmasın
  if (/^\/\//.test(value)) return null;
  return { label: m[2].trim(), value };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'not';
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'bilinmeyen hata';
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
