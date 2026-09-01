/**
 * Provisioning verify → wifi → password → result screens.
 */

import { type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Wifi, WifiOff, Lock, Loader2,
  AlertCircle, CheckCircle, XCircle, RefreshCw,
  Eye, EyeOff, Server,
} from 'lucide-react'
import { toast } from '../../components/Toast'
import { useProvisionStore } from '../../stores/provisionStore'
import { bindFailTitle, BIND_WIFI_HELPER, RESTART_HELP_COPY, type FailKind } from '../../utils/provisionFailCopy'

type FlowProps = {
  failKind: FailKind
  bindRetrying: boolean
  restarting: boolean
  showRestartHelp: boolean
  bindReason: string | null
  bindErrorId: string | null
  configStage: string
  bleKeyInput: string
  setBleKeyInput: Dispatch<SetStateAction<string>>
  showPassword: boolean
  setShowPassword: Dispatch<SetStateAction<boolean>>
  showNotifSheet: boolean
  setShowNotifSheet: Dispatch<SetStateAction<boolean>>
  wifiConfiguredRef: MutableRefObject<boolean>
  setUiScreen: (s: 'scan' | 'qr' | 'naming' | 'icon' | 'provisioning') => void
  handleConfirmBleKey: () => void
  handleScanWifi: () => void
  handleConfig: () => void
  handleCheckStatus: () => void
  handleBindToCloud: () => void
  handleRetryCurrentStage: () => void
  handleRestart: () => void
  handleClose: () => void
}

