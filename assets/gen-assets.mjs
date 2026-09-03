import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

function extractPng(svgPath) {
  const svg = readFileSync(svgPath, 'utf8')
  const m = svg.match(/(?:xlink:)?href="data:image\/png;base64,([^"]+)"/)
  if (!m) throw new Error(`no embedded png in ${svgPath}`)
  return Buffer.from(m[1], 'base64')
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

const wordWhite = extractPng('public/logo white font.svg')
const wordBlack = extractPng('public/logo back font.svg')
const sqWob = extractPng('public/logo white font black background.svg')
extractPng('public/logo black font white background.svg')

async function scaleSquare(src, size, bg) {
  return sharp(src)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toBuffer()
}

async function splash(w, h) {
  const meta = await sharp(wordBlack).metadata()
  const markH = Math.max(1, Math.round(Math.min(w, h) * 0.11))
  const markW = Math.max(1, Math.round(markH * (meta.width / meta.height)))
  const mark = await sharp(wordBlack).resize(markW, markH).png().toBuffer()
  return sharp({ create: { width: w, height: h, channels: 4, background: WHITE } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function adaptiveFg(size, wordBuf, frac = 0.46) {
  const meta = await sharp(wordBuf).metadata()
  const markW = Math.max(1, Math.round(size * frac))
  const markH = Math.max(1, Math.round(markW * (meta.height / meta.width)))
  const mark = await sharp(wordBuf).resize(markW, markH).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: CLEAR } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function write(buf, file) {
  mkdirSync(dirname(file), { recursive: true })
  await sharp(buf).toFile(file)
}

const R = 'android/app/src/main/res'
const jobs = []

jobs.push(write(await scaleSquare(sqWob, 1024, BLACK), 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'))
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  jobs.push(write(await splash(2732, 2732), `ios/App/App/Assets.xcassets/Splash.imageset/${f}`))

const launcher = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, s] of Object.entries(launcher)) {
  const buf = await scaleSquare(sqWob, s, BLACK)
  jobs.push(write(buf, `${R}/mipmap-${d}/ic_launcher.png`))
  jobs.push(write(buf, `${R}/mipmap-${d}/ic_launcher_round.png`))
}

const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
for (const [d, s] of Object.entries(fg))
  jobs.push(write(await adaptiveFg(s, wordWhite, 0.46), `${R}/mipmap-${d}/ic_launcher_foreground.png`))

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
  jobs.push(write(await splash(w, h), `${R}/${f}`))

jobs.push((async () => {
  const buf = await adaptiveFg(1000, wordBlack, 0.46)
  mkdirSync(`${R}/drawable-nodpi`, { recursive: true })
  await sharp(buf).flatten({ background: WHITE }).png().toFile(`${R}/drawable-nodpi/splash_logo.png`)
})())

await Promise.all(jobs)
console.log(`generated ${jobs.length} icon/splash files from public/ design SVGs`)
