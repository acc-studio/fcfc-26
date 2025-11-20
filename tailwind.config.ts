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
        pitch: {
          900: '#0F1A15', // Deepest Green
          800: '#16261F', // Card Background
          700: '#1E332A', // Hover states
        },
        paper: '#E8E6D9', // Text color (Bone)
        gold: '#D4AF37',  // Accents
        signal: '#FF4500', // Alerts
        chalk: 'rgba(232, 230, 217, 0.15)', // Borders
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