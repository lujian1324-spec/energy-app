import React from 'react'
import { motion } from 'framer-motion'
import Icon from '../../components/Icon'
import { BatteryTag, PowerToggle } from './DeviceCardControls'
import type { DeviceListItem } from '../../api/deviceApi'
import sierroProductImg from '../../assets/sierro-product.webp'

const PACK_ICON_MAP: Record<string, string> = {
  zap: 'thunder',
  refrigerator: 'fridge',
  server: 'NAS',
  lamp: 'lamp',
  fish: 'fish tank',
  plugzap: 'plug',
  wifi: 'router',
  cpap: 'CPAP',
}

const getSavedDisplayIconId = (deviceId: string): string | null =>
  localStorage.getItem(`sierro-display-icon-${deviceId}`)

/**
 * Handoff `A_1.1.1_Homepage -v Default` draws the device-type glyph (fridge / NAS /
 * router …) in the card's icon slot, not a generic bolt. Until a device carries an
 * explicit display icon we infer one from its name; `thunder` stays the last resort.
 */
const NAME_ICON_RULES: [RegExp, string][] = [
  [/\b(nas|server|synology)\b/i, 'NAS'],
  [/\b(fridge|refrigerator|freezer)\b/i, 'fridge'],
  [/\b(router|wifi|wi-fi|modem|gateway)\b/i, 'router'],
  [/\bcpap\b/i, 'CPAP'],
  [/\b(lamp|light|lighting)\b/i, 'lamp'],
  [/\b(fish|aquarium|tank)\b/i, 'fish tank'],
  [/\b(power ?strip|extension)\b/i, 'power strip'],
  [/\b(plug|socket|outlet)\b/i, 'plug'],
  [/\b(network|switch|hub)\b/i, 'network'],
]

export function guessDeviceIconName(deviceName: string): string {
  for (const [re, icon] of NAME_ICON_RULES) {
    if (re.test(deviceName)) return icon
  }
  return 'thunder'
}

/** ~32px top-left icon slot (design p3). Default is a linear icon, not an 80px product photo. */
function DeviceListIcon({ device, model }: { device: DeviceListItem; model: string }) {
  const savedIconId = getSavedDisplayIconId(String(device.id))
  const slotClass = 'w-7 h-7 flex-shrink-0 flex items-center justify-center'

  if (savedIconId === 'custom') {
    const customImg = localStorage.getItem(`sierro-display-icon-custom-${device.id}`)
    if (customImg) {
      return (
        <div className={slotClass}>
          <img src={customImg} alt={device.name} className="w-full h-full object-cover rounded-s" />
        </div>
      )
    }
  }
  if (savedIconId === 'photo') {
    return (
      <div className={slotClass}>
        <img src={sierroProductImg} alt={model} className="w-full h-full object-contain" />
      </div>
    )
  }
  const packName = savedIconId ? PACK_ICON_MAP[savedIconId] : null
  if (packName) {
    return (
      <div className={slotClass}>
        <Icon name={packName} size={28} />
      </div>
    )
  }
  return (
    <div className={slotClass}>
      <Icon name={guessDeviceIconName(device.name)} size={28} />
    </div>
  )
}

export default function DeviceListCard({
  device,
  index,
  model,
  remainingBatteryCapacity,
  remainingBatteryCapacityKnown,
  isCharging,
  connected,
  powerOn,
  toggling,
  onClick,
  onTogglePower,
}: {
  device: DeviceListItem
  index: number
  model: string
  remainingBatteryCapacity: number
  remainingBatteryCapacityKnown: boolean
  isCharging: boolean
  connected: boolean
  powerOn: boolean
  toggling: boolean
  onClick: () => void
  onTogglePower: (deviceId: string | number, e: React.MouseEvent) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onClick}
      className="bg-ink-10 rounded-l p-5 min-h-[150px] cursor-pointer active:scale-[0.99] transition-transform"
    >
      {/* 4x export: card 370x150, padding 20, icon 28, icon->name 13, name 18/semibold
          white, name->model 3.5, model 10 (tiny) on ink-3, 2-line clamp on long names. */}
      <div className="flex items-stretch gap-4 min-h-[110px]">
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="mb-3">
            <DeviceListIcon device={device} model={model} />
          </div>
          <h3 className="text-title-md font-semibold text-white break-words line-clamp-2">{device.name}</h3>
          <p className="text-tiny text-ink-3 mt-1">{model}</p>
        </div>
        <div className="flex flex-col items-end justify-between flex-shrink-0">
          <BatteryTag
            level={remainingBatteryCapacity}
            unknown={!remainingBatteryCapacityKnown}
            connected={connected}
            charging={isCharging}
          />
          <div className="flex" onClick={(e) => e.stopPropagation()}>
            <PowerToggle
              deviceId={device.id}
              on={powerOn}
              disabled={!connected || toggling}
              onToggle={onTogglePower}
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
