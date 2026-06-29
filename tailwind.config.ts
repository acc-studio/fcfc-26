import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens — values come from CSS variables (see globals.css),
        // so flipping `data-theme` on <html> recolors the whole app. The
        // `rgb(... / <alpha-value>)` form keeps Tailwind opacity modifiers
        // (e.g. text-paper/40, bg-pitch-800/30) working.
        pitch: {
          900: 'rgb(var(--c-pitch-900) / <alpha-value>)', // Deepest Green / page bg
          800: 'rgb(var(--c-pitch-800) / <alpha-value>)', // Card Background
          700: 'rgb(var(--c-pitch-700) / <alpha-value>)', // Hover states
        },
        paper: 'rgb(var(--c-paper) / <alpha-value>)',   // Text color (Bone) / ink
        gold: 'rgb(var(--c-gold) / <alpha-value>)',     // Accents
        signal: 'rgb(var(--c-signal) / <alpha-value>)', // Alerts
        chalk: 'var(--c-chalk)',                        // Borders (alpha baked in)
        card: 'rgb(var(--c-card) / <alpha-value>)',           // tactile card surface
        'card-arbiter': 'rgb(var(--c-card-arbiter) / <alpha-value>)', // arbiter-mode card
        active: 'rgb(var(--c-active) / <alpha-value>)',       // selected-item highlight (theme-aware)
      },
      fontFamily: {
        serif: ['var(--font-fraunces)', 'serif'],
        mono: ['var(--font-chivo)', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;