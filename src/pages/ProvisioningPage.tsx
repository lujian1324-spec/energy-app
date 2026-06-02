/**
 * BLE 蓝牙配网 UI 组件
 * 内嵌在 DevicePage 的添加设备弹窗中
 *
 * 步骤流程: 扫描连接 → 设备验证 → WiFi列表 → 输入密码 → 配网 → 验证结果
 */
import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wifi, WifiOff, Lock, Unlock, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, CheckCircle, XCircle, Scan, RefreshCw,
  Signal, Eye, EyeOff, ArrowLeft, Radio, Server,
} from 'lucide-react'
import { useProvisionStore, type ProvisionStep } from '../stores/provisionStore'
import { getProvisionManager, destroyProvisionManager } from '../protocols/bleProvision'
import { getStatusText } from '../utils/dtuidParser'

const STEPS: { key: ProvisionStep; label: string }[] = [
  { key: 'scan', label: '扫描' },
  { key: 'verify', label: '验证' },
  { key: 'wifi', label: 'WiFi' },
  { key: 'password', label: '密码' },
  { key: 'configuring', label: '配置' },
  { key: 'result', label: '完成' },
]

export default function ProvisioningPage({ onClose }: { onClose: () => void }) {
  const store = useProvisionStore()
  const currentStepIndex = STEPS.findIndex(s => s.key === store.step)
  const [bleKeyInput, setBleKeyInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const goBack = useCallback(() => {
    const idx = STEPS.findIndex(s => s.key === store.step)
    if (idx > 0) store.setStep(STEPS[idx - 1].key)
  }, [store])

  // ─── Step: 扫描连接 ───
  const handleScan = useCallback(async () => {
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog('开始蓝牙扫描...')
    try {
      const manager = getProvisionManager({
        onLog: (msg) => store.addLog(msg),
        onDisconnected: () => {
          store.setErrorMessage('设备已断开连接')
        },
      })
      await manager.connect()
      store.setDeviceInfo(manager.btDevice?.name ?? null, manager.getDuid())
      store.setStep('verify')
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : '扫描失败')
      store.addLog(`扫描失败: ${err}`)
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── Step: 设备验证 ───
  const handleVerify = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    store.setErrorMessage(null)
    try {
      const manager = getProvisionManager()
      const resp = await manager.getVersion()

      if (resp.RC === 9000) {
        // 需要蓝牙密码
        store.setNeedBleKey(true)
        store.addLog('设备需要蓝牙密码验证')
        return
      }

      if (resp.RC === 0 && resp.PL) {
        const pl = resp.PL as { SV: string; HV: string }
        store.setVersionInfo(pl.SV, pl.HV)
        store.addLog(`设备版本: ${pl.SV}, 硬件: ${pl.HV}`)
        store.setStep('wifi')
      } else {
        store.setErrorMessage(`验证失败: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : '验证失败')
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── 蓝牙密码验证 ───
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
        store.addLog('蓝牙密码验证成功')
        // 重新获取版本
        await handleVerify()
      } else if (resp.RC === 9001) {
        store.setErrorMessage('蓝牙密码错误，请重试')
      } else {
        store.setErrorMessage(`密码验证失败: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : '密码验证失败')
    } finally {
      store.setIsOperating(false)
    }
  }, [store, bleKeyInput, handleVerify])

  // ─── Step: 扫描 WiFi ───
  const handleScanWifi = useCallback(async () => {
    if (!store.dtuid) return
    store.setApLoading(true)
    store.setErrorMessage(null)
    store.addLog('扫描 WiFi...')
    try {
      const manager = getProvisionManager()
      const resp = await manager.scanAp()
      if (resp.RC === 0 && resp.PL) {
        const apList = Array.isArray(resp.PL) ? resp.PL : []
        store.setApList(apList)
        store.addLog(`发现 ${apList.length} 个 WiFi`)
        store.setStep('password')
      } else {
        store.setErrorMessage(`WiFi 扫描失败: RC=${resp.RC}`)
      }
    } catch (err) {
      store.setErrorMessage(err instanceof Error ? err.message : 'WiFi 扫描失败')
    } finally {
      store.setApLoading(false)
    }
  }, [store])

  // ─── Step: 配置 WiFi ───
  const handleConfig = useCallback(async () => {
    if (!store.dtuid || !store.selectedSsid) return
    store.setStep('configuring')
    store.setIsOperating(true)
    store.setErrorMessage(null)
    store.addLog(`配置 WiFi: ${store.selectedSsid}`)
    try {
      const manager = getProvisionManager()
      const resp = await manager.configWifi(store.selectedSsid, store.wifiPassword)
      if (resp.RC === 0) {
        store.addLog('WiFi 配置成功')
        store.setConfigResult('success')
        store.setStep('result')
      } else {
        store.setConfigResult('fail')
        store.setErrorMessage(`配置失败: RC=${resp.RC}`)
        store.setStep('result')
      }
    } catch (err) {
      store.setConfigResult('fail')
      store.setErrorMessage(err instanceof Error ? err.message : '配置失败')
      store.setStep('result')
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── Step: 验证连接 ───
  const handleCheckStatus = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    store.addLog('检查 WiFi 连接状态...')
    try {
      const manager = getProvisionManager()
      const resp = await manager.getWifiStatus()
      if (resp.RC === 0 && resp.PL) {
        store.setWifiStatus(resp.PL)
        store.addLog(`WiFi: ${resp.PL.WConn ? '已连接' : '未连接'}`)
      }
    } catch (err) {
      store.addLog(`状态检查失败: ${err}`)
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── 重启设备 ───
  const handleRestart = useCallback(async () => {
    if (!store.dtuid) return
    store.setIsOperating(true)
    store.addLog('重启设备...')
    try {
      const manager = getProvisionManager()
      await manager.restart()
      store.addLog('重启命令已发送')
    } catch (err) {
      store.addLog(`重启失败: ${err}`)
    } finally {
      store.setIsOperating(false)
    }
  }, [store])

  // ─── 关闭 ───
  const handleClose = useCallback(() => {
    destroyProvisionManager()
    store.reset()
    onClose()
  }, [store, onClose])

  return (
    <div className="fixed inset-0 bg-[#000] z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 py-3 bg-[#1C1C1E] border-b border-[rgba(255,255,255,0.06)]">
        <button onClick={handleClose} className="p-1">
          <XCircle size={20} className="text-[#8E8E93]" />
        </button>
        <h1 className="text-[14px] font-semibold text-[#FFFFFF] ml-2 flex-1">蓝牙配网</h1>
        {currentStepIndex > 0 && (
          <button onClick={goBack} className="text-[12px] text-[#8E8E93] flex items-center gap-0.5">
            <ChevronLeft size={14} /> 上一步
          </button>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center px-6 py-3 gap-1">
        {STEPS.map((s, i) => {
          const isActive = i === currentStepIndex
          const isCompleted = i < currentStepIndex
          return (
            <div key={s.key} className="flex items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors
                ${isCompleted ? 'bg-[#0D9488] text-[#000]' : isActive ? 'bg-[#0D9488] text-[#000]' : 'bg-[#2C2C2E] text-[#48484A]'}`}>
                {isCompleted ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px mx-0.5 ${i < currentStepIndex ? 'bg-[#0D9488]' : 'bg-[#2C2C2E]'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-24">
        <AnimatePresence mode="wait">
          {/* ── Step 0: 扫描连接 ── */}
          {store.step === 'scan' && (
            <motion.div key="scan" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[rgba(13,148,136,0.15)] flex items-center justify-center mx-auto mb-4">
                  <Radio size={28} className="text-[#0D9488]" />
                </div>
                <h2 className="text-[16px] font-semibold text-[#FFFFFF] mb-1">扫描蓝牙设备</h2>
                <p className="text-[12px] text-[#8E8E93]">请确保采集器已通电，蓝牙指示灯闪烁</p>
              </div>

              <button
                onClick={handleScan}
                disabled={store.isOperating}
                className="w-full py-3.5 rounded-2xl bg-[#0D9488] text-[#000] text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {store.isOperating ? (
                  <><Loader2 size={16} className="animate-spin" /> 扫描中...</>
                ) : (
                  <><Scan size={16} /> 开始扫描</>
                )}
              </button>

              <div className="mt-4 bg-[#1C1C1E] rounded-xl p-3">
                <p className="text-[10px] text-[#48484A] mb-1">设备蓝牙名称格式: SSL_0...</p>
                <p className="text-[10px] text-[#48484A]">0=WiFi未连接, 1=WiFi已连接, 3=MQTT已连接</p>
              </div>
            </motion.div>
          )}

          {/* ── Step 1: 设备验证 ── */}
          {store.step === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-[rgba(13,148,136,0.15)] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={28} className="text-[#0D9488]" />
                </div>
                <h2 className="text-[16px] font-semibold text-[#FFFFFF] mb-1">设备已连接</h2>
                <p className="text-[12px] text-[#8E8E93]">{store.deviceName}</p>
                {store.dtuid && <p className="text-[10px] text-[#48484A] mt-1">DTUID: {store.dtuid}</p>}
              </div>

              {store.deviceVersion && (
                <div className="bg-[#1C1C1E] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#8E8E93]">软件版本</span>
                    <span className="text-[12px] text-[#FFFFFF]">{store.deviceVersion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[12px] text-[#8E8E93]">硬件型号</span>
                    <span className="text-[12px] text-[#FFFFFF]">{store.hardwareVersion}</span>
                  </div>
                </div>
              )}

              {/* 蓝牙密码验证 */}
              {store.needBleKey && !store.bleKeyVerified && (
                <div className="bg-[#1C1C1E] rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock size={14} className="text-[#FF9500]" />
                    <span className="text-[12px] text-[#FFFFFF] font-semibold">需要蓝牙密码</span>
                  </div>
                  <input
                    type="password"
                    value={bleKeyInput}
                    onChange={(e) => setBleKeyInput(e.target.value)}
                    placeholder="请输入蓝牙密码"
                    className="w-full bg-[#2C2C2E] rounded-lg px-3 py-2.5 text-[13px] text-[#FFFFFF] placeholder:text-[#48484A] outline-none border border-[rgba(255,255,255,0.06)] focus:border-[#0D9488] mb-2"
                  />
                  <button
                    onClick={handleConfirmBleKey}
                    disabled={store.isOperating || !bleKeyInput.trim()}
                    className="w-full py-2.5 rounded-lg bg-[#FF9500] text-[#000] text-[12px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {store.isOperating ? <Loader2 size={12} className="animate-spin" /> : <Unlock size={12} />}
                    验证密码
                  </button>
                </div>
              )}

              <button
                onClick={handleVerify}
                disabled={store.isOperating}
                className="w-full py-3.5 rounded-2xl bg-[#0D9488] text-[#000] text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {store.isOperating ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                扫描 WiFi 列表
              </button>
            </motion.div>
          )}

          {/* ── Step 2: WiFi 列表 ── */}
          {store.step === 'wifi' && (
            <motion.div key="wifi" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-4">
              <h2 className="text-[14px] font-semibold text-[#FFFFFF] mb-3">可用 WiFi ({store.apList.length})</h2>

              {store.apLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="text-[#0D9488] animate-spin" />
                  <span className="text-[12px] text-[#8E8E93] ml-2">扫描中...</span>
                </div>
              ) : store.apList.length === 0 ? (
                <div className="text-center py-12">
                  <WifiOff size={32} className="text-[#48484A] mx-auto mb-3" />
                  <p className="text-[12px] text-[#8E8E93]">未发现 WiFi 网络</p>
                  <button onClick={handleScanWifi} className="mt-4 text-[12px] text-[#0D9488] flex items-center gap-1 mx-auto">
                    <RefreshCw size={12} /> 重新扫描
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {store.apList.map((ap, i) => (
                    <button
                      key={`${ap.SSID}-${i}`}
                      onClick={() => { store.setSelectedSsid(ap.SSID); store.setStep('password') }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-[#1C1C1E] rounded-xl active:bg-[#2C2C2E] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Wifi size={16} className={ap.SSID ? 'text-[#0D9488]' : 'text-[#48484A]'} />
                        <span className="text-[13px] text-[#FFFFFF]">{ap.SSID || '(隐藏网络)'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {ap.Secu === 1 && <Lock size={12} className="text-[#8E8E93]" />}
                        <Signal size={12} className="text-[#8E8E93]" />
                      </div>
                    </button>
                  ))}
                  <button onClick={handleScanWifi} className="text-[11px] text-[#8E8E93] flex items-center gap-1 mx-auto mt-2">
                    <RefreshCw size={10} /> 重新扫描
                  </button>
                </div>
              )}

              {/* 手动输入 */}
              <div className="mt-4">
                <button
                  onClick={() => { store.setSelectedSsid(''); store.setStep('password') }}
                  className="w-full py-3 rounded-xl border border-dashed border-[#48484A] text-[12px] text-[#8E8E93] flex items-center justify-center gap-1"
                >
                  手动输入 SSID
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: 输入密码 ── */}
          {store.step === 'password' && (
            <motion.div key="password" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <h2 className="text-[16px] font-semibold text-[#FFFFFF] mb-4">WiFi 配置</h2>

              <div className="bg-[#1C1C1E] rounded-xl p-4 space-y-4">
                {/* SSID */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-1.5 block">WiFi 名称 (SSID)</label>
                  {store.selectedSsid === null ? (
                    <input
                      type="text"
                      value={store.selectedSsid ?? ''}
                      onChange={(e) => store.setSelectedSsid(e.target.value)}
                      placeholder="请输入 WiFi 名称"
                      className="w-full bg-[#2C2C2E] rounded-lg px-3 py-2.5 text-[13px] text-[#FFFFFF] placeholder:text-[#48484A] outline-none border border-[rgba(255,255,255,0.06)] focus:border-[#0D9488]"
                    />
                  ) : (
                    <div className="flex items-center justify-between bg-[#2C2C2E] rounded-lg px-3 py-2.5">
                      <span className="text-[13px] text-[#FFFFFF]">{store.selectedSsid}</span>
                      <button onClick={() => store.setSelectedSsid(null)} className="text-[11px] text-[#8E8E93]">更换</button>
                    </div>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="text-[11px] text-[#8E8E93] mb-1.5 block">WiFi 密码</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={store.wifiPassword}
                      onChange={(e) => store.setWifiPassword(e.target.value)}
                      placeholder="请输入 WiFi 密码"
                      className="w-full bg-[#2C2C2E] rounded-lg px-3 py-2.5 pr-9 text-[13px] text-[#FFFFFF] placeholder:text-[#48484A] outline-none border border-[rgba(255,255,255,0.06)] focus:border-[#0D9488]"
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E8E93]"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfig}
                disabled={store.isOperating || !store.wifiPassword}
                className="w-full mt-6 py-3.5 rounded-2xl bg-[#0D9488] text-[#000] text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {store.isOperating ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                开始配网
              </button>
            </motion.div>
          )}

          {/* ── Step 4: 配网中 ── */}
          {store.step === 'configuring' && (
            <motion.div key="configuring" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-12 text-center">
              <Loader2 size={32} className="text-[#0D9488] animate-spin mx-auto mb-4" />
              <h2 className="text-[16px] font-semibold text-[#FFFFFF] mb-1">正在配置...</h2>
              <p className="text-[12px] text-[#8E8E93]">请稍候，正在向设备发送 WiFi 配置</p>
            </motion.div>
          )}

          {/* ── Step 5: 结果 ── */}
          {store.step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="mt-8">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4
                  ${store.configResult === 'success' ? 'bg-[rgba(52,199,89,0.15)]' : 'bg-[rgba(255,59,48,0.15)]'}`}>
                  {store.configResult === 'success'
                    ? <CheckCircle size={28} className="text-[#34C759]" />
                    : <XCircle size={28} className="text-[#FF3B30]" />
                  }
                </div>
                <h2 className="text-[16px] font-semibold text-[#FFFFFF] mb-1">
                  {store.configResult === 'success' ? '配网成功' : '配网失败'}
                </h2>
                {store.errorMessage && (
                  <p className="text-[12px] text-[#FF3B30]">{store.errorMessage}</p>
                )}
              </div>

              {/* WiFi 状态 */}
              {store.wifiStatus && (
                <div className="bg-[#1C1C1E] rounded-xl p-4 mb-4 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi size={14} className="text-[#0D9488]" />
                    <span className="text-[12px] text-[#FFFFFF] font-semibold">WiFi 状态</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">连接状态</span>
                    <span className={`text-[11px] ${store.wifiStatus.WConn ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                      {store.wifiStatus.WConn ? '已连接' : '未连接'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">SSID</span>
                    <span className="text-[11px] text-[#FFFFFF]">{store.wifiStatus.SSID}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">信号强度</span>
                    <span className="text-[11px] text-[#FFFFFF]">{store.wifiStatus.RSSI} dBm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[11px] text-[#8E8E93]">MQTT</span>
                    <span className={`text-[11px] ${store.wifiStatus.SConn ? 'text-[#34C759]' : 'text-[#FF9500]'}`}>
                      {store.wifiStatus.SConn ? '已连接' : '未连接'}
                    </span>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="space-y-2">
                {store.configResult === 'success' && !store.wifiStatus && (
                  <button
                    onClick={handleCheckStatus}
                    disabled={store.isOperating}
                    className="w-full py-3 rounded-xl bg-[#1C1C1E] text-[#0D9488] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <Server size={14} />}
                    查询连接状态
                  </button>
                )}

                <button
                  onClick={handleRestart}
                  disabled={store.isOperating}
                  className="w-full py-3 rounded-xl bg-[#1C1C1E] text-[#FF9500] text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {store.isOperating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  重启设备
                </button>

                {store.configResult === 'fail' && (
                  <button
                    onClick={() => { store.setStep('wifi'); store.setErrorMessage(null) }}
                    className="w-full py-3 rounded-xl bg-[#1C1C1E] text-[#FFFFFF] text-[13px] font-semibold flex items-center justify-center gap-2"
                  >
                    <ArrowLeft size={14} /> 重新配置
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {store.errorMessage && store.step !== 'result' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="mt-4 flex items-start gap-2 bg-[rgba(255,59,48,0.1)] rounded-xl px-3 py-2.5"
            >
              <AlertCircle size={14} className="text-[#FF3B30] mt-0.5 shrink-0" />
              <span className="text-[11px] text-[#FF3B30]">{store.errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Debug Log (折叠) */}
        {store.logs.length > 0 && (
          <details className="mt-6">
            <summary className="text-[10px] text-[#48484A] cursor-pointer">调试日志 ({store.logs.length})</summary>
            <div className="mt-1 max-h-32 overflow-y-auto bg-[#1C1C1E] rounded-lg p-2">
              {store.logs.map((log, i) => (
                <div key={i} className="text-[9px] font-mono text-[#48484A]">{log}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
