import React from 'react'
import Icon from '../../components/Icon'
import ToggleSwitch from '../../components/ToggleSwitch'

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
      <span className="inline-flex items-center px-2 py-1 rounded-full bg-danger-darker text-danger-light text-label font-semibold">
        Disconnected
      </span>
    )
  }
  if (unknown) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full bg-ink-9">
        <span className="w-[24px] h-[16px] rounded-s border-s animate-pulse" style={{ borderColor: '#8C8C8C' }} />
        <span className="text-body-md font-semibold text-ink-7">--%</span>
      </span>
    )
  }
  const pct = Math.round(level)
  const color = getTagColor(pct)
  const fill = Math.max(4, Math.min(100, pct))
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full bg-ink-9">
      <span className="relative inline-flex items-center">
        <span className="relative w-[24px] h-[16px] rounded-s border-s flex items-center" style={{ borderColor: '#8C8C8C' }}>
          <span
            className="absolute left-[1.5px] top-[1.5px] bottom-[1.5px] rounded-[1.5px]"
            style={{ width: `calc(${fill}% - 3px)`, backgroundColor: color }}
          />
          {charging && (
            <Icon name="thunder" size={12} className="relative mx-auto" />
          )}
        </span>
        <span className="w-[2px] h-[5px] rounded-r-[1px] ml-[1px]" style={{ backgroundColor: '#8C8C8C' }} />
      </span>
      <span className="text-body-md font-semibold text-white tnum">{pct}%</span>
    </span>
  )
}

/** APP-20260922-004: what the card switch does, for anyone who reads it as whole-unit power. */
export const AC_OUTPUT_HELP = 'Controls power to the AC outlets. Turning this off does not stop the battery from charging.'

export function PowerToggle({ deviceId, on, disabled, onToggle }: {
  deviceId: string | number
  on: boolean
  disabled: boolean
  onToggle: (deviceId: string | number, e: React.MouseEvent) => void
}) {
  const helpId = `ac-output-help-${deviceId}`
  // Shared correctly-centered track with Settings ToggleSwitch (ui-fix-toggle).
  // Labelled "AC Output" beside it: an unlabelled switch read as whole-unit
  // power, so a battery still charging (lights on) after "off" looked like a
  // failed command (APP-20260922-004). It only switches the AC outlets.
  return (
    <span className="flex items-center gap-2">
      <span className="text-label text-ink-5" aria-hidden>AC Output</span>
      <span id={helpId} className="sr-only">{AC_OUTPUT_HELP}</span>
      <ToggleSwitch
        isOn={on}
        disabled={disabled}
        haptic={false}
        ariaLabel="AC Output"
        ariaDescribedBy={helpId}
        onToggle={() => {
          // Synthetic event: DeviceListCard already stopPropagations on the wrapper.
          onToggle(deviceId, { stopPropagation() {}, preventDefault() {} } as React.MouseEvent)
        }}
      />
    </span>
  )
}
