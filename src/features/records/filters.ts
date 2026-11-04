import type { TalepRecord } from '../../lib/types';

export interface RecordFilters {
  search: string;
  dept: string;
  start: string;
  end: string;
}

export function filterRecords(records: TalepRecord[], f: RecordFilters): TalepRecord[] {
  const s = f.search.toLowerCase();
  return records
    .filter((r) => {
      const matchSearch = String(r.no).includes(s) || (r.desc ?? '').toLowerCase().includes(s);
      const matchDate = (!f.start || r.date >= f.start) && (!f.end || r.date <= f.end);
      const matchDept = !f.dept || r.dept === f.dept;
      return matchSearch && matchDate && matchDept;
    })
    .sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? '')));
}
