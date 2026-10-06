/** @type {import('tailwindcss').Config} */
// Design system (UI/UX Pro Max): "Soft UI Evolution" style, caring teal + warm orange CTA,
// Figtree type. Contrast checked: brand-700 on white 5.4:1, accent-700 on white 5.2:1.
export default {
  content: ['./src/views/**/*.ejs', './src/lib/icons.ts', './public/assets/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
        },
        ink: {
          DEFAULT: '#0f2f2c',
          muted: '#4b5f5c',
        },
      },
      fontFamily: {
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(15 47 44 / 0.04), 0 2px 8px rgb(15 47 44 / 0.06)',
        lift: '0 2px 4px rgb(15 47 44 / 0.05), 0 12px 28px -6px rgb(15 47 44 / 0.14)',
        cta: '0 6px 16px -4px rgb(194 65 12 / 0.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
