/** @type {import('tailwindcss').Config}
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │  Sierro Design System — LOCKED TOKENS (Figma Handoff)         │
 *  │  These values come from the official Figma Design System.     │
 *  │  DO NOT change them arbitrarily when adjusting the app.       │
 *  │  See CLAUDE.md › "Design System (locked)" for the full spec.  │
 *  └──────────────────────────────────────────────────────────────┘
 */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ── Typography (Figma): Anton = display/page-title, Inter = content ──
      fontFamily: {
        display: ['Anton', 'Impact', 'sans-serif'],
        sans: ['Inter', 'SF Pro Display', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // Figma type scale — lineHeight 1.2, letterSpacing 0
      fontSize: {
        'display':      ['32px', { lineHeight: '1.2', letterSpacing: '0' }],
        'headline-xl':  ['42px', { lineHeight: '1.2', letterSpacing: '0' }],
        'headline-lg':  ['28px', { lineHeight: '1.2', letterSpacing: '0' }],
        'headline-md':  ['24px', { lineHeight: '1.2', letterSpacing: '0' }],
        'title-lg':     ['20px', { lineHeight: '1.2', letterSpacing: '0' }],
        'title-md':     ['18px', { lineHeight: '1.2', letterSpacing: '0' }],
        'body-lg':      ['16px', { lineHeight: '1.2', letterSpacing: '0' }],
        'body-md':      ['14px', { lineHeight: '1.2', letterSpacing: '0' }],
        'label':        ['12px', { lineHeight: '1.2', letterSpacing: '0' }],
        'caption':      ['11px', { lineHeight: '1.2', letterSpacing: '0' }],
        'tiny':         ['10px', { lineHeight: '1.2', letterSpacing: '0' }],
      },
      letterSpacing: {
        normal: '0',
      },
      colors: {
        // ── Primary / Brand / Success-charge (Figma "Primary") ──
        primary: {
          light: '#E8FBF9',
          'light-hover': '#D9F9F5',
          'light-active': '#B0F2EB',
          DEFAULT: '#01D6BE',
          hover: '#01C1AB',
          active: '#01AB98',
          dark: '#01A18F',
          'dark-hover': '#018072',
          'dark-active': '#0A6055',
          darker: '#004B43',
        },
        // ── Yellow / Membership (Founder Badge) ──
        membership: {
          light: '#FFFBE8',
          DEFAULT: '#FFD700',
          hover: '#E6C200',
          active: '#CCAC00',
          dark: '#BFA100',
          darker: '#594B00',
        },
        // ── Green / Success ──
        success: {
          light: '#E9F8EE',
          DEFAULT: '#34C759',
          hover: '#2FB350',
          active: '#2A9947',
          dark: '#1F7735',
          darker: '#124B1F',
        },
        // ── Orange / Warning / Discharge ──
        warning: {
          light: '#FFF4E6',
          DEFAULT: '#FF9500',
          hover: '#E68600',
          active: '#CC7700',
          dark: '#BF7000',
          darker: '#593400',
        },
        // ── Red / Error ──
        danger: {
          light: '#FFEBEA',
          DEFAULT: '#FF3B30',
          hover: '#E6352B',
          active: '#CC2F28',
          dark: '#BF2C24',
          darker: '#591511',
        },
        // ── Black / Neutral scale (black-1 … black-13) ──
        ink: {
          1: '#FFFFFF',
          2: '#FCFCFC',
          3: '#F5F5F5',
          4: '#F0F0F0',
          5: '#D9D9D9',
          6: '#BFBFBF',
          7: '#8C8C8C',
          8: '#595959',
          9: '#454545',
          10: '#262626',
          11: '#1F1F1F',
          12: '#141414',
          13: '#000000',
        },
        // ── Semantic aliases used across the existing app ──
        accent: '#01D6BE',
        'bg-base': '#141414',   // ink-12
        'bg-card': '#262626',   // ink-10
        'bg-card2': '#454545',   // ink-9 (was off-palette #333333)
        'txt-primary': '#FFFFFF',
        'txt-secondary': '#BFBFBF', // ink-6 (was off-palette #A0A0A5)
        'txt-muted': '#8C8C8C',     // ink-7 (was off-palette #636366)
      },
      // ── Border Radius (Figma): s=4 · m=8 · l=12 · xl=100(pill) ──
      // New canonical tokens. Legacy sm/md/lg/xl kept for back-compat;
      // prefer rounded-s / rounded-m / rounded-l / rounded-pill going forward.
      borderRadius: {
        's': '4px',
        'm': '8px',
        'l': '12px',
        'pill': '100px',  // Figma radius xl = 100 → use rounded-pill
        // legacy (do not use in new code)
        'sm': '8px',
        'md': '14px',
        'lg': '20px',
        'xl': '28px',
        'full': '9999px',
      },
      // ── Border Width (Figma): xs=0.5 · s=1 · m=1.3 ──
      borderWidth: {
        'xs': '0.5px',
        's': '1px',
        'm': '1.3px',
      },
      // ── Drop Shadow / Elevation (Figma): x=0 y=0 blur=0, spread s=2.5 m=3 l=4, color black 30% ──
      boxShadow: {
        's': '0 0 0 2.5px rgba(0,0,0,0.3)',
        'm': '0 0 0 3px rgba(0,0,0,0.3)',
        'l': '0 0 0 4px rgba(0,0,0,0.3)',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
      },
      // ── Grid (Figma Columns/Gutters/Margins) ──
      screens: {
        'sm': '360px',
        'md': '768px',
        'lg': '1280px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'wave': 'wave 4s linear infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
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
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
