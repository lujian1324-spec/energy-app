/**
 * APP-002: a dialog closing over the search page is not a return from Settings.
 */
import { describe, it, expect } from 'vitest'
import { resumeAction } from './resumePolicy'

const base = { wentBackground: false, wasBlocked: false, onScan: true, scanning: true }

describe('resumeAction', () => {
  it('ignores a bare onResume — the permission prompt closing mid-search', () => {
    // Capacitor fires isActive:true on every onResume; a dialog never sends isActive:false.
    expect(resumeAction(base)).toEqual({ recheck: false, showChecking: false, scanWhenReady: false })
    expect(resumeAction({ ...base, scanning: false })).toEqual({ recheck: false, showChecking: false, scanWhenReady: false })
  })

  it('back from Settings on a blocked screen: re-check, show it, then search', () => {
    expect(resumeAction({ ...base, wasBlocked: true, wentBackground: true, scanning: false }))
      .toEqual({ recheck: true, showChecking: true, scanWhenReady: true })
    // A blocked screen is re-read even if the stop was never reported.
    expect(resumeAction({ ...base, wasBlocked: true, scanning: false }).recheck).toBe(true)
  })

  it('back from the background mid-search: re-check quietly, keep the running search and its list', () => {
    expect(resumeAction({ ...base, wentBackground: true }))
      .toEqual({ recheck: true, showChecking: false, scanWhenReady: false })
  })

  it('back from the background after the search ended: search again', () => {
    expect(resumeAction({ ...base, wentBackground: true, scanning: false }).scanWhenReady).toBe(true)
  })

  it('off the search screen: never starts a search', () => {
    const off = { ...base, onScan: false, scanning: false }
    expect(resumeAction({ ...off, wentBackground: true }).scanWhenReady).toBe(false)
    expect(resumeAction({ ...off, wasBlocked: true }).scanWhenReady).toBe(false)
    expect(resumeAction({ ...off, wasBlocked: true }).showChecking).toBe(false)
  })
})
