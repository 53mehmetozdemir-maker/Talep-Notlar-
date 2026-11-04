export type Role = 'gözlemci' | 'standart' | 'admin';

export function parseRole(value: unknown): Role {
  return value === 'standart' || value === 'admin' ? value : 'gözlemci';
}

export const isAdmin = (role: Role): boolean => role === 'admin';
export const canCreate = (role: Role): boolean => role !== 'gözlemci';