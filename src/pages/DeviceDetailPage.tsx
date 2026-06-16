import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Battery,
  Zap,
  Refrigerator,
  Server,
  Lamp,
  Fish,
  PlugZap,
  Wifi,
  BookOpen,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useConnectionStore } from '../stores/connectionStore'
import { useDeviceStore } from '../stores/deviceStore'
import { mapFieldsToRealtime } from '../api/deviceApi'
import appVersion from '../version.json'

interface DeviceDetailPageProps {
  /** When rendered as an overlay (inside OverviewPage) a custom back handler is
   *  passed; when mounted as a standalone route we fall back to navigate(-1). */
  onBack?: () => void
}

type Screen = 'main' | 'editName' | 'displayIcon' | 'deviceInfo'

const DISPLAY_ICONS = [
  { id: 'zap', Icon: Zap, label: 'Power Station' },
  { id: 'refrigerator', Icon: Refrigerator, label: 'Refrigerator' },
  { id: 'server', Icon: Server, label: 'Server' },
  { id: 'lamp', Icon: Lamp, label: 'Lamp' },
  { id: 'fish', Icon: Fish, label: 'Aquarium' },
  { id: 'plugzap', Icon: PlugZap, label: 'EV Charger' },
  { id: 'wifi', Icon: Wifi, label: 'Router' },
  { id: 'cpap', Icon: BookOpen, label: 'CPAP' },
]

