import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}', './docs/articles/**/*.md'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: '#18202f',
        line: '#d8dfeb',
        panel: '#f7f9fc',
        circuit: '#0f7b6c',
        silicon: '#2856d6',
        signal: '#b23b6b',
      },
      boxShadow: {
        soft: '0 18px 50px rgba(30, 41, 59, 0.08)',
      },
    },
  },
  plugins: [typography],
};
