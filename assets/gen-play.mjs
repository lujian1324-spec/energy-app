import sharp from 'sharp'
import { readFileSync } from 'fs'

function extractPng(svgPath) {
  const svg = readFileSync(svgPath, 'utf8')
  const m = svg.match(/(?:xlink:)?href="data:image\/png;base64,([^"]+)"/)
  if (!m) throw new Error(`no embedded png in ${svgPath}`)
  return Buffer.from(m[1], 'base64')
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 }
const sqWob = extractPng('public/logo white font black background.svg')
const sqBow = extractPng('public/logo black font white background.svg')

await sharp(sqWob)
  .resize(512, 512, { fit: 'contain', background: BLACK })
  .flatten({ background: BLACK })
  .png()
  .toFile('play-assets/play-store-icon-512.png')

const box = Math.round(Math.min(1024, 500) * 0.72)
const mark = await sharp(sqBow)
  .resize(box, box, { fit: 'contain', background: WHITE })
  .png()
  .toBuffer()
await sharp({ create: { width: 1024, height: 500, channels: 3, background: WHITE } })
  .composite([{ input: mark, gravity: 'centre' }])
  .png()
  .toFile('play-assets/feature-graphic-1024x500.png')

console.log('play store assets generated from public/ design SVGs')
