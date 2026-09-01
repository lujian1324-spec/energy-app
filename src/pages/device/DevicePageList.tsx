import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Zap, Refrigerator, Server, Lamp, Fish, PlugZap, Wifi, BookOpen } from 'lucide-react'
import PullToRefresh from '../../components/PullToRefresh'
import LowBatteryBanner from './LowBatteryBanner'
import DeviceEmptyState from './DeviceEmptyState'
import { BatteryTag, PowerToggle } from './DeviceCardControls'
import type { DeviceListItem } from '../../api/deviceApi'

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

export default function DevicePageList({
  loadDevices,
  lowBatteryDevice,
  bannerDismissed,
  lowBatteryTimeStr,
  onOpenNotifications,
  onDismissBanner,
  deviceLoading,
  devices,
  devicesListReady,
  getDeviceNum,
  getDeviceImage,
  getDeviceModel,
  powerStates,
  togglingPower,
  togglePower,
  handleDeviceClick,
  error,
  fetchDevices,
  onAddDevice,
}: {
  loadDevices: (page: number, size: number) => Promise<unknown>
  lowBatteryDevice: DeviceListItem | undefined
  bannerDismissed: boolean
  lowBatteryTimeStr: string | null
  onOpenNotifications: () => void
  onDismissBanner: () => void
  deviceLoading: boolean
  devices: DeviceListItem[]
  devicesListReady: boolean
  getDeviceNum: (deviceId: string | number, key: string) => number | null
  getDeviceImage: (sortKey?: string) => string
  getDeviceModel: (device: DeviceListItem) => string
  powerStates: Record<string, boolean>
  togglingPower: Set<string>
  togglePower: (deviceId: string | number, e: React.MouseEvent) => void
  handleDeviceClick: (device: DeviceListItem) => void
  error: string | null
  fetchDevices: () => void
  onAddDevice: () => void
}) {
  return (
    <PullToRefresh onRefresh={async () => { await loadDevices(1, 50) }}>
      <div className="px-4 pb-4">
        <AnimatePresence>
          {lowBatteryDevice && !bannerDismissed && (
            <LowBatteryBanner
              name={lowBatteryDevice.name}
              durationStr={lowBatteryTimeStr}
              onOpen={onOpenNotifications}
              onDismiss={onDismissBanner}
            />
          )}
        </AnimatePresence>

        {deviceLoading && devices.length === 0 && !devicesListReady ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-l p-4 bg-ink-10 animate-pulse h-[140px]" />
            ))}
          </div>
        ) : devices.length > 0 ? (
          <div className="flex flex-col gap-3">
            {devices.map((device, index) => {
              const remainingBatteryCapacityRaw = getDeviceNum(device.id, 'remainingBatteryCapacity')
              const remainingBatteryCapacity = remainingBatteryCapacityRaw ?? 0
              const remainingBatteryCapacityKnown = remainingBatteryCapacityRaw !== null
              const batteryPower = getDeviceNum(device.id, 'batteryPower')
              const isCharging = batteryPower !== null && batteryPower > 0
              const connected = device.isOnline
              const powerOn = powerStates[String(device.id)] ?? device.isOnline
              return (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                  onClick={() => handleDeviceClick(device)}
                  className="bg-ink-10 rounded-l p-4 min-h-[140px] cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-stretch gap-3 min-h-[108px]">
                    {(() => {
                      const savedIconId = getSavedDisplayIconId(String(device.id))
                      const slotClass = "w-20 h-20 flex-shrink-0 flex items-center justify-center self-center"
                      if (savedIconId === 'custom') {
                        const customImg = localStorage.getItem(`sierro-display-icon-custom-${device.id}`)
                        if (customImg) {
                          return (
                            <div className={slotClass}>
                              <img src={customImg} alt={device.name} className="w-full h-full object-cover rounded-m" />
                            </div>
                          )
                        }
                      }
                      if (savedIconId === 'photo') {
                        return (
                          <div className={slotClass}>
                            <img src={getDeviceImage(device.deviceSortKey)} alt={getDeviceModel(device)} className="w-full h-full object-contain drop-shadow-sm" />
                          </div>
                        )
                      }
                      const SavedIcon = savedIconId ? LUCIDE_ICON_MAP[savedIconId] : null
                      if (SavedIcon) {
                        return (
                          <div className={slotClass}>
                            <SavedIcon size={48} className="text-white" />
                          </div>
                        )
                      }
                      return (
                        <div className={slotClass}>
                          <img src={getDeviceImage(device.deviceSortKey)} alt={getDeviceModel(device)} className="w-full h-full object-contain drop-shadow-sm" />
                        </div>
                      )
                    })()}
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <h3 className="text-title-lg font-semibold text-white leading-tight line-clamp-2 break-words">{device.name}</h3>
                      <p className="text-body-md text-ink-7 mt-0.5">{getDeviceModel(device)}</p>
                    </div>
                    <div className="flex flex-col items-end justify-between flex-shrink-0">
                      <BatteryTag level={remainingBatteryCapacity} unknown={!remainingBatteryCapacityKnown} connected={connected} charging={isCharging} />
                      <div onClick={(e) => e.stopPropagation()}>
                        <PowerToggle deviceId={device.id} on={powerOn} disabled={!connected || togglingPower.has(String(device.id))} onToggle={togglePower} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        ) : (
          <DeviceEmptyState
            error={error}
            onRetry={fetchDevices}
            onAddDevice={onAddDevice}
          />
        )}
      </div>
    </PullToRefresh>
  )
}
