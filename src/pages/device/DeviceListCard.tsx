import React from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen,
  Fish,
  Lamp,
  PlugZap,
  Refrigerator,
  Server,
  Wifi,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BatteryTag, PowerToggle } from './DeviceCardControls'
import type { DeviceListItem } from '../../api/deviceApi'
import sierroProductImg from '../../assets/sierro-product.webp'

const LUCIDE_ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  refrigerator: Refrigerator,
  server: Server,
  lamp: Lamp,
  fish: Fish,
  plugzap: PlugZap,
  wifi: Wifi,
  cpap: BookOpen,
}

const getSavedDisplayIconId = (deviceId: string): string | null =>
  localStorage.getItem(`sierro-display-icon-${deviceId}`)

/** ~32px top-left icon slot (design p3). Product photo stays in this slot, not an 80px side column. */
function DeviceListIcon({ device, model }: { device: DeviceListItem; model: string }) {
  const savedIconId = getSavedDisplayIconId(String(device.id))
  const slotClass = 'w-8 h-8 flex-shrink-0 flex items-center justify-center'

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
  const SavedIcon = savedIconId ? LUCIDE_ICON_MAP[savedIconId] : null
  if (SavedIcon) {
    return (
      <div className={slotClass}>
        <SavedIcon size={28} strokeWidth={1.75} className="text-white" />
      </div>
    )
  }
  return (
    <div className={slotClass}>
      <img src={sierroProductImg} alt={model} className="w-full h-full object-contain" />
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
      className="bg-ink-10 rounded-l p-5 min-h-[176px] cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-stretch gap-4 min-h-[136px]">
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <DeviceListIcon device={device} model={model} />
          <h3 className="text-title-lg font-semibold text-white leading-tight break-words">{device.name}</h3>
          <p className="text-body-md text-ink-7">{model}</p>
        </div>
        <div className="flex flex-col items-end justify-between flex-shrink-0">
          <BatteryTag
            level={remainingBatteryCapacity}
            unknown={!remainingBatteryCapacityKnown}
            connected={connected}
            charging={isCharging}
          />
          <div onClick={(e) => e.stopPropagation()}>
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
