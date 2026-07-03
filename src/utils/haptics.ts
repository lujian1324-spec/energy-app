/**
 * 触觉反馈薄封装 — 原生走 @capacitor/haptics，Web 退化为 navigator.vibrate（Android
 * Chrome 支持），其余环境静默 no-op。全部 fire-and-forget，绝不阻塞交互。
 */
import { Capacitor } from '@capacitor/core'

type Impact = 'light' | 'medium' | 'heavy'

async function nativeImpact(style: Impact): Promise<void> {
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
  await Haptics.impact({ style: map[style] })
}

function webVibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern) } catch { /* ignore */ }
}

/** 轻触 — 开关切换、tab 切换、选项选择 */
export function hapticLight(): void {
  if (Capacitor.isNativePlatform()) { nativeImpact('light').catch(() => {}) } else { webVibrate(10) }
}

/** 中触 — 下拉刷新触发、确认类主操作 */
export function hapticMedium(): void {
  if (Capacitor.isNativePlatform()) { nativeImpact('medium').catch(() => {}) } else { webVibrate(20) }
}

/** 警示 — 删除确认、危险操作 */
export function hapticWarning(): void {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/haptics')
      .then(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Warning }))
      .catch(() => {})
  } else { webVibrate([30, 40, 30]) }
}
