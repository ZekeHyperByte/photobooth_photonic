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
      spacing: {
        safe: '16px',
      },
      fontSize: {
        touch: '20px',
        display: '48px',
        'display-xl': '56px',
        'display-lg': '36px',
        'code-input': '48px',
      },
      minWidth: {
        'touch-sm': '100px',
        'touch-md': '130px',
        'touch-lg': '160px',
      },
      minHeight: {
        'touch-sm': '48px',
        'touch-md': '56px',
        'touch-lg': '64px',
      },
      boxShadow: {
        'neo-sm': '3px 3px 0px 0px #000000',
        'neo': '5px 5px 0px 0px #000000',
        'neo-lg': '7px 7px 0px 0px #000000',
      },
      borderRadius: {
        'neo': '0px',
      },
      borderWidth: {
        'neo': '4px',
      },
      fontFamily: {
        'neo': ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'countdown-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
      },
      animation: {
        'scale-in': 'scale-in 0.3s ease-out forwards',
        'countdown-pulse': 'countdown-pulse 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
};
