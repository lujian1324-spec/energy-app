/**
 * SW-13 follow-up — the flush's failure copy is the Save button's copy.
 *
 * `DevicePage` mounted the flush hook with no `onRejected`, so a device that
 * answered and refused a replayed save was either silent or fell through to a
 * fallback toast the hook wrote itself — new product copy (AC-13-11). Both
 * pages now format through here, and these are the only strings allowed.
 */
import { describe, it, expect } from 'vitest'
import { stepFailureTitle, flushRejectionNotice } from './smartScheduleFlushCopy'

describe('stepFailureTitle', () => {
  it('names the charge power when the passthrough is what failed', () => {
    expect(stepFailureTitle({ failedStep: 'passthrough' }, true)).toBe('Could not set the charge power')
    expect(stepFailureTitle({ failedStep: 'passthrough' }, false)).toBe('Could not set the charge power')
  })

  it('names the direction for any other step', () => {
    expect(stepFailureTitle({ failedStep: 'config' }, true)).toBe('Could not turn Smart Schedule on')
    expect(stepFailureTitle({ failedStep: 'relay' }, false)).toBe('Could not turn Smart Schedule off')
    expect(stepFailureTitle({}, false)).toBe('Could not turn Smart Schedule off')
  })
})

describe('flushRejectionNotice', () => {
  it('shows the device’s reason while retries are still coming', () => {
    expect(flushRejectionNotice({ failedStep: 'passthrough', detail: 'can not set charge power' }, true, false))
      .toEqual({ title: 'Could not set the charge power', message: 'can not set charge power' })
  })

  it('swaps the body for the stop notice once the ladder is spent', () => {
    expect(flushRejectionNotice({ failedStep: 'passthrough', detail: 'refused' }, true, true))
      .toEqual({
        title: 'Could not set the charge power',
        message: 'Automatic retries stopped. Review the settings and save again.',
      })
  })

  it('leaves the body off rather than inventing one when there is no detail', () => {
    expect(flushRejectionNotice({ failedStep: 'config' }, false, false))
      .toEqual({ title: 'Could not turn Smart Schedule off', message: undefined })
  })

  it('sanitises a backend detail the same way the Save path does', () => {
    expect(flushRejectionNotice({ failedStep: 'passthrough', detail: '等待设备应答超时' }, true, false).message)
      .toBe('Timed out waiting for the device.')
  })
})
