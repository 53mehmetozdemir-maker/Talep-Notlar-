import type { Role } from '../../lib/roles';
import type { TalepRecord } from '../../lib/types';

/** Eski kuralla aynı: admin hepsini, standart yalnızca kendi kaydını düzenler/siler. */
export function canModifyRecord(role: Role, userEmail: string | null | undefined, record: TalepRecord): boolean {
  if (role === 'admin') return true;
  return role !== 'gözlemci' && !!userEmail && record.user === userEmail;
}
