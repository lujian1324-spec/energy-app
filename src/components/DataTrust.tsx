// PRD v1.1 §8.1: 数据来源标识规范
// BLE Direct | Modbus RTU | Cloud API | Demo

import { Bluetooth, Cable, Cloud, FlaskConical } from 'lucide-react'

export type DataSource = 'ble' | 'modbus' | 'cloud' | 'demo'

interface DataSourceTagProps {
  source: DataSource
  className?: string
}

const SOURCE_META: Record<DataSource, { label: string; icon: typeof Bluetooth; className: string }> = {
  ble: { label: 'BLE Direct', icon: Bluetooth, className: 'data-source-ble' },
  modbus: { label: 'Modbus RTU', icon: Cable, className: 'data-source-modbus' },
  cloud: { label: 'Cloud', icon: Cloud, className: 'data-source-cloud' },
  demo: { label: 'Demo', icon: FlaskConical, className: 'data-source-demo' },
}

export function DataSourceTag({ source, className = '' }: DataSourceTagProps) {
  const meta = SOURCE_META[source]
  const Icon = meta.icon
  return (
    <span
      className={`data-source-tag ${meta.className} ${className}`}
      aria-label={`Data source: ${meta.label}`}
    >
      <Icon size={10} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

interface DemoBannerProps {
  show: boolean
  onRetry?: () => void
}

/** PRD v1.1 §8.2: DEMO MODE 顶部黄色横幅 + 虚线处理 */
export function DemoBanner({ show, onRetry }: DemoBannerProps) {
  if (!show) return null
  return (
    <div
      className="demo-banner flex items-center justify-center gap-2"
      role="status"
      aria-live="polite"
    >
      <span>DEMO MODE — Showing simulated data</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 underline text-[11px] hover:text-[#FFB84D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#01D6BE] rounded"
          aria-label="Retry connecting to real device"
        >
          Retry
        </button>
      )}
    </div>
  )
}

interface LastSyncProps {
  /** 上次同步时间戳 (ms) */
  lastSyncAt?: number
  className?: string
}

/** PRD v1.1 §8.2: 历史数据每条显示 Last sync: X min ago */
export function LastSync({ lastSyncAt, className = '' }: LastSyncProps) {
  if (!lastSyncAt) return null
  const diffMs = Date.now() - lastSyncAt
  const diffMin = Math.floor(diffMs / 60000)
  let text: string
  if (diffMin < 1) text = 'just now'
  else if (diffMin === 1) text = '1 min ago'
  else if (diffMin < 60) text = `${diffMin} min ago`
  else text = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`

  return (
    <span
      className={`text-[10px] text-[#636366] tracking-wide ${className}`}
      title={`Last sync: ${new Date(lastSyncAt).toLocaleString()}`}
    >
      Last sync: {text}
    </span>
  )
}

interface CalcAuditProps {
  formula: string
  label?: string
}

/** PRD v1.1 §8.3: 计算逻辑可审计 - ℹ️ 展开计算公式 */
export function CalcAudit({ formula, label = 'How we calculated this' }: CalcAuditProps) {
  return (
    <details className="text-[11px] text-[#A0A0A5] group">
      <summary className="cursor-pointer list-none flex items-center gap-1 hover:text-[#01D6BE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#01D6BE] rounded">
        <span aria-hidden="true">ℹ️</span>
        <span className="underline">{label}</span>
      </summary>
      <pre className="mt-2 p-3 bg-[#1A1A1A] rounded-[10px] text-[10px] text-[#A0A0A5] whitespace-pre-wrap font-mono leading-relaxed">
{formula}
      </pre>
    </details>
  )
}

interface SampleRateProps {
  intervalSec?: number
  className?: string
}

/** PRD v1.1 §8.2: 功率曲线底部标注 Updated every 1s */
export function SampleRate({ intervalSec = 1, className = '' }: SampleRateProps) {
  return (
    <span className={`text-[10px] text-[#636366] tracking-wide ${className}`}>
      Updated every {intervalSec}s
    </span>
  )
}