export default function DeviceDetailPage({ onBack }: DeviceDetailPageProps) {
  const { powerStation, settings, selectedDeviceId, updateDeviceNameById, updateDeviceSpecs, peakShavingSettings } =
    usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource } = useConnectionStore()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()

  // ── Real device data (useDeviceStore) — used when mounted as a route ──
  const { devices, selectedDeviceState, selectDevice, loadDeviceState, renameDeviceLocal } = useDeviceStore()
  const realDevice = devices.find(d => String(d.id) === routeId)

  // Standalone route: ensure the real device + its realtime state are loaded
  useEffect(() => {
    if (routeId) {
      selectDevice(routeId)
      loadDeviceState(routeId)
    }
  }, [routeId])

  // Realtime fields (battery health / cycles / temp / voltage) for Device Info
  const realtime = useMemo(
    () => (selectedDeviceState?.fields ? mapFieldsToRealtime(selectedDeviceState.fields) : null),
    [selectedDeviceState]
  )
  const rtField = (key: string): string | undefined => selectedDeviceState?.fields?.[key]?.valueDisplay

  // Prefer real device info, fall back to the mock powerStation profile
  const deviceName = realDevice?.name ?? powerStation.name
  const handleBack = onBack ?? (() => navigate(-1))

  const [screen, setScreen] = useState<Screen>('main')
  const [editName, setEditName] = useState(deviceName)
  // 设备名称编辑：当前正在编辑的目标设备 + 下拉选择器
  const [editTargetId, setEditTargetId] = useState<string>(routeId ?? selectedDeviceId ?? '')
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false)
  const [sleepMode, setSleepMode] = useState<'Off' | 'On'>('Off')
  const [batteryPriority] = useState('Backup Mode')
  const [selectedIcon, setSelectedIcon] = useState('zap')
  const [pendingIcon, setPendingIcon] = useState('zap')

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // 当前正在编辑的目标设备及其原始名称（用于判断 Save 是否可点击）
  const editTargetDevice = devices.find(d => String(d.id) === editTargetId)
  const editTargetOriginalName = editTargetDevice?.name ?? deviceName
  const nameChanged = editName.trim().length > 0 && editName.trim() !== editTargetOriginalName

  const handleSaveName = () => {
    if (!nameChanged) return
    const trimmed = editName.trim()
    const targetId = editTargetId || routeId || selectedDeviceId
    if (targetId) {
      // 同步到两个 store：home page (deviceStore) + 详情/下拉菜单 (powerStationStore)
      renameDeviceLocal(targetId, trimmed)
      updateDeviceNameById(targetId, trimmed)
    }
    setShowDeviceDropdown(false)
    setScreen('main')
  }

  // 切换下拉中选择的设备：载入其当前名称
  const handleSelectDevice = (id: string) => {
    setEditTargetId(id)
    const dev = devices.find(d => String(d.id) === id)
    setEditName(dev?.name ?? '')
    setShowDeviceDropdown(false)
  }

  const handleSaveIcon = () => {
    setSelectedIcon(pendingIcon)
    setScreen('main')
  }

  const CurrentIconComp =
    DISPLAY_ICONS.find((i) => i.id === selectedIcon)?.Icon ?? Battery

  // ─── Back button (shared) ─────────────────────────────────────────────────

  const BackBtn = ({ to }: { to: Screen | 'parent' }) => (
    <button
      onClick={() => (to === 'parent' ? handleBack() : setScreen(to as Screen))}
      className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
    >
      <ChevronLeft size={20} className="text-white" />
    </button>
  )

  // ─── Info row (Device Info screen) ───────────────────────────────────────

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between px-4 py-4 border-b border-white/5 last:border-0">
      <span className="text-body-md text-[#A0A0A5]">{label}</span>
      <span className="text-body-md text-white">{value}</span>
    </div>
  )

  // ─── Settings row (main screen) ───────────────────────────────────────────

  const SettingsRow = ({
    label,
    value,
    preview,
    onPress,
  }: {
    label: string
    value?: string
    preview?: React.ReactNode
    onPress: () => void
  }) => (
    <div
      onClick={onPress}
      className="rounded-l bg-[#262626] mb-2 px-4 py-4 flex items-center justify-between cursor-pointer active:opacity-70 transition-opacity"
    >
      <span className="text-body-lg text-white">{label}</span>
      <div className="flex items-center gap-2">
        {preview}
        {value !== undefined && (
          <span className="text-body-md text-[#A0A0A5]">{value}</span>
        )}
        <ChevronRight size={18} className="text-[#A0A0A5]" />
      </div>
    </div>
  )

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Edit Name
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'editName') {
    return (
      <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Name
          </h1>
          <button
            onClick={handleSaveName}
            disabled={!nameChanged}
            className={`ml-auto text-body-lg font-semibold transition-colors ${
              nameChanged ? 'text-[#01D6BE]' : 'text-[#4A4A4A] cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>

        {/* Device selector dropdown — pick which device to rename */}
        {devices.length > 1 && (
          <div className="px-4 pt-2">
            <span className="text-caption text-[#A0A0A5] block mb-2 px-1">Select Device</span>
            <div className="relative">
              <button
                onClick={() => setShowDeviceDropdown(v => !v)}
                className="w-full rounded-l bg-[#262626] px-4 py-4 flex items-center justify-between active:opacity-70 transition-opacity"
              >
                <span className="text-body-lg text-white truncate">
                  {editTargetDevice?.name ?? editTargetOriginalName}
                </span>
                <ChevronDown
                  size={18}
                  className={`text-[#A0A0A5] transition-transform ${showDeviceDropdown ? 'rotate-180' : ''}`}
                />
              </button>
              {showDeviceDropdown && (
                <div className="absolute left-0 right-0 mt-2 z-10 rounded-l bg-[#262626] border border-white/10 overflow-hidden shadow-xl">
                  {devices.map((d) => {
                    const isSel = String(d.id) === editTargetId
                    return (
                      <button
                        key={d.id}
                        onClick={() => handleSelectDevice(String(d.id))}
                        className="w-full px-4 py-3.5 flex items-center justify-between border-b border-white/5 last:border-0 active:bg-white/5"
                      >
                        <span className={`text-body-md ${isSel ? 'text-[#01D6BE] font-semibold' : 'text-white'}`}>
                          {d.name}
                        </span>
                        {isSel && <Check size={16} className="text-[#01D6BE]" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pt-4">
          <span className="text-caption text-[#A0A0A5] block mb-2 px-1">Name</span>
          <div className="rounded-l bg-[#262626] px-4 py-4 flex items-center gap-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-body-lg text-white outline-none caret-[#01D6BE]"
              placeholder="Device name"
            />
            {editName.length > 0 && (
              <button
                onClick={() => setEditName('')}
                className="w-6 h-6 rounded-full bg-[#A0A0A5]/30 flex items-center justify-center"
              >
                <X size={14} className="text-[#A0A0A5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Display Icon
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'displayIcon') {
    return (
      <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Select Display Icon
          </h1>
        </div>

        {/* Grid */}
        <div className="flex-1 px-4 pt-4">
          <div className="grid grid-cols-4 gap-3">
            {DISPLAY_ICONS.map(({ id, Icon, label }) => (
              <button
                key={id}
                onClick={() => setPendingIcon(id)}
                className={`flex flex-col items-center gap-2 py-4 rounded-l transition-colors ${
                  pendingIcon === id ? 'bg-[#01D6BE]' : 'bg-[#262626]'
                }`}
              >
                <Icon
                  size={28}
                  className={pendingIcon === id ? 'text-black' : 'text-[#A0A0A5]'}
                />
                <span
                  className={`text-label ${
                    pendingIcon === id ? 'text-black font-semibold' : 'text-[#A0A0A5]'
                  }`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="px-4 pb-8 pt-4">
          <button
            onClick={handleSaveIcon}
            className="w-full h-12 rounded-l bg-[#01D6BE] text-black font-semibold text-body-lg active:scale-95 transition-transform"
          >
            Save
          </button>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Device Info
  // ═════════════════════════════════════════════════════════════════════════

  if (screen === 'deviceInfo') {
    return (
      <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative">
          <BackBtn to="main" />
          <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
            Device Info
          </h1>
        </div>

        {/* Info list */}
        <div className="flex-1 overflow-y-auto px-4 pt-2">
          <div className="rounded-l bg-[#262626] overflow-hidden">
            <InfoRow label="Model" value={realDevice?.model || powerStation.model || 'Sierro 1000'} />
            <InfoRow
              label="Serial Number"
              value={realDevice?.serialNumber || (powerStation as any).serialNumber || 'SNXXXX'}
            />
            <InfoRow
              label="Capacity"
              value={
                realDevice?.ratedPower
                  ? `${(realDevice.ratedPower / 1000).toFixed(1)} kWh`
                  : `${(powerStation.totalWh / 1000).toFixed(1)} kWh`
              }
            />
            <InfoRow label="Battery Type" value="LFP" />
            <InfoRow
              label="Firmware Version"
              value={realDevice?.softwareVersion || appVersion.version || '--'}
            />
            <InfoRow
              label="Output Power"
              value={rtField('outputPower') || String(powerStation.specs?.maxOutputPower || '500W')}
            />
            <InfoRow label="Voltage" value={rtField('batteryVoltage') || '120V'} />
            <InfoRow label="Frequency" value="60Hz" />
            <InfoRow
              label="Battery Health"
              value={rtField('batteryHealth') || (realtime?.soc !== undefined ? '98%' : '98%')}
            />
            <InfoRow label="Cycles" value={rtField('batteryCycles') || '286'} />
            <InfoRow
              label="Temperature"
              value={rtField('batteryTemp') || `${powerStation.temperature || '82.4'}°F`}
            />
            <InfoRow
              label="Wi-Fi Status"
              value={realDevice ? (realDevice.isOnline ? 'Connected' : 'Offline') : 'Connected'}
            />
          </div>
        </div>
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // SCREEN: Main — Device Settings
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 relative">
        <BackBtn to="parent" />
        <h1 className="text-title-lg font-semibold text-white absolute left-1/2 -translate-x-1/2">
          Device Settings
        </h1>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8">
        {/* Device Name */}
        <SettingsRow
          label="Device Name"
          value={deviceName}
          onPress={() => {
            const targetId = routeId ?? selectedDeviceId ?? ''
            setEditTargetId(targetId)
            setEditName(deviceName)
            setShowDeviceDropdown(false)
            setScreen('editName')
          }}
        />

        {/* Display Icon */}
        <SettingsRow
          label="Display Icon"
          preview={
            <div className="w-7 h-7 rounded-m bg-[#01D6BE]/10 flex items-center justify-center">
              <CurrentIconComp size={16} className="text-[#01D6BE]" />
            </div>
          }
          onPress={() => {
            setPendingIcon(selectedIcon)
            setScreen('displayIcon')
          }}
        />

        {/* Device Info */}
        <SettingsRow
          label="Device Info"
          onPress={() => setScreen('deviceInfo')}
        />

        {/* Sleep Mode */}
        <SettingsRow
          label="Sleep Mode"
          value={sleepMode}
          onPress={() => setSleepMode((prev) => (prev === 'Off' ? 'On' : 'Off'))}
        />

        {/* Battery Priority */}
        <SettingsRow
          label="Battery Priority"
          value={batteryPriority}
          onPress={() => {}}
        />

        {/* Smart Schedule */}
        <SettingsRow
          label="Smart Schedule"
          value={peakShavingSettings?.enabled ? 'On' : 'Off'}
          onPress={() => navigate('/smart-schedule')}
        />

        {/* Delete Device */}
        <div className="mt-4">
          <button
            onClick={() => {
              // Confirm before deleting
            }}
            className="w-full rounded-l bg-[#262626] px-4 py-4 text-body-lg font-semibold text-[#FF3530] active:opacity-70 transition-opacity"
          >
            Delete Device
          </button>
        </div>
      </div>
    </div>
  )
}
