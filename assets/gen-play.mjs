import sharp from 'sharp'
const BLACK='#0A0A0A', WHITE='#FFFFFF'
const buf=s=>Buffer.from(s)
const text=(w,h,fontPx,ls)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${WHITE}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
    font-family="Liberation Sans, Arial, DejaVu Sans, sans-serif"
    font-size="${fontPx}" font-weight="700" letter-spacing="${ls}" fill="${BLACK}">SIERRO</text>
</svg>`
// Play 商店图标 512x512（32-bit PNG，无 alpha 更稳妥 → flatten 白底）
await sharp(buf(text(512,512,66,6))).flatten({background:WHITE}).png().toFile('play-assets/play-store-icon-512.png')
// 特色图 Feature graphic 1024x500
await sharp(buf(text(1024,500,120,10))).flatten({background:WHITE}).png().toFile('play-assets/feature-graphic-1024x500.png')
console.log('play store assets generated')
