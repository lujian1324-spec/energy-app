import sharp from 'sharp'

const BLACK = '#0A0A0A', WHITE = '#FFFFFF'
const buf = s => Buffer.from(s)

// 白底居中 SIERRO 字标（用于图标与启动图）
const wordmarkSVG = (w, h, { transparent = false } = {}) => {
  const fontPx = Math.round(Math.min(w, h) * 0.11)
  const ls = Math.max(2, Math.round(fontPx * 0.08))
  const bg = transparent ? '' : `<rect width="${w}" height="${h}" fill="${WHITE}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${bg}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="Liberation Sans, Arial, DejaVu Sans, sans-serif"
      font-size="${fontPx}" font-weight="700" letter-spacing="${ls}"
      fill="${BLACK}">SIERRO</text>
  </svg>`
}
// 方形图标：字标占 ~72% 宽；自适应前景：透明底、字标缩进安全区（~48% 宽，圆形遮罩不裁）
const squareIcon = (size, { transparent = false, widthFrac = 0.72 } = {}) => {
  const fontPx = Math.round(size * widthFrac / 4.6)  // "SIERRO" 约 4.6 字宽
  const ls = Math.max(2, Math.round(fontPx * 0.09))
  const bg = transparent ? '' : `<rect width="${size}" height="${size}" fill="${WHITE}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg}
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
      font-family="Liberation Sans, Arial, DejaVu Sans, sans-serif"
      font-size="${fontPx}" font-weight="700" letter-spacing="${ls}"
      fill="${BLACK}">SIERRO</text>
  </svg>`
}
const png = (svg, file) => sharp(buf(svg)).png().toFile(file)

const R = 'android/app/src/main/res'
const jobs = []

// ── iOS ──
jobs.push(png(squareIcon(1024, { widthFrac: 0.72 }), 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  jobs.push(png(wordmarkSVG(2732, 2732), `ios/App/App/Assets.xcassets/Splash.imageset/${f}`))

// ── Android launcher icons (legacy square + round) ──
const launcher = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, s] of Object.entries(launcher)) {
  jobs.push(png(squareIcon(s, { widthFrac: 0.72 }), `${R}/mipmap-${d}/ic_launcher.png`))
  jobs.push(png(squareIcon(s, { widthFrac: 0.62 }), `${R}/mipmap-${d}/ic_launcher_round.png`))
}
// ── Android adaptive foreground (transparent, safe-zone) ──
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
for (const [d, s] of Object.entries(fg))
  jobs.push(png(squareIcon(s, { transparent: true, widthFrac: 0.46 }), `${R}/mipmap-${d}/ic_launcher_foreground.png`))

// ── Android splashes (exact per-folder dims) ──
const splashes = {
  'drawable/splash.png': [480, 320],
  'drawable-port-mdpi/splash.png': [320, 480], 'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280], 'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
  'drawable-land-mdpi/splash.png': [480, 320], 'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720], 'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
}
for (const [f, [w, h]] of Object.entries(splashes))
  jobs.push(png(wordmarkSVG(w, h), `${R}/${f}`))

await Promise.all(jobs)
console.log(`generated ${jobs.length} icon/splash files`)
