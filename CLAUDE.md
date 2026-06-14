# Sierro Energy App

React 18 + TypeScript + Vite + Tailwind PWA for managing Sierro energy-storage
devices. Routing via React Router (HashRouter), state via Zustand, API layer in
`src/api/` against the Solar of Things Open API.

- Build: `npm run build` · Dev: `npm run dev`
- Entry: `src/main.tsx` → `src/App.tsx` (router) → `src/pages/*`
- Deploy: push to `main` → GitHub Actions → GitHub Pages (`gh-pages` branch).

---

## Design System (LOCKED — Figma Handoff)

These tokens come from the official Figma Design System. **Do not change them
arbitrarily.** When adjusting any page, use these tokens; never invent new
radii, colors, font sizes, or fonts. They are encoded in `tailwind.config.js`.

### Typography
- **Anton** = display / page titles only (`font-display` / `.text-display`).
- **Inter** = all content (default `font-sans`).
- Line height **1.2**, letter spacing **0** everywhere.

| Token | Size | Tailwind |
|-------|------|----------|
| display | 32 (Anton) | `text-display font-display` |
| headline_Xlarge | 42 | `text-headline-xl` |
| headline_large | 28 | `text-headline-lg` |
| headline_medium | 24 | `text-headline-md` |
| title_large | 20 | `text-title-lg` |
| title_medium | 18 | `text-title-md` |
| body_large | 16 | `text-body-lg` |
| body_medium | 14 | `text-body-md` |
| label | 12 | `text-label` |
| caption | 11 | `text-caption` |
| tiny | 10 | `text-tiny` |

Weights: `regular` (400) and `emphasized` (600 / `font-semibold`).

### Color Scheme
- **Primary / Brand / Charge** `#01D6BE` (scale: light `#E8FBF9` → normal `#01D6BE` → dark `#01A18F` → darker `#004B43`) — `text-primary`, `bg-primary`, `bg-primary-light`, etc.
- **Yellow / Membership (Founder Badge)** `#FFD700` — `*-membership`
- **Green / Success** `#34C759` — `*-success`
- **Orange / Warning / Discharge** `#FF9500` — `*-warning`
- **Red / Error** `#FF3530` — `*-danger`
- **Neutral (black-1…13)** `#FFFFFF, #FCFCFC, #F5F5F5, #F0F0F0, #D9D9D9, #BFBFBF, #8C8C8C, #595959, #454545, #262626, #1F1F1F, #141414, #000000` — `*-ink-{1..13}`
  - App background = `ink-12` `#141414`; card background = `ink-10` `#262626`.

### Border Radius
`s` = 4px · `m` = 8px · `l` = 12px · `xl`/pill = 100px
→ Tailwind: `rounded-s`, `rounded-m`, `rounded-l`, `rounded-pill` (or `rounded-full`).
Cards use `l` (12); buttons use `m` (8); tags/pills use `pill`/`full`.
(Legacy `rounded-sm/md/lg/xl` exist for back-compat only — do not use in new code.)

### Border Width
`xs` = 0.5px · `s` = 1px · `m` = 1.3px → `border-xs`, `border-s`, `border-m`.

### Grid (Columns / Gutters / Margins)
| Width | Columns | Gutter | Margin |
|-------|---------|--------|--------|
| 360px | 4 | 16 | 16 |
| 768px | 8 | 16 | 24 |
| ≥1280px | 12 | 16 | 24 |

### Theme
Dark-first, iOS-native feel, rounded-card layout, teal accent on dark bg.

---

## Conventions
- Dark theme only (light mode is future work).
- All primary interactive elements ≥ 48×48dp; focus ring `#01D6BE` (WCAG).
- Toggle/button micro-interaction: scale 0.95 → 1. Ring color transition 1s ease-in-out.
- Reference the PRD (Sierro Energy App PRD v1.1) for per-page behavior.
