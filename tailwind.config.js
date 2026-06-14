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
      /* ══════════════════════════════════════════
       * Color Scheme — Figma_Design_System_Color Scheme
       * PRD v1.1 §11.1
       * ══════════════════════════════════════════ */
      colors: {
        // ── Semantic aliases (backward compat) ──
        primary: '#01D6BE',
        accent: '#01D6BE',
        success: '#34C759',
        warning: '#FF9500',
        danger: '#FF3B30',

        // ── Background & Text (PRD §11.1) ──
        'bg-base': '#141414',
        'bg-card': '#262626',
        'bg-card2': '#333333',
        'txt-primary': '#FFFFFF',
        'txt-secondary': '#A0A0A5',
        'txt-muted': '#636366',

        // ── Primary / Teal (#01D6BE) — 10 shades ──
        'pri': {
          light: '#E6FBF8',
          'light-hover': '#CCF7F1',
          'light-active': '#99EBE0',
          DEFAULT: '#01D6BE',
          hover: '#00BAA5',
          active: '#009E8C',
          dark: '#008F7E',
          'dark-hover': '#007A6C',
          'dark-active': '#006559',
          darker: '#004F45',
        },

        // ── Yellow / Membership (Founder Badge) ──
        'membership': {
          light: '#FFF8E6',
          'light-hover': '#FFF1CC',
          'light-active': '#FFE399',
          DEFAULT: '#FFD60A',
          hover: '#FFCD08',
          active: '#E6B800',
          dark: '#CCA300',
          'dark-hover': '#B38F00',
          'dark-active': '#997B00',
          darker: '#806600',
        },

        // ── Green / Success (#34C759) ──
        green: {
          light: '#EDFAF1',
          'light-hover': '#DBF5E3',
          'light-active': '#B7EBC7',
          DEFAULT: '#34C759',
          hover: '#2DB74E',
          active: '#28A043',
          dark: '#22893A',
          'dark-hover': '#1C7230',
          'dark-active': '#165B26',
          darker: '#10441C',
        },

        // ── Orange / Warning (#FF9500) ──
        orange: {
          light: '#FFF4E6',
          'light-hover': '#FFE9CC',
          'light-active': '#FFD399',
          DEFAULT: '#FF9500',
          hover: '#E68600',
          active: '#CC7700',
          dark: '#B36800',
          'dark-hover': '#995900',
          'dark-active': '#804A00',
          darker: '#663B00',
        },

        // ── Red / Error (#FF3B30) ──
        red: {
          light: '#FFEDED',
          'light-hover': '#FFDBDB',
          'light-active': '#FFB7B7',
          DEFAULT: '#FF3B30',
          hover: '#E6352B',
          active: '#CC2F26',
          dark: '#B32922',
          'dark-hover': '#99231D',
          'dark-active': '#801D18',
          darker: '#661714',
        },

        // ── Neutral / Black (Block-1 ~ Block-15) ──
        neutral: {
          1: '#FFFFFF',
          2: '#F5F5F5',
          3: '#EEEEEE',
          4: '#E0E0E0',
          5: '#BDBDBD',
          6: '#9E9E9E',
          7: '#757575',
          8: '#636366',
          9: '#555555',
          10: '#444444',
          11: '#333333',
          12: '#2C2C2E',
          13: '#222222',
          14: '#1C1C1E',
          15: '#141414',
        },
      },

      /* ══════════════════════════════════════════
       * Border Radius — Figma_Design_System_Border Radius
       * PRD v1.1 §11.2
       * ══════════════════════════════════════════ */
      borderRadius: {
        's': '4px',   // small elements, inputs
        'm': '8px',   // standard cards, buttons
        'l': '12px',  // large cards, modals
        'xl': '100px',// pill / full-round
        'full': '9999px',
        // Keep backward compat aliases for gradual migration
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
      },

      /* ══════════════════════════════════════════
       * Border Width — Figma_Design_System_Border
       * ══════════════════════════════════════════ */
      borderWidth: {
        'xs': '0.5px',
        's': '1px',
        'm': '1.3px',
      },

      /* ══════════════════════════════════════════
       * Typography — Figma_Design_System_Typography
       * Line Height = 1.2, Letter Spacing = 0
       * Font: SF Pro Display / system-ui (-apple-system)
       * ══════════════════════════════════════════ */
      fontSize: {
        // ── Display ──
        'display': ['32px', { lineHeight: '1.25', letterSpacing: '0' }],

        // ── Headline ──
        'headline-xl-em': ['42px', { lineHeight: '1.19', letterSpacing: '0', fontWeight: '600' }],
        'headline-xl': ['42px', { lineHeight: '1.19', letterSpacing: '0' }],
        'headline-lg-em': ['26px', { lineHeight: '1.23', letterSpacing: '0', fontWeight: '600' }],
        'headline-lg': ['20px', { lineHeight: '1.2', letterSpacing: '0' }],
        'headline-md-em': ['24px', { lineHeight: '1.17', letterSpacing: '0', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '1.17', letterSpacing: '0' }],

        // ── Title ──
        'title-lg-em': ['20px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '600' }],
        'title-lg': ['20px', { lineHeight: '1.2', letterSpacing: '0' }],
        'title-md-em': ['18px', { lineHeight: '1.22', letterSpacing: '0', fontWeight: '600' }],
        'title-md': ['18px', { lineHeight: '1.22', letterSpacing: '0' }],

        // ── Body ──
        'body-lg-em': ['16px', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '1.25', letterSpacing: '0' }],
        'body-md-em': ['14px', { lineHeight: '1.29', letterSpacing: '0', fontWeight: '600' }],
        'body-md': ['14px', { lineHeight: '1.29', letterSpacing: '0' }],

        // ── Label ──
        'label-em': ['12px', { lineHeight: '1.33', letterSpacing: '0', fontWeight: '600' }],
        'label': ['12px', { lineHeight: '1.33', letterSpacing: '0' }],

        // ── Caption ──
        'caption-em': ['11px', { lineHeight: '1.27', letterSpacing: '0', fontWeight: '600' }],
        'caption': ['11px', { lineHeight: '1.27', letterSpacing: '0' }],

        // ── XS ──
        'xs': ['10px', { lineHeight: '1.2', letterSpacing: '0', fontWeight: '500' }],
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },

      /* ══════════════════════════════════════════
       * Grid — Figma_Design_System_Columns Gutters Margins
       * ══════════════════════════════════════════ */
      gridTemplateColumns: {
        mobile: 'repeat(4, minmax(0, 1fr))',       // < 375px
        'mobile-wide': 'repeat(11, minmax(0, 1fr))', // ≥ 375px
        desktop: 'repeat(12, minmax(0, 1fr))',       // > 1024px
      },
      gap: {
        gutter: '16px',   // Mobile gutters
        'gutter-md': '24px', // Desktop gutters
      },
      padding: {
        margin: '16px',   // < 375px
        'margin-md': '24px', // ≥ 375px
        'margin-lg': '32px', // > 1024px
      },

      /* ══════════════════════════════════════════
       * Spacing scale (keep existing)
       * ══════════════════════════════════════════ */
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
      },

      /* ══════════════════════════════════════════
       * Animation keyframes (existing)
       * ══════════════════════════════════════════ */
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
        wave: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
