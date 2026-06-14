import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
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
  const { powerStation, settings, selectedDeviceId, updateDeviceNameById, updateDeviceSpecs } =
    usePowerStationStore()
  const { bleConnection, serialConnection, activeDataSource } = useConnectionStore()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()

  // ── Real device data (useDeviceStore) — used when mounted as a route ──
  const { devices, selectedDeviceState, selectDevice, loadDeviceState } = useDeviceStore()
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
  const [sleepMode, setSleepMode] = useState<'Off' | 'On'>('Off')
  const [batteryPriority] = useState('Backup Mode')
  const [selectedIcon, setSelectedIcon] = useState('zap')
  const [pendingIcon, setPendingIcon] = useState('zap')

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const handleSaveName = () => {
    const trimmed = editName.trim()
    if (trimmed) {
      const targetId = routeId ?? selectedDeviceId
      if (targetId) updateDeviceNameById(targetId, trimmed)
    }
    setScreen('main')
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
            className="ml-auto text-body-lg font-semibold text-[#01D6BE]"
          >
            Save
          </button>
        </div>

        {/* Input */}
        <div className="px-4 pt-4">
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
            setEditName(deviceName)
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
          value="Off"
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
