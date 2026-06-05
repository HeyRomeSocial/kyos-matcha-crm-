/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        green: {
          primary: '#3D6034',
          light: '#EEF3EC',
          mid: '#2E4A27',
          50: '#EEF3EC',
          100: '#d8e8d4',
          200: '#b3d0ab',
          600: '#3D6034',
          700: '#2E4A27',
          800: '#1f3219',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
