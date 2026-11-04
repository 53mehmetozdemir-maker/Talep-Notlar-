const KEY = 'talep-theme';
type Theme = 'dark' | 'light';

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* localStorage kapalıysa tema yalnızca bu oturumda geçerli olur */
  }
}

export function initTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* yoksay */
  }
  apply(saved === 'light' ? 'light' : 'dark');
}

export function toggleTheme(): void {
  const current = document.documentElement.getAttribute('data-theme');
  apply(current === 'dark' ? 'light' : 'dark');
}
