import React from 'react'
import Icon from '../../components/Icon'

/** BatteryTag 9-state color: 60-100% teal, 20-59% orange, 1-19% red, 0% gray. */
export function getTagColor(level: number): string {
  if (level <= 0) return '#8C8C8C'
  if (level >= 60) return '#01D6BE'
  if (level >= 20) return '#FF9500'
  return '#FF3B30'
}

export function BatteryTag({ level, connected, charging, unknown }: { level: number; connected: boolean; charging: boolean; unknown?: boolean }) {
  if (!connected) {
    return (
      <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-[#591511] text-danger text-body-md font-semibold">
        Disconnected
      </span>
    )
  }
  if (unknown) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-9">
        <span className="w-[22px] h-[12px] rounded-s border-s animate-pulse" style={{ borderColor: '#8C8C8C' }} />
        <span className="text-body-md font-semibold text-ink-7">--%</span>
      </span>
    )
  }
  const color = getTagColor(level)
  const fill = Math.max(4, Math.min(100, level))
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink-9">
      <span className="relative inline-flex items-center">
        <span className="relative w-[22px] h-[12px] rounded-s border-s flex items-center" style={{ borderColor: '#8C8C8C' }}>
          <span
            className="absolute left-[1.5px] top-[1.5px] bottom-[1.5px] rounded-[1.5px]"
            style={{ width: `calc(${fill}% - 3px)`, backgroundColor: color }}
          />
          {charging && (
            <Icon name="thunder" size={9} className="relative mx-auto" />
          )}
        </span>
        <span className="w-[2px] h-[5px] rounded-r-[1px] ml-[1px]" style={{ backgroundColor: '#8C8C8C' }} />
      </span>
      <span className="text-body-md font-semibold text-white tnum">{level}%</span>
    </span>
  )
}

export function PowerToggle({ deviceId, on, disabled, onToggle }: {
  deviceId: string | number
  on: boolean
  disabled: boolean
  onToggle: (deviceId: string | number, e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={(e) => { if (!disabled) onToggle(deviceId, e) }}
      disabled={disabled}
      aria-label="Power toggle"
      className={`relative w-[52px] h-[31px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        disabled
          ? 'bg-ink-9 opacity-50 cursor-not-allowed'
          : on
            ? 'bg-primary active:scale-95'
            : 'bg-ink-9 active:scale-95'
      } transition-transform`}
    >
      <span
        className={`absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-sm transition-[left,transform] duration-200 ${
          on && !disabled ? 'left-[23px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}
