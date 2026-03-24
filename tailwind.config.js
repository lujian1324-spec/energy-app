/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1AD9C0',
        accent: '#1AD9C0',
        success: '#34C759',
        warning: '#FF9500',
        danger: '#FF3B30',
        'bg-base': '#000000',
        'bg-card': '#1C1C1E',
        'bg-card2': '#2C2C2E',
        'txt-primary': '#FFFFFF',
        'txt-secondary': '#8E8E93',
        'txt-muted': '#48484A',
      },
      borderRadius: {
        'sm': '8px',
        'md': '14px',
        'lg': '18px',
        'xl': '24px',
        'full': '9999px',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'wave': 'wave 4s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'wave': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
