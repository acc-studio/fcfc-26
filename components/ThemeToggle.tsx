'use client';
import { getTheme, setTheme } from '@/lib/theme';

// Light/dark switch. The document's theme is applied pre-paint by the bootstrap
// script (app/layout.tsx); this button just flips it on tap. The icon is driven
// entirely from CSS off `data-theme` (see globals.css `.theme-toggle`), so there
// is no React state, no effect, and no hydration mismatch.
export const ThemeToggle = () => {
  const toggle = () => setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light or dark mode"
      title="Toggle theme"
      className="theme-toggle shrink-0 rounded border border-chalk px-2.5 py-1.5 font-mono text-sm leading-none text-paper/50 transition-colors hover:border-gold/50 hover:text-paper"
    />
  );
};
