// File path: tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  // We do not need the broken 'preset' import.
  // Tailwind v4 and @tailwindcss/postcss handle this.
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;