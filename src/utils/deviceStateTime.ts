/**
 * When a /remote/device/state/latest sample was taken, in ms; undefined when
 * absent or unparseable.
 *
 * /state/latest 的 `time` 是「Unix 秒的字串」（见 demoData.getDemoDeviceState），
 * 直接丢给 `new Date('1755705600')` 会得到 Invalid Date → NaN。这里容错解析：
 * 纯数字按 epoch 处理（>=13 位当毫秒，否则当秒 *1000），其余按 ISO 字串解析。
 */
export function parseDeviceStateTime(time: string | number | undefined | null): number | undefined {
  if (time === undefined || time === null || time === '') return undefined
  const t = String(time)
  if (/^\d+$/.test(t)) {
    const n = Number(t)
    return t.length >= 13 ? n : n * 1000
  }
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? undefined : ms
}
