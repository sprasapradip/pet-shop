/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/views/**/*.ejs', './public/assets/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f4',
          100: '#d5ece4',
          200: '#acd9ca',
          300: '#7bbfa9',
          400: '#4da087',
          500: '#2f846c',
          600: '#226a56',
          700: '#1d5546',
          800: '#1a4439',
          900: '#163830',
        },
        accent: {
          400: '#f6b445',
          500: '#ee9a1a',
          600: '#d27b0f',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