export default function ProvisioningFlowScreen(p: FlowProps) {
  const store = useProvisionStore()
  const {
    failKind, bindRetrying, restarting, showRestartHelp, bindReason, bindErrorId,
    configStage, bleKeyInput, setBleKeyInput, showPassword, setShowPassword,
    showNotifSheet, setShowNotifSheet, wifiConfiguredRef, setUiScreen,
    handleConfirmBleKey, handleScanWifi, handleConfig, handleCheckStatus,
    handleBindToCloud, handleRetryCurrentStage, handleRestart, handleClose,
  } = p
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => setUiScreen('naming')}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-title-lg font-semibold text-white">
          {store.step === 'verify' && 'Verifying Device'}
          {store.step === 'wifi' && 'Select Wi-Fi'}
          {store.step === 'password' && 'Wi-Fi Password'}
          {store.step === 'configuring' && 'Connecting...'}
          {store.step === 'result' && (store.configResult === 'success' ? 'Connected!' : bindFailTitle(failKind, wifiConfiguredRef.current))}
        </h1>
      </div>

      {(store.step === 'wifi' || store.step === 'password') && (
        <p className="px-6 text-body-md text-ink-6 pb-1">
          Please switch on your Sierro before connecting to Wi-Fi
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <AnimatePresence mode="wait">

          {/* verify */}
          {store.step === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-10">
                <div className="w-16 h-16 rounded-l bg-primary/[0.12] flex items-center justify-center mb-4">
                  <CheckCircle size={28} className="text-primary" />
                </div>
                <p className="text-body-lg font-semibold text-white mb-1">{store.deviceName}</p>
                {store.dtuid && <p className="text-caption text-ink-6">{store.dtuid}</p>}
              </div>

              {store.needBleKey && !store.bleKeyVerified && (
                <div className="bg-ink-10 rounded-l px-4 py-4 mb-4">
                  <p className="text-body-md font-semibold text-white mb-3">BLE Key Required</p>
                  <input
                    type="password"
                    value={bleKeyInput}
                    onChange={(e) => setBleKeyInput(e.target.value)}
                    placeholder="Enter BLE key"
                    className="w-full bg-ink-11 rounded-m px-4 py-3 text-body-md text-white placeholder:text-ink-7 outline-none border border-white/[0.08] focus:border-primary mb-3"
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
                  <span className="text-body-md text-ink-6">Scanning Wi-Fi...</span>
                </div>
              ) : store.apList.length === 0 ? (
                <div className="text-center py-16">
                  <WifiOff size={36} className="text-ink-7 mx-auto mb-4" />
                  <p className="text-body-md text-ink-6 mb-4">No Wi-Fi networks found</p>
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
                      className="bg-ink-10 rounded-l px-4 py-4 flex items-center justify-between active:opacity-70 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <Wifi size={18} className="text-primary flex-shrink-0" />
                        <span className="text-body-lg text-white">{ap.SSID || '(Hidden Network)'}</span>
                      </div>
                      {ap.Secu === 1 && <Lock size={14} className="text-ink-6" />}
                    </button>
                  ))}
                  <button onClick={handleScanWifi} className="text-caption text-ink-6 flex items-center gap-1 mx-auto mt-2">
                    <RefreshCw size={10} /> Refresh
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* password */}
          {store.step === 'password' && (
            <motion.div key="password" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-4">
              <div className="bg-ink-10 rounded-l px-4 py-4 mb-2">
                <p className="text-caption text-ink-6 mb-1">Network</p>
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

              <div className="bg-ink-10 rounded-l px-4 py-4 mb-6">
                <p className="text-caption text-ink-6 mb-2">Password</p>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={store.wifiPassword}
                    onChange={(e) => store.setWifiPassword(e.target.value)}
                    placeholder="Enter Wi-Fi password"
                    autoFocus
                    className="flex-1 bg-transparent text-body-lg text-white placeholder:text-ink-7 outline-none caret-primary"
                  />
                  <button onClick={() => setShowPassword(!showPassword)}>
                    {showPassword
                      ? <EyeOff size={16} className="text-ink-7" />
                      : <Eye size={16} className="text-ink-7" />
                    }
                  </button>
                </div>
              </div>

              <button
                onClick={handleConfig}
                disabled={store.isOperating || !store.wifiPassword}
                className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
                  disabled:bg-primary-dark disabled:text-black/[0.4] transition-colors flex items-center justify-center gap-2"
              >
                {store.isOperating
                  ? <><Loader2 size={18} className="animate-spin" /> Connecting…</>
                  : 'Connect'}
              </button>
            </motion.div>
          )}

          {/* configuring */}
          {store.step === 'configuring' && (
            <motion.div key="configuring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-16">
                <Loader2 size={40} className="text-primary animate-spin mb-6" />
                <p className="text-body-lg font-semibold text-white mb-2">{configStage}</p>
                <p className="text-body-md text-ink-6">This may take a moment.</p>
              </div>
            </motion.div>
          )}

          {/* result */}
          {store.step === 'result' && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col items-center py-10">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${store.configResult === 'success' ? 'bg-success/[0.15]' : 'bg-danger/[0.1]'}`}>
                  {store.configResult === 'success'
                    ? <CheckCircle size={36} className="text-success" />
                    : <XCircle size={36} className="text-danger" />
                  }
                </div>
                <p className="text-headline-lg font-bold text-white mb-2">
                  {store.configResult === 'success' ? 'Setup Complete!' : bindFailTitle(failKind, wifiConfiguredRef.current)}
                </p>
                {store.errorMessage && (
                  <p className="text-body-md text-danger text-center">{store.errorMessage}</p>
                )}
                {store.configResult === 'fail' && (failKind === 'bind' || wifiConfiguredRef.current) && (
                  <p className="text-body-md text-ink-6 text-center mt-2">{BIND_WIFI_HELPER}</p>
                )}
                {store.configResult === 'fail' && bindReason && (
                  <p className="text-body-md text-ink-6 text-center mt-2">{bindReason}</p>
                )}
                {store.configResult === 'fail' && bindErrorId && (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(bindErrorId).then(
                        () => toast.info('Error ID copied'),
                        () => toast.info(bindErrorId),
                      )
                    }}
                    className="mt-2 text-caption text-ink-6 underline"
                  >
                    Error ID: {bindErrorId}
                  </button>
                )}
                {store.configResult === 'fail' && showRestartHelp && (
                  <p className="text-body-md text-ink-6 text-center mt-3">{RESTART_HELP_COPY}</p>
                )}
              </div>

              {store.wifiStatus && (
                <div className="bg-ink-10 rounded-l px-4 py-4 mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-ink-6">Wi-Fi</span>
                    <span className={`text-body-md font-semibold ${store.wifiStatus.WConn ? 'text-success' : 'text-danger'}`}>
                      {store.wifiStatus.WConn ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-ink-6">Network</span>
                    <span className="text-body-md text-white">{store.wifiStatus.SSID}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-ink-6">Signal</span>
                    <span className="text-body-md text-white">{store.wifiStatus.RSSI} dBm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-md text-ink-6">Cloud</span>
                    <span className={`text-body-md ${store.wifiStatus.SConn ? 'text-success' : 'text-warning'}`}>
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
                    className="w-full h-12 rounded-l bg-ink-10 text-primary text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
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
                      onClick={() => {
                        if (failKind === 'disconnect') {
                          void handleRetryCurrentStage()
                        } else if (failKind === 'bind' || wifiConfiguredRef.current) {
                          void handleBindToCloud()
                        } else {
                          store.setStep('wifi')
                        }
                      }}
                      disabled={bindRetrying || restarting}
                      className="w-full h-12 rounded-l bg-ink-10 text-white text-body-md font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {bindRetrying && <Loader2 size={14} className="animate-spin" />}
                      {failKind === 'disconnect'
                        ? 'Reconnect'
                        : (failKind === 'bind' || wifiConfiguredRef.current)
                          ? 'Try adding again'
                          : 'Try Again'}
                    </button>
                    <button
                      onClick={handleRestart}
                      disabled={bindRetrying || restarting}
                      className="w-full h-12 rounded-l bg-ink-10 text-warning text-body-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {restarting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      {showRestartHelp ? 'How to restart device' : 'Restart Device'}
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
              className="mt-4 flex items-start gap-2 bg-danger/[0.08] rounded-l px-4 py-3"
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
              className="absolute bottom-0 left-0 right-0 z-50 bg-ink-11 rounded-t-[24px] px-6 pt-3 pb-10 safe-area-bottom"
            >
              <div className="w-10 h-1 bg-white/[0.2] rounded-full mx-auto mb-6" />
              <div className="w-14 h-14 rounded-[18px] bg-primary/[0.12] flex items-center justify-center mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="#01D6BE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-title-lg font-bold text-white mb-2">Enable Notifications</h3>
              <p className="text-body-md text-ink-6 mb-6">
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
                className="w-full h-12 text-body-md text-ink-7"
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
