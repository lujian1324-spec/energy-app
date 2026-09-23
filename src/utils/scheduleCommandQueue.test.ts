import { expect, it } from 'vitest'
import { runScheduleCommand } from './scheduleCommandQueue'

it('serializes a device while allowing an unrelated device to progress', async () => {
  const events: string[] = []
  let finish!: () => void
  const a = runScheduleCommand('A', async () => { events.push('first'); await new Promise<void>(r => { finish = r }) })
  const b = runScheduleCommand('A', async () => { events.push('second') })
  await runScheduleCommand('B', async () => { events.push('other') })
  expect(events).toEqual(['first', 'other'])
  finish()
  await a; await b
  expect(events).toEqual(['first', 'other', 'second'])
})

it('a rejected request does not poison the next save', async () => {
  const first = runScheduleCommand('A', async () => { throw new Error('offline') })
  const second = runScheduleCommand('A', async () => 'recovered')
  await expect(first).rejects.toThrow('offline')
  await expect(second).resolves.toBe('recovered')
})
