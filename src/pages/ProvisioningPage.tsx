/**
 * BLE provisioning UI — PRD-aligned redesign.
 * All store/API/protocol logic preserved from original.
 */
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, X, Wifi, WifiOff, Lock, Loader2,
  AlertCircle, CheckCircle, XCircle, RefreshCw,
  Eye, EyeOff, Server,
} from 'lucide-react'
import { useProvisionStore, type ProvisionStep } from '../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager } from '../protocols/bleProvision'

// Local UI screens — the multi-step store flow lives inside 'provisioning'
type UiScreen = 'scan' | 'qr' | 'naming' | 'provisioning'

// Radar ring animation keyframes via inline style
const radarRings = [0, 1, 2, 3]

export default function ProvisioningPage({ onClose }: { onClose: () => void }) {
  const store = useProvisionStore()

  const [uiScreen, setUiScreen] = useState<UiScreen>('scan')
  const [deviceNameInput, setDeviceNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [bleKeyInput, setBleKeyInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Simulate found devices list on top of real BLE scan
  const [foundDevices, setFoundDevices] = useState<{ name: string; serial: string }[]>([])

  // ─── BLE Scan ────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog('Starting BLE scan...')
    setFoundDevices([])
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

  return (
    <div className="fixed inset-0 bg-[#141414] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 py-3 bg-[#262626] border-b border-[rgba(255,255,255,0.06)]">
        <button onClick={handleClose} className="p-1">
          <XCircle size={20} className="text-[#A0A0A5]" />
        </button>
        <h1 className="text-body-md font-semibold text-[#FFFFFF] ml-2 flex-1">蓝牙配网</h1>
        {currentStepIndex > 0 && (
          <button onClick={goBack} className="text-label text-[#A0A0A5] flex items-center gap-0.5">
            <ChevronLeft size={14} /> 上一步
          </button>
          <h1 className="text-title-lg font-semibold text-white">Add Device</h1>
          <button
            onClick={() => setUiScreen('qr')}
            className="text-body-md font-semibold text-primary"
          >
            Scan QR
          </button>
        </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center px-6 py-3 gap-1">
        {STEPS.map((s, i) => {
          const isActive = i === currentStepIndex
          const isCompleted = i < currentStepIndex
          return (
            <div key={s.key} className="flex items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                ${isCompleted ? 'bg-[#01D6BE] text-[#000]' : isActive ? 'bg-[#01D6BE] text-[#000]' : 'bg-[#333333] text-[#636366]'}`}>
                {isCompleted ? '✓' : i + 1}
              </div>
            </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <AnimatePresence mode="wait">
          {/* ── Step 0: 扫描连接 ── */}
          {store.step === 'scan' && (
            <motion.div key="scan" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-l bg-[rgba(1,214,190,0.15)] flex items-center justify-center mx-auto mb-4">
                  <Radio size={28} className="text-[#01D6BE]" />
                </div>
                <h2 className="text-body-lg font-semibold text-[#FFFFFF] mb-1">扫描蓝牙设备</h2>
                <p className="text-label text-[#A0A0A5]">请确保采集器已通电，蓝牙指示灯闪烁</p>
              </div>
            )}

            {!isSearching && !hasDevices && !store.errorMessage && (
              <div className="text-center mb-6">
                <p className="text-body-lg font-semibold text-white mb-1">Ready to Scan</p>
                <p className="text-body-md text-[#A0A0A5]">Tap the button below to search for nearby devices.</p>
              </div>
            )}

            {hasError && (
              <div className="text-center mb-6">
                <p className="text-body-lg font-semibold text-white mb-1">No Devices Found</p>
                <p className="text-body-md text-[#A0A0A5]">Make sure your device is powered on and Bluetooth is enabled.</p>
              </div>
            )}

            {/* Found devices list */}
            {hasDevices && (
              <div className="w-full mb-6">
                <p className="text-caption font-bold text-[#A0A0A5] tracking-widest uppercase mb-3 px-1">
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
                        <p className="text-caption text-[#A0A0A5] mt-0.5">{device.serial}</p>
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
                disabled={store.isOperating}
                className="w-full py-3.5 rounded-l bg-[#01D6BE] text-[#000] text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
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

              <div className="mt-4 bg-[#262626] rounded-l p-3">
                <p className="text-xs text-[#636366] mb-1">设备蓝牙名称格式: SSL_0...</p>
                <p className="text-xs text-[#636366]">0=WiFi未连接, 1=WiFi已连接, 3=MQTT已连接</p>
              </div>
            </motion.div>
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
            <motion.div key="verify" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-l bg-[rgba(1,214,190,0.15)] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={28} className="text-[#01D6BE]" />
                </div>
                <h2 className="text-body-lg font-semibold text-[#FFFFFF] mb-1">设备已连接</h2>
                <p className="text-label text-[#A0A0A5]">{store.deviceName}</p>
                {store.dtuid && <p className="text-xs text-[#636366] mt-1">DTUID: {store.dtuid}</p>}
              </div>

              {store.deviceVersion && (
                <div className="bg-[#262626] rounded-l p-4 mb-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-label text-[#A0A0A5]">软件版本</span>
                    <span className="text-label text-[#FFFFFF]">{store.deviceVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-label text-[#A0A0A5]">硬件型号</span>
                    <span className="text-label text-[#FFFFFF]">{store.hardwareVersion}</span>
                  </div>
                </div>
              )}

              {/* 蓝牙密码验证 */}
              {store.needBleKey && !store.bleKeyVerified && (
                <div className="bg-[#262626] rounded-l p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock size={14} className="text-[#FF9500]" />
                    <span className="text-label text-[#FFFFFF] font-semibold">需要蓝牙密码</span>
                  </div>
                  <input
                    type="password"
                    value={bleKeyInput}
                    onChange={(e) => setBleKeyInput(e.target.value)}
                    placeholder="Enter BLE key"
                    className="w-full bg-[#1A1A1A] rounded-m px-4 py-3 text-body-md text-white placeholder:text-[#636366] outline-none border border-[rgba(255,255,255,0.08)] focus:border-primary mb-3"
                  />
                  <button
                    onClick={handleConfirmBleKey}
                    disabled={store.isOperating || !bleKeyInput.trim()}
                    className="w-full py-2.5 rounded-lg bg-[#FF9500] text-[#000] text-label font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {store.isOperating ? <Loader2 size={16} className="animate-spin" /> : 'Verify Key'}
                  </button>
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={store.isOperating}
                className="w-full py-3.5 rounded-l bg-[#01D6BE] text-[#000] text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {store.isOperating ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                扫描 WiFi 列表
              </button>
            </motion.div>
          )}

          {/* wifi */}
          {store.step === 'wifi' && (
            <motion.div key="wifi" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-4">
              <h2 className="text-body-md font-semibold text-[#FFFFFF] mb-3">可用 WiFi ({store.apList.length})</h2>

              {store.apLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="text-[#01D6BE] animate-spin" />
                  <span className="text-label text-[#A0A0A5] ml-2">扫描中...</span>
                </div>
              ) : store.apList.length === 0 ? (
                <div className="text-center py-12">
                  <WifiOff size={32} className="text-[#636366] mx-auto mb-3" />
                  <p className="text-label text-[#A0A0A5]">未发现 WiFi 网络</p>
                  <button onClick={handleScanWifi} className="mt-4 text-label text-[#01D6BE] flex items-center gap-1 mx-auto">
                    <RefreshCw size={12} /> 重新扫描
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {store.apList.map((ap, i) => (
                    <button
                      key={`${ap.SSID}-${i}`}
                      onClick={() => { store.setSelectedSsid(ap.SSID); store.setStep('password') }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#262626] rounded-l active:bg-[#333333] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Wifi size={18} className="text-primary flex-shrink-0" />
                        <span className="text-body-lg text-white">{ap.SSID || '(Hidden Network)'}</span>
                      </div>
                      {ap.Secu === 1 && <Lock size={14} className="text-[#A0A0A5]" />}
                    </button>
                  ))}
                  <button onClick={handleScanWifi} className="text-caption text-[#A0A0A5] flex items-center gap-1 mx-auto mt-2">
                    <RefreshCw size={10} /> 重新扫描
                  </button>
                </div>
              )}

              {/* 手动输入 */}
              <div className="mt-4">
                <button
                  onClick={() => { store.setSelectedSsid(''); store.setStep('password') }}
                  className="w-full py-3 rounded-l border border-dashed border-[#636366] text-label text-[#A0A0A5] flex items-center justify-center gap-1"
                >
                  手动输入 SSID
                </button>
              </div>
            </motion.div>
          )}

          {/* password */}
          {store.step === 'password' && (
            <motion.div key="password" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <h2 className="text-body-lg font-semibold text-[#FFFFFF] mb-4">WiFi 配置</h2>

              <div className="bg-[#262626] rounded-l p-4 space-y-4">
                {/* SSID */}
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-1.5 block">WiFi 名称 (SSID)</label>
                  {store.selectedSsid === null ? (
                    <input
                      type="text"
                      value={store.selectedSsid ?? ''}
                      onChange={(e) => store.setSelectedSsid(e.target.value)}
                      placeholder="请输入 WiFi 名称"
                      className="w-full bg-[#333333] rounded-lg px-3 py-2.5 text-[13px] text-[#FFFFFF] placeholder:text-[#636366] outline-none border border-[rgba(255,255,255,0.06)] focus:border-[#01D6BE]"
                    />
                  ) : (
                    <div className="flex items-center justify-between bg-[#333333] rounded-lg px-3 py-2.5">
                      <span className="text-[13px] text-[#FFFFFF]">{store.selectedSsid}</span>
                      <button onClick={() => store.setSelectedSsid(null)} className="text-caption text-[#A0A0A5]">更换</button>
                    </div>
                  )}
                </div>
              </div>

                {/* Password */}
                <div>
                  <label className="text-caption text-[#A0A0A5] mb-1.5 block">WiFi 密码</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={store.wifiPassword}
                      onChange={(e) => store.setWifiPassword(e.target.value)}
                      placeholder="请输入 WiFi 密码"
                      className="w-full bg-[#333333] rounded-lg px-3 py-2.5 pr-9 text-[13px] text-[#FFFFFF] placeholder:text-[#636366] outline-none border border-[rgba(255,255,255,0.06)] focus:border-[#01D6BE]"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A0A0A5]"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfig}
                disabled={store.isOperating || !store.wifiPassword}
                className="w-full mt-6 py-3.5 rounded-l bg-[#01D6BE] text-[#000] text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Connect
              </button>
            </motion.div>
          )}

          {/* configuring */}
          {store.step === 'configuring' && (
            <motion.div key="configuring" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-12 text-center">
              <Loader2 size={32} className="text-[#01D6BE] animate-spin mx-auto mb-4" />
              <h2 className="text-body-lg font-semibold text-[#FFFFFF] mb-1">正在配置...</h2>
              <p className="text-label text-[#A0A0A5]">请稍候，正在向设备发送 WiFi 配置</p>
            </motion.div>
          )}

          {/* result */}
          {store.step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-l flex items-center justify-center mx-auto mb-4
                  ${store.configResult === 'success' ? 'bg-[rgba(52,199,89,0.15)]' : 'bg-[rgba(255,59,48,0.15)]'}`}>
                  {store.configResult === 'success'
                    ? <CheckCircle size={36} className="text-success" />
                    : <XCircle size={36} className="text-danger" />
                  }
                </div>
                <h2 className="text-body-lg font-semibold text-[#FFFFFF] mb-1">
                  {store.configResult === 'success' ? '配网成功' : '配网失败'}
                </h2>
                {store.errorMessage && (
                  <p className="text-label text-[#FF3B30]">{store.errorMessage}</p>
                )}
              </div>

              {store.wifiStatus && (
                <div className="bg-[#262626] rounded-l p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi size={14} className="text-[#01D6BE]" />
                    <span className="text-label text-[#FFFFFF] font-semibold">WiFi 状态</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-caption text-[#A0A0A5]">连接状态</span>
                    <span className={`text-caption ${store.wifiStatus.WConn ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                      {store.wifiStatus.WConn ? '已连接' : '未连接'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-caption text-[#A0A0A5]">SSID</span>
                    <span className="text-caption text-[#FFFFFF]">{store.wifiStatus.SSID}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-caption text-[#A0A0A5]">信号强度</span>
                    <span className="text-caption text-[#FFFFFF]">{store.wifiStatus.RSSI} dBm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-caption text-[#A0A0A5]">MQTT</span>
                    <span className={`text-caption ${store.wifiStatus.SConn ? 'text-[#34C759]' : 'text-[#FF9500]'}`}>
                      {store.wifiStatus.SConn ? '已连接' : '未连接'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {store.configResult === 'success' && !store.wifiStatus && (
                  <button
                    onClick={handleCheckStatus}
                    disabled={store.isOperating}
                    className="w-full py-3 rounded-l bg-[#262626] text-[#01D6BE] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
                    Check Connection Status
                  </button>
                )}

                <button
                  onClick={handleRestart}
                  disabled={store.isOperating}
                  className="w-full py-3 rounded-l bg-[#262626] text-[#FF9500] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  重启设备
                </button>

                {store.configResult === 'fail' && (
                  <button
                    onClick={() => { store.setStep('wifi'); store.setErrorMessage(null) }}
                    className="w-full py-3 rounded-l bg-[#262626] text-[#FFFFFF] text-[13px] font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={14} /> 重新配置
                  </button>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Error banner (non-result steps) */}
        <AnimatePresence>
          {store.errorMessage && store.step !== 'result' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="mt-4 flex items-start gap-2 bg-[rgba(255,59,48,0.1)] rounded-l px-3 py-2.5"
            >
              <AlertCircle size={14} className="text-[#FF3B30] mt-0.5 shrink-0" />
              <span className="text-caption text-[#FF3B30]">{store.errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Debug Log (折叠) */}
        {store.logs.length > 0 && (
          <details className="mt-6">
            <summary className="text-xs text-[#636366] cursor-pointer">调试日志 ({store.logs.length})</summary>
            <div className="mt-1 max-h-32 overflow-y-auto bg-[#262626] rounded-lg p-2">
              {store.logs.map((log, i) => (
                <div key={i} className="text-[9px] font-mono text-[#636366]">{log}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
