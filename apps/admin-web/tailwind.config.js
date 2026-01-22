/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'neo-yellow': '#FFE135',
        'neo-cyan': '#00D4FF',
        'neo-magenta': '#FF3366',
        'neo-lime': '#BFFF00',
        'neo-cream': '#FFFEF0',
        primary: '#FFE135',
        secondary: '#00D4FF',
        success: '#BFFF00',
        error: '#FF3366',
        warning: '#f59e0b',
      },
      boxShadow: {
        'neo-sm': '3px 3px 0px 0px #000000',
        'neo': '5px 5px 0px 0px #000000',
        'neo-lg': '7px 7px 0px 0px #000000',
      },
      fontFamily: {
        'neo': ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
