/**
 * APP-003 / APP-007: every <video> must carry its own poster, or Android WebView
 * paints its default one — the big stretched play button — whenever the camera
 * has no frame to show.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TRANSPARENT_VIDEO_POSTER } from './videoPoster'

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsxFiles(p)
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
  })
}

describe('video poster', () => {
  it('is a real 1x1 GIF', () => {
    const b64 = TRANSPARENT_VIDEO_POSTER.replace(/^data:image\/gif;base64,/, '')
    const bytes = Buffer.from(b64, 'base64')
    expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a')
    expect(bytes.readUInt16LE(6)).toBe(1)
    expect(bytes.readUInt16LE(8)).toBe(1)
  })

  it('every <video> element in the app sets poster', () => {
    const src = join(process.cwd(), 'src')
    const offenders: string[] = []
    let videos = 0
    for (const f of tsxFiles(src)) {
      const text = readFileSync(f, 'utf8')
      // JSX elements only (`<video` + attributes, self-closed), not prose like "<video>" in comments.
      for (const m of text.matchAll(/<video\s([\s\S]*?)\/>/g)) {
        videos++
        if (!/\bposter=/.test(m[1])) offenders.push(f.replace(src, 'src'))
      }
    }
    expect(videos).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
