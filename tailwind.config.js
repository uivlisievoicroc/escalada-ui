/* eslint-disable no-undef */
/** @type {import('tailwindcss').Config} */

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      strokeWidth: {
        11: '8px',
      }
    },
  },
  plugins: [],
}
