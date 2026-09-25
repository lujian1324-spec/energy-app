/**
 * Insights — energy in Wh, input split into Solar and AC, empty hours as gaps,
 * and a failed page reported instead of short totals (v4.16.0,
 * APP-20260923-006/007/008/009). The account's oldest device is the one shown.
 */
import { test, expect, type Page } from '@playwright/test'
import { E2E_TZ, mockBackend, reportsBetween, signIn, type MockDevice } from './support/mockBackend'

test.use({ timezoneId: E2E_TZ })

const NOW = new Date('2026-09-24T15:00:00-07:00')
const HISTORY = '/deviceState/simple/attribute/keys/history/v1'
const PARTIAL_COPY = "Some history for this period couldn't be loaded, so totals may be low."

/** Tap hour `h` of the Day chart and return the reading it shows. */
async function readHour(page: Page, h: number): Promise<string[]> {
  const chart = page.getByRole('img', { name: 'Input and output energy' })
  const box = (await chart.boundingBox())!
  await chart.click({ position: { x: (box.width * h) / 23, y: box.height / 2 } })
  return chart.locator('text').allTextContents()
}

async function openYesterday(page: Page) {
  await page.goto('/#/insights')
  await expect(page.getByText('Input vs. Output')).toBeVisible()
  await page.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByText('Sep 23, 2026')).toBeVisible()
}

test.describe('Insights', () => {
  test.skip(!process.env.E2E_LOCAL, 'Uses a local build and a mocked backend')

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW })
    await signIn(page)
  })

  test('an hour reads energy in Wh, with input split into Solar and AC', async ({ page }) => {
    // 08:00–12:00 every 5 min: Solar 100 W, AC 50 W, Output 120 W.
    const devices: MockDevice[] = [
      { id: '1001', name: 'Garage', createdAt: '2026-01-01T00:00:00Z',
        history: reportsBetween(8, 12, { generationPower: 100, exchangeChargingPower: 50, outputPower: 120 }) },
      { id: '2002', name: 'Cabin', createdAt: '2026-02-01T00:00:00Z',
        history: reportsBetween(0, 24, { generationPower: 999, outputPower: 999 }) },
    ]
    const api = await mockBackend(page, devices)
    await openYesterday(page)

    // A full hour at a steady 150 W in / 120 W out is 150 Wh / 120 Wh.
    await expect.poll(() => readHour(page, 9)).toEqual(['09:00', 'In 150 Wh', 'Solar 100 Wh', 'AC 50 Wh', 'Out 120 Wh'])
    // An hour the device never reported is a gap, not 0 Wh.
    expect(await readHour(page, 14)).toEqual(['14:00', 'No data'])

    // The oldest device, one whole local day per request, with the zone offset
    // (v4.21.0: history is read and cached a day at a time).
    const day = api.callsTo(HISTORY).filter(c => c.body.fromTime.startsWith('2026-09-23'))
    expect(day.length).toBeGreaterThan(0)
    expect(day.every(c => c.body.deviceId === '1001')).toBe(true)
    expect(day[0].body.fromTime).toBe('2026-09-23T00:00:00-07:00')
    expect(day[0].body.toTime).toBe('2026-09-23T23:59:59-07:00')
  })

  test('a page that fails is reported instead of silently short totals', async ({ page }) => {
    // One sample a minute from 08:00 to 14:00 is 360 samples. On the fallback
    // call (record/list, 80 a page) that is five pages; page 2 fails.
    const devices: MockDevice[] = [
      { id: '1001', name: 'Garage', refuseKeysV1: true, failHistoryPages: [2],
        history: reportsBetween(8, 14, { generationPower: 100, outputPower: 120 }, 1) },
    ]
    await mockBackend(page, devices)
    await openYesterday(page)
    await expect(page.getByText(PARTIAL_COPY)).toBeVisible()
  })

  test('a complete period carries no warning', async ({ page }) => {
    const devices: MockDevice[] = [
      { id: '1001', name: 'Garage', history: reportsBetween(8, 14, { generationPower: 100, outputPower: 120 }, 1) },
    ]
    await mockBackend(page, devices)
    await openYesterday(page)
    await expect.poll(() => readHour(page, 10)).toContain('Out 120 Wh')
    await expect(page.getByText(PARTIAL_COPY)).toHaveCount(0)
  })

  test('the tapped point, its guide line and its axis label line up (v4.21.1)', async ({ page }) => {
    await mockBackend(page, [
      { id: '1001', name: 'Garage', history: reportsBetween(0, 24, { generationPower: 100, outputPower: 120 }) },
    ])
    await openYesterday(page)
    const chart = page.getByRole('img', { name: 'Input and output energy' })
    await expect.poll(() => readHour(page, 10)).toContain('Out 120 Wh')
    const axis = page.getByTestId('insights-axis')
    for (const i of [0, 4, 8, 12, 16, 20]) {
      const label = axis.locator(`[data-index="${i}"]`)
      const text = (await label.textContent())!
      const lb = (await label.boundingBox())!
      const cb = (await chart.boundingBox())!
      // Tap straight above the label's centre (the edge label is left-aligned: tap its left edge).
      const tapX = i === 0 ? lb.x : lb.x + lb.width / 2
      await chart.click({ position: { x: tapX - cb.x, y: cb.height / 2 } })
      await expect(chart.locator('text').first()).toHaveText(text)
      // The guide line is drawn at the point's x — the same x the label is centred on.
      const guideX = Number(await chart.locator('line[stroke-dasharray="3,3"]').getAttribute('x1'))
      expect(Math.abs(cb.x + guideX - tapX)).toBeLessThan(2)
      await expect(label).toHaveClass(/text-white/)
    }
  })

  test('page and chart text cannot be selected by a long press (v4.21.1)', async ({ page }) => {
    await mockBackend(page, [
      { id: '1001', name: 'Garage', history: reportsBetween(8, 12, { generationPower: 100, outputPower: 120 }) },
    ])
    await openYesterday(page)
    await readHour(page, 9)
    const style = (sel: string) => page.locator(sel).first().evaluate(el => {
      const cs = getComputedStyle(el)
      return { select: cs.userSelect || cs.webkitUserSelect, callout: (cs as unknown as Record<string, string>).webkitTouchCallout }
    })
    expect((await style('body')).select).toBe('none')
    expect((await style('[role="img"] text')).select).toBe('none')
    expect((await style('text=Input vs. Output')).select).toBe('none')
    // Something to try: select everything; nothing on the page may come out.
    await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.body); getSelection()!.removeAllRanges(); getSelection()!.addRange(r) })
    expect(await page.evaluate(() => getSelection()!.toString().trim())).toBe('')
  })
})

