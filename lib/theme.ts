// Light/dark theme handling. The actual values live in app/globals.css (keyed
// off `data-theme` on <html>); this just flips that attribute, persists the
// choice, and keeps the mobile browser-bar (theme-color meta) in sync. The
// first-load default (follow OS, then remember) is applied by the inline
// bootstrap script in app/layout.tsx so there's no flash before React mounts.
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'pitch_theme';
const THEME_COLOR: Record<Theme, string> = { dark: '#0F1A15', light: '#E6E3D4' };

// The theme currently applied to the document (set by the bootstrap script).
export function getTheme(): Theme {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') return t;
  }
  return 'dark';
}

export function setTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLOR[theme]);
}
