/**
 * BLE provisioning UI — PRD-aligned redesign.
 * All store/API/protocol logic preserved from original.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, X, Wifi, WifiOff, Lock, Loader2,
  AlertCircle, CheckCircle, XCircle, RefreshCw,
  Eye, EyeOff, Server,
  Zap, Refrigerator, Lamp, Car, Plug, Fan, BedDouble,
} from 'lucide-react'
import jsQR from 'jsqr'
import { useProvisionStore, type ProvisionStep } from '../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager } from '../protocols/bleProvision'

// Local UI screens — the multi-step store flow lives inside 'provisioning'
type UiScreen = 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning'

// Device icon choices (Figma "Choose an Icon")
const DEVICE_ICONS = [
  { id: 'power', Icon: Zap },
  { id: 'fridge', Icon: Refrigerator },
  { id: 'server', Icon: Server as typeof Zap },
  { id: 'lamp', Icon: Lamp },
  { id: 'car', Icon: Car },
  { id: 'plug', Icon: Plug },
  { id: 'fan', Icon: Fan },
  { id: 'bed', Icon: BedDouble },
] as const

// Radar ring animation keyframes via inline style
const radarRings = [0, 1, 2, 3]

// ─── QR Scanner component (jsQR + getUserMedia) ──────────────────────────
function QrScanScreen({ onBack, onScanned }: {
  onBack: () => void
  onScanned: (name: string, serial: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanned, setScanned] = useState<{ name: string; serial: string } | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  useEffect(() => {
    let stopped = false
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCameraReady(true)
        }
      } catch {
        setError('Camera permission denied. Please allow camera access and try again.')
      }
    }
    start()
    return () => {
      stopped = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    if (!cameraReady) return
    const scan = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(scan); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)
      if (code?.data) {
        // Sierro QR format: "SIERRO:<model>:<serial>" or plain serial
        const parts = code.data.split(':')
        const name = parts.length >= 2 ? parts[1] : 'Sierro Device'
        const serial = parts.length >= 3 ? parts[2] : code.data
        streamRef.current?.getTracks().forEach(t => t.stop())
        setScanned({ name, serial })
        return
      }
      rafRef.current = requestAnimationFrame(scan)
    }
    rafRef.current = requestAnimationFrame(scan)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [cameraReady])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top absolute top-0 left-0 right-0 z-10">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[rgba(0,0,0,0.5)] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-title-lg font-semibold text-white">Scan QR Code</h1>
      </div>

      {/* Camera feed */}
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dark overlay with viewfinder cutout */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-64 h-64">
          {/* corners */}
          {[['top-0 left-0', 'M0 20V4C0 1.79 1.79 0 4 0H20'],
            ['top-0 right-0', 'M24 20V4C24 1.79 22.21 0 20 0H4'],
            ['bottom-0 left-0', 'M0 4V20C0 22.21 1.79 24 4 24H20'],
            ['bottom-0 right-0', 'M24 4V20C24 22.21 22.21 24 20 24H4'],
          ].map(([pos, d], i) => (
            <svg key={i} className={`absolute ${pos}`} width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d={d} stroke="#01D6BE" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-10 safe-area-bottom">
        {error ? (
          <div className="bg-danger/90 rounded-l p-4 text-center">
            <p className="text-white text-body-md">{error}</p>
            <button onClick={onBack} className="mt-3 text-white font-semibold underline text-body-md">Go Back</button>
          </div>
        ) : scanned ? (
          <div className="bg-[rgba(0,0,0,0.85)] rounded-l p-5">
            <p className="text-caption text-primary font-semibold uppercase tracking-widest mb-1">Device Scanned</p>
            <p className="text-title-md font-bold text-white">{scanned.name}</p>
            <p className="text-caption text-[#BFBFBF] mb-5">{scanned.serial}</p>
            <div className="flex gap-3">
              <button onClick={() => { setScanned(null); setCameraReady(false); setTimeout(() => setCameraReady(true), 100) }}
                className="flex-1 h-12 rounded-full border border-[rgba(255,255,255,0.3)] text-white font-semibold text-body-md">
                Rescan
              </button>
              <button onClick={() => onScanned(scanned.name, scanned.serial)}
                className="flex-1 h-12 rounded-full bg-primary text-black font-semibold text-body-md">
                Connect Device
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center text-[rgba(255,255,255,0.7)] text-body-md">
            Point your camera at the QR code on your Sierro device
          </p>
        )}
      </div>
    </div>
  )
}

export default function ProvisioningPage({ onClose }: { onClose: () => void }) {
  const store = useProvisionStore()

  const [uiScreen, setUiScreen] = useState<UiScreen>('scan')
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [bleKeyInput, setBleKeyInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState<string>('power')

  // Simulate found devices list on top of real BLE scan
  const [foundDevices, setFoundDevices] = useState<{ name: string; serial: string }[]>([])
  const [showNotifSheet, setShowNotifSheet] = useState(false)

  // ─── BLE permission & availability state ─────────────────────────────────
  type BleStatus = 'checking' | 'no_permission' | 'bt_off' | 'ready'
  const [bleStatus, setBleStatus] = useState<BleStatus>('checking')

  useEffect(() => {
    const check = async () => {
      if (!('bluetooth' in navigator)) { setBleStatus('no_permission'); return }
      try {
        // @ts-ignore — navigator.bluetooth.getAvailability() is standard
        const available = await (navigator as any).bluetooth.getAvailability()
        setBleStatus(available ? 'ready' : 'bt_off')
      } catch {
        setBleStatus('ready') // can't check, assume ready
      }
    }
    check()
  }, [])

  // ─── BLE Scan ────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog('Starting BLE scan...')
    setFoundDevices([])
    // Always destroy stale singleton before a new scan
    destroyProvisionManager()
    try {
      const manager = getProvisionManager({
        onLog: (msg) => store.addLog(msg),
        onDisconnected: () => store.setErrorMessage('Device disconnected'),
      })
      await manager.connect()
      const name = manager.btDevice?.name ?? 'Sierro Device'
      const duid = manager.getDuid()
      store.setDeviceInfo(name, duid)
      setFoundDevices([{ name, serial: duid ?? 'Unknown' }])
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'Scan failed')
      store.addLog(`Scan failed: ${err}`)
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── Verify ──────────────────────────────────────────────────────────────

  const handleVerify = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.getVersion()
      if (resp.RC === 9000) {
        store.setNeedBleKey(true)
        return
      }
      if (resp.RC === 0 && resp.PL) {
        const pl = resp.PL as { SV: string; HV: string }
        store.setVersionInfo(pl.SV, pl.HV)
        store.setStep('wifi')
      } else {
        store.setErrorMessage(`Verification failed: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  const handleConfirmBleKey = useCallback(async () => {
    if (!store.dtuid || !bleKeyInput.trim()) return
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.confirmBleKey(bleKeyInput.trim())
      if (resp.RC === 0) {
        store.setBleKeyVerified(true)
        store.setNeedBleKey(false)
        await handleVerify()
      } else {
        store.setErrorMessage(resp.RC === 9001 ? 'Incorrect BLE key, please retry' : `Key error: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'Key verification failed')
    } finally {
      store.setIsOperating(false)
    }
  }, [store, bleKeyInput, handleVerify])

  // ─── WiFi ─────────────────────────────────────────────────────────────────

  const handleScanWifi = useCallback(async () => {
    if (!store.dtuid) return
    store.setApLoading(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.scanAp()
      if (resp.RC === 0 && resp.PL) {
        store.setApList(Array.isArray(resp.PL) ? resp.PL : [])
        store.setStep('password')
      } else {
        store.setErrorMessage(`WiFi scan failed: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'WiFi scan failed')
    } finally {
      store.setApLoading(false)
    }
  }, [store])

  const handleConfig = useCallback(async () => {
    if (!store.dtuid || !store.selectedSsid) return
    store.setStep('configuring')
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.configWifi(store.selectedSsid, store.wifiPassword)
      store.setConfigResult(resp.RC === 0 ? 'success' : 'fail')
      if (resp.RC !== 0) store.setErrorMessage(`Config failed: RC=${resp.RC}`)
      store.setStep('result')
    } catch (err) {
      store.setConfigResult('fail')
      store.setErrorMessage(err instanceof Error ? err.message : 'Config failed')
      store.setStep('result')
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  const handleCheckStatus = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    try {
      const manager = getProvisionManager()
      const resp = await manager.getWifiStatus()
      if (resp.RC === 0 && resp.PL) store.setWifiStatus(resp.PL)
    } catch {}
    finally { store.setIsOperating(false) }
  }, [store])

  const handleRestart = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    try { await getProvisionManager().restart() } catch {}
    finally { store.setIsOperating(false) }
  }, [store])

  // ─── Close ───────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    destroyProvisionManager()
    store.reset()
    onClose()
  }, [store, onClose])

  // ─── Connect to a found device ───────────────────────────────────────────

  const handleConnect = useCallback(() => {
    setDeviceNameInput(store.deviceName ?? 'My Device')
    setNameError('')
    setUiScreen('naming')
  }, [store.deviceName])

  // ─── Name confirmed → start provisioning ─────────────────────────────────

  const handleNameNext = useCallback(() => {
    const trimmed = deviceNameInput.trim()
    if (!trimmed) { setNameError('Please enter a device name.'); return }
    // TODO: check for duplicate names against existing devices
    setNameError('')
    setUiScreen('icon')
  }, [deviceNameInput])

  // ─── Icon chosen → start provisioning ─────────────────────────────────────

  const handleIconNext = useCallback(() => {
    store.setStep('verify')
    setUiScreen('provisioning')
    handleVerify()
  }, [store, handleVerify])

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Scan
  // ══════════════════════════════════════════════════════════════════════════

  if (uiScreen === 'scan') {
    const isSearching = store.isOperating
    const hasDevices = foundDevices.length > 0
    const hasError = !isSearching && store.errorMessage && !hasDevices

    // ── Permission Required screen ──
    if (bleStatus === 'no_permission') {
      return (
        <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
          <div className="px-4 pt-5 pb-4 flex items-center safe-area-top">
            <button onClick={handleClose} className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center">
              <ChevronLeft size={20} className="text-white" />
            </button>
            <h1 className="text-title-lg font-semibold text-white ml-3">Add Device</h1>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 rounded-[28px] bg-[rgba(255,59,48,0.1)] flex items-center justify-center mb-6">
              <AlertCircle size={36} className="text-danger" />
            </div>
            <h2 className="text-headline-md font-bold text-white mb-3">Permission Required</h2>
            <p className="text-body-md text-[#BFBFBF] mb-8">
              Bluetooth and Local Network access are required to connect your Sierro device. Please enable them in Settings.
            </p>
          </div>
          <div className="px-6 pb-10 safe-area-bottom">
            <button
              onClick={() => window.open('app-settings:', '_blank')}
              className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold"
            >
              Open Settings
            </button>
          </div>
        </div>
      )
    }

    // ── Bluetooth Off screen ──
    if (bleStatus === 'bt_off') {
      return (
        <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
          <div className="px-4 pt-5 pb-4 flex items-center safe-area-top">
            <button onClick={handleClose} className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center">
              <ChevronLeft size={20} className="text-white" />
            </button>
            <h1 className="text-title-lg font-semibold text-white ml-3">Add Device</h1>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-20 h-20 rounded-[28px] bg-[rgba(1,214,190,0.1)] flex items-center justify-center mb-6">
              <WifiOff size={36} className="text-primary" />
            </div>
            <h2 className="text-headline-md font-bold text-white mb-3">Bluetooth is Off</h2>
            <p className="text-body-md text-[#BFBFBF] mb-8">
              Please enable Bluetooth on your device to scan for nearby Sierro devices.
            </p>
          </div>
          <div className="px-6 pb-10 safe-area-bottom space-y-3">
            <button
              onClick={() => setBleStatus('ready')}
              className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold"
            >
              I've Enabled Bluetooth
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center justify-between safe-area-top">
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
          <h1 className="text-title-lg font-semibold text-white">Add Device</h1>
          <button
            onClick={() => setUiScreen('qr')}
            className="text-body-md font-semibold text-primary"
          >
            Scan QR
          </button>
        </div>

        <div className="flex-1 flex flex-col px-6">
          {/* Radar animation area */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-56 h-56 flex items-center justify-center mb-8">
              {/* Concentric radar rings */}
              {radarRings.map((i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-primary"
                  style={{ width: 56 + i * 40, height: 56 + i * 40 }}
                  animate={{ opacity: isSearching ? [0.6, 0.1, 0.6] : 0.15 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.4,
                    ease: 'easeInOut',
                  }}
                />
              ))}
              {/* Centre phone icon */}
              <div className="w-16 h-16 rounded-l bg-[#262626] flex items-center justify-center z-10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="2" width="14" height="20" rx="3" stroke="#01D6BE" strokeWidth="1.5"/>
                  <circle cx="12" cy="18" r="1" fill="#01D6BE"/>
                </svg>
              </div>
            </div>

            {/* Status text */}
            {isSearching && (
              <div className="text-center mb-6">
                <p className="text-body-lg font-semibold text-white mb-1">Searching for nearby devices...</p>
                <p className="text-body-md text-[#BFBFBF]">Make sure your device is powered on and nearby.</p>
              </div>
            )}

            {!isSearching && !hasDevices && !store.errorMessage && (
              <div className="text-center mb-6">
                <p className="text-body-lg font-semibold text-white mb-1">Ready to Scan</p>
                <p className="text-body-md text-[#BFBFBF]">Tap the button below to search for nearby devices.</p>
              </div>
            )}

            {hasError && (
              <div className="text-center mb-6">
                <p className="text-body-lg font-semibold text-white mb-1">No Devices Found</p>
                <p className="text-body-md text-[#BFBFBF]">Make sure your device is powered on and Bluetooth is enabled.</p>
              </div>
            )}

            {/* Found devices list */}
            {hasDevices && (
              <div className="w-full mb-6">
                <p className="text-caption font-bold text-[#BFBFBF] tracking-widest uppercase mb-3 px-1">
                  Found Devices ({foundDevices.length})
                </p>
                <div className="flex flex-col gap-2">
                  {foundDevices.map((device, i) => (
                    <div
                      key={i}
                      className="bg-[#262626] rounded-l px-4 py-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-body-lg font-semibold text-white">{device.name}</p>
                        <p className="text-caption text-[#BFBFBF] mt-0.5">{device.serial}</p>
                      </div>
                      <button
                        onClick={handleConnect}
                        className="px-4 h-9 rounded-full border border-primary text-primary text-body-md font-semibold"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom button */}
          <div className="pb-10 safe-area-bottom">
            {(hasError || !isSearching) && !hasDevices && (
              <button
                onClick={handleScan}
                disabled={isSearching}
                className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
                  disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
              >
                {hasError ? 'Search Again' : 'Search for Devices'}
              </button>
            )}
            {isSearching && (
              <button
                disabled
                className="w-full h-14 rounded-full bg-primary-dark text-[rgba(0,0,0,0.4)] text-body-lg font-semibold flex items-center justify-center gap-2"
              >
                <Loader2 size={18} className="animate-spin" />
                Searching...
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: QR Scanner
  // ══════════════════════════════════════════════════════════════════════════

  if (uiScreen === 'qr') {
    return <QrScanScreen
      onBack={() => setUiScreen('scan')}
      onScanned={(name, serial) => {
        store.setDeviceInfo(name, serial)
        setFoundDevices([{ name, serial }])
        setUiScreen('naming')
      }}
    />
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Name Your Device
  // ══════════════════════════════════════════════════════════════════════════

  if (uiScreen === 'naming') {
    return (
      <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
          <button
            onClick={() => setUiScreen('scan')}
            className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
        </div>

        <div className="flex-1 px-6 pt-6">
          <h1 className="text-headline-lg font-bold text-white mb-2">Name Your Device</h1>
          <p className="text-body-md text-[#BFBFBF] mb-8">
            Give your device a name so you can easily identify it.
          </p>

          {/* Input card */}
          <div className={`bg-[#262626] rounded-l px-4 py-4 flex items-center gap-3 mb-2
            ${nameError ? 'border border-danger' : ''}`}
          >
            <input
              type="text"
              value={deviceNameInput}
              onChange={(e) => { setDeviceNameInput(e.target.value); setNameError('') }}
              placeholder="Device name"
              autoFocus
              className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] outline-none caret-primary"
            />
            {deviceNameInput.length > 0 && (
              <button onClick={() => setDeviceNameInput('')}>
                <X size={16} className="text-[#8C8C8C]" />
              </button>
            )}
          </div>

          {nameError && (
            <p className="text-danger text-body-md mt-1">{nameError}</p>
          )}
        </div>

        {/* Next button */}
        <div className="px-6 pb-10 safe-area-bottom">
          <button
            onClick={handleNameNext}
            disabled={!deviceNameInput.trim()}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
              disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Choose an Icon
  // ══════════════════════════════════════════════════════════════════════════

  if (uiScreen === 'icon') {
    return (
      <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
          <button
            onClick={() => setUiScreen('naming')}
            className="w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>
        </div>

        <div className="flex-1 px-6 pt-6">
          <h1 className="text-headline-lg font-bold text-white mb-2 text-center">Choose an Icon</h1>
          <p className="text-body-md text-ink-6 mb-8 text-center">
            Select an icon that best represents this device.
          </p>

          {/* Icon grid (4 columns) */}
          <div className="grid grid-cols-4 gap-3">
            {DEVICE_ICONS.map(({ id, Icon }) => {
              const active = selectedIcon === id
              return (
                <button
                  key={id}
                  onClick={() => setSelectedIcon(id)}
                  className={`aspect-square rounded-l flex items-center justify-center transition-all active:scale-95
                    ${active ? 'bg-primary text-ink-13' : 'bg-ink-10 text-ink-4'}`}
                >
                  <Icon size={26} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Finish button */}
        <div className="px-6 pb-10 safe-area-bottom">
          <button
            onClick={handleIconNext}
            className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
              disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
          >
            Finish
          </button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN: Provisioning (verify → wifi → password → configuring → result)
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-[#141414] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => setUiScreen('naming')}
          className="w-10 h-10 rounded-full bg-[#262626] flex items-center justify-center"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-title-lg font-semibold text-white">
          {store.step === 'verify' && 'Verifying Device'}
          {store.step === 'wifi' && 'Select Wi-Fi'}
          {store.step === 'password' && 'Wi-Fi Password'}
          {store.step === 'configuring' && 'Connecting...'}
          {store.step === 'result' && (store.configResult === 'success' ? 'Connected!' : 'Setup Failed')}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <AnimatePresence mode="wait">

          {/* verify */}
          {store.step === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-10">
                <div className="w-16 h-16 rounded-l bg-[rgba(1,214,190,0.12)] flex items-center justify-center mb-4">
                  <CheckCircle size={28} className="text-primary" />
                </div>
                <p className="text-body-lg font-semibold text-white mb-1">{store.deviceName}</p>
                {store.dtuid && <p className="text-caption text-[#BFBFBF]">{store.dtuid}</p>}
              </div>

              {store.needBleKey && !store.bleKeyVerified && (
                <div className="bg-[#262626] rounded-l px-4 py-4 mb-4">
                  <p className="text-body-md font-semibold text-white mb-3">BLE Key Required</p>
                  <input
                    type="password"
                    value={bleKeyInput}
                    onChange={(e) => setBleKeyInput(e.target.value)}
                    placeholder="Enter BLE key"
                    className="w-full bg-[#1A1A1A] rounded-m px-4 py-3 text-body-md text-white placeholder:text-[#8C8C8C] outline-none border border-[rgba(255,255,255,0.08)] focus:border-primary mb-3"
                  />
                  <button
                    onClick={handleConfirmBleKey}
                    disabled={store.isOperating || !bleKeyInput.trim()}
                    className="w-full h-11 rounded-full bg-primary text-black text-body-md font-semibold disabled:opacity-50 flex items-center justify-center"
                  >
                    {store.isOperating ? <Loader2 size={16} className="animate-spin" /> : 'Verify Key'}
                  </button>
                </div>
              )}

              {!store.needBleKey && (
                <button
                  onClick={handleScanWifi}
                  disabled={store.isOperating}
                  className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
                    disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {store.isOperating ? <Loader2 size={18} className="animate-spin" /> : 'Scan Wi-Fi Networks'}
                </button>
              )}
            </motion.div>
          )}

          {/* wifi */}
          {store.step === 'wifi' && (
            <motion.div key="wifi" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-4">
              {store.apLoading ? (
                <div className="flex items-center justify-center py-20 gap-3">
                  <Loader2 size={24} className="text-primary animate-spin" />
                  <span className="text-body-md text-[#BFBFBF]">Scanning Wi-Fi...</span>
                </div>
              ) : store.apList.length === 0 ? (
                <div className="text-center py-16">
                  <WifiOff size={36} className="text-[#8C8C8C] mx-auto mb-4" />
                  <p className="text-body-md text-[#BFBFBF] mb-4">No Wi-Fi networks found</p>
                  <button onClick={handleScanWifi} className="text-body-md text-primary font-semibold flex items-center gap-1 mx-auto">
                    <RefreshCw size={14} /> Scan Again
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {store.apList.map((ap, i) => (
                    <button
                      key={`${ap.SSID}-${i}`}
                      onClick={() => { store.setSelectedSsid(ap.SSID); store.setStep('password') }}
                      className="bg-[#262626] rounded-l px-4 py-4 flex items-center justify-between active:opacity-70 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <Wifi size={18} className="text-primary flex-shrink-0" />
                        <span className="text-body-lg text-white">{ap.SSID || '(Hidden Network)'}</span>
                      </div>
                      {ap.Secu === 1 && <Lock size={14} className="text-[#BFBFBF]" />}
                    </button>
                  ))}
                  <button onClick={handleScanWifi} className="text-caption text-[#BFBFBF] flex items-center gap-1 mx-auto mt-2">
                    <RefreshCw size={10} /> Refresh
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* password */}
          {store.step === 'password' && (
            <motion.div key="password" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-4">
              <div className="bg-[#262626] rounded-l px-4 py-4 mb-2">
                <p className="text-caption text-[#BFBFBF] mb-1">Network</p>
                <div className="flex items-center justify-between">
                  <p className="text-body-lg font-semibold text-white">{store.selectedSsid}</p>
                  <button
                    onClick={() => store.setStep('wifi')}
                    className="text-caption text-primary"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div className="bg-[#262626] rounded-l px-4 py-4 mb-6">
                <p className="text-caption text-[#BFBFBF] mb-2">Password</p>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={store.wifiPassword}
                    onChange={(e) => store.setWifiPassword(e.target.value)}
                    placeholder="Enter Wi-Fi password"
                    autoFocus
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-[#8C8C8C] outline-none caret-primary"
                  />
                  <button onClick={() => setShowPassword(!showPassword)}>
                    {showPassword
                      ? <EyeOff size={16} className="text-[#8C8C8C]" />
                      : <Eye size={16} className="text-[#8C8C8C]" />
                    }
                  </button>
                </div>
              </div>

              <button
                onClick={handleConfig}
                disabled={store.isOperating || !store.wifiPassword}
                className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
                  disabled:bg-primary-dark disabled:text-[rgba(0,0,0,0.4)] transition-colors"
              >
                Connect
              </button>
            </motion.div>
          )}

          {/* configuring */}
          {store.step === 'configuring' && (
            <motion.div key="configuring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-16">
                <Loader2 size={40} className="text-primary animate-spin mb-6" />
                <p className="text-body-lg font-semibold text-white mb-2">Connecting to Wi-Fi...</p>
                <p className="text-body-md text-[#BFBFBF]">This may take a moment.</p>
              </div>
            </motion.div>
          )}

          {/* result */}
          {store.step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-10">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${store.configResult === 'success' ? 'bg-[rgba(52,199,89,0.15)]' : 'bg-[rgba(255,53,48,0.1)]'}`}>
                  {store.configResult === 'success'
                    ? <CheckCircle size={36} className="text-success" />
                    : <XCircle size={36} className="text-danger" />
                  }
                </div>
                <p className="text-headline-lg font-bold text-white mb-2">
                  {store.configResult === 'success' ? 'Setup Complete!' : 'Setup Failed'}
                </p>
                {store.errorMessage && (
                  <p className="text-body-md text-danger text-center">{store.errorMessage}</p>
                )}
              </div>

              {store.wifiStatus && (
                <div className="bg-[#262626] rounded-l px-4 py-4 mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-[#BFBFBF]">Wi-Fi</span>
                    <span className={`text-body-md font-semibold ${store.wifiStatus.WConn ? 'text-success' : 'text-danger'}`}>
                      {store.wifiStatus.WConn ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-[#BFBFBF]">Network</span>
                    <span className="text-body-md text-white">{store.wifiStatus.SSID}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-[#BFBFBF]">Signal</span>
                    <span className="text-body-md text-white">{store.wifiStatus.RSSI} dBm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-[#BFBFBF]">Cloud</span>
                    <span className={`text-body-md ${store.wifiStatus.SConn ? 'text-success' : 'text-[#FF9500]'}`}>
                      {store.wifiStatus.SConn ? 'Connected' : 'Pending'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {store.configResult === 'success' && !store.wifiStatus && (
                  <button
                    onClick={handleCheckStatus}
                    disabled={store.isOperating}
                    className="w-full h-12 rounded-l bg-[#262626] text-primary text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
                    Check Connection Status
                  </button>
                )}

                {store.configResult === 'success' && (
                  <button
                    onClick={async () => {
                      if ('Notification' in window && Notification.permission === 'default') {
                        setShowNotifSheet(true)
                      } else {
                        handleClose()
                      }
                    }}
                    className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold"
                  >
                    Done
                  </button>
                )}

                {store.configResult === 'fail' && (
                  <>
                    <button
                      onClick={() => store.setStep('wifi')}
                      className="w-full h-12 rounded-l bg-[#262626] text-white text-body-md font-semibold flex items-center justify-center gap-2"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={handleRestart}
                      disabled={store.isOperating}
                      className="w-full h-12 rounded-l bg-[#262626] text-[#FF9500] text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      Restart Device
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Error banner (non-result steps) */}
        <AnimatePresence>
          {store.errorMessage && store.step !== 'result' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 flex items-start gap-2 bg-[rgba(255,53,48,0.08)] rounded-l px-4 py-3"
            >
              <AlertCircle size={16} className="text-danger mt-0.5 flex-shrink-0" />
              <span className="text-body-md text-danger">{store.errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notification permission Bottom Sheet */}
      <AnimatePresence>
        {showNotifSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-40"
              onClick={() => { setShowNotifSheet(false); handleClose() }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="absolute bottom-0 left-0 right-0 z-50 bg-[#1F1F1F] rounded-t-[24px] px-6 pt-3 pb-10 safe-area-bottom"
            >
              <div className="w-10 h-1 bg-[rgba(255,255,255,0.2)] rounded-full mx-auto mb-6" />
              <div className="w-14 h-14 rounded-[18px] bg-[rgba(1,214,190,0.12)] flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="#01D6BE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-title-lg font-bold text-white mb-2">Enable Notifications</h3>
              <p className="text-body-md text-[#BFBFBF] mb-6">
                Get alerted when your battery is low, a power outage occurs, or solar connects or disconnects.
              </p>
              <button
                onClick={async () => {
                  await Notification.requestPermission()
                  setShowNotifSheet(false)
                  handleClose()
                }}
                className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold mb-3"
              >
                Enable Notifications
              </button>
              <button
                onClick={() => { setShowNotifSheet(false); handleClose() }}
                className="w-full h-12 text-body-md text-[#8C8C8C]"
              >
                Not Now
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
