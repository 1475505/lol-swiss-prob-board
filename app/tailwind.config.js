/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{svelte,js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        board: {
          bg: '#0f172a'
        }
      }
    }
  },
  plugins: []
}