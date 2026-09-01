import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Icon from '../../components/Icon'
import { openAppSettings } from '../../utils/openAppSettings'
import { toast } from '../../components/Toast'
import ProvisioningPage from '../ProvisioningPage'
import ManualAddDeviceModal from '../../components/ManualAddDeviceModal'
import DeviceQrScanOverlay from './DeviceQrScanOverlay'

export default function DevicePageModals({
  showAddModal,
  setShowAddModal,
  handleBleScan,
  showQrScan,
  qrVideoReady,
  videoRef,
  canvasRef,
  qrResult,
  qrError,
  cameraDenied,
  scannedSerial,
  scannedName,
  stopQrScan,
  startQrScan,
  setQrVideoReady,
  setShowQrScan,
  setQrResult,
  setQrError,
  setShowManualAdd,
  showManualAdd,
  setScannedSerial,
  setScannedName,
  showProvisioning,
  setShowProvisioning,
  blePermissionType,
  setBlePermissionType,
}: {
  showAddModal: boolean
  setShowAddModal: (v: boolean) => void
  handleBleScan: () => void
  showQrScan: boolean
  qrVideoReady: boolean
  videoRef: { current: HTMLVideoElement | null }
  canvasRef: { current: HTMLCanvasElement | null }
  qrResult: string | null
  qrError: string | null
  cameraDenied: boolean
  scannedSerial: string
  scannedName: string
  stopQrScan: () => void
  startQrScan: () => void
  setQrVideoReady: (v: boolean) => void
  setShowQrScan: (v: boolean) => void
  setQrResult: (v: string | null) => void
  setQrError: (v: string | null) => void
  setShowManualAdd: (v: boolean) => void
  showManualAdd: boolean
  setScannedSerial: (v: string) => void
  setScannedName: (v: string) => void
  showProvisioning: boolean
  setShowProvisioning: (v: boolean) => void
  blePermissionType: 'unsupported' | 'denied' | null
  setBlePermissionType: (v: 'unsupported' | 'denied' | null) => void
}) {
  return (
    <>
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/[0.7] flex items-end"
            onClick={() => setShowAddModal(false)}>
            <motion.div initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-10 rounded-t-[28px] p-6 pb-10">
              <div className="w-10 h-1 bg-white/[0.15] rounded-full mx-auto mb-5" />
              <h3 className="text-base font-bold text-ink-1 mb-5">Add New Device</h3>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Bluetooth Scan', desc: 'Find nearby BLE devices', color: '#01D6BE', icon: '📡', action: handleBleScan },
                  { label: 'Wi-Fi Setup', desc: 'Scan nearby devices over Bluetooth & set Wi-Fi', color: '#34C759', icon: '📶', action: handleBleScan },
                  { label: 'Manual Entry', desc: 'Enter device code manually', color: '#FF9500', icon: '⌨️', action: () => { setShowAddModal(false); setShowManualAdd(true) } },
                  { label: 'Scan QR Code', desc: 'Scan device QR code', color: '#01D6BE', icon: '📷', action: () => { setShowAddModal(false); setShowQrScan(true) } },
                ].map((opt) => (
                  <button key={opt.label}
                    onClick={() => { if ('action' in opt && opt.action) opt.action(); else setShowAddModal(false) }}
                    className="flex items-center gap-4 p-4 bg-ink-9 rounded-l text-left transition-colors active:scale-[0.98]">
                    <span className="text-2xl">{opt.icon}</span>
                    <div className="flex-1">
                      <div className="text-body-md font-semibold" style={{ color: opt.color }}>{opt.label}</div>
                      <div className="text-caption text-ink-6 mt-0.5">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAddModal(false)}
                className="w-full mt-4 h-11 rounded-l bg-white/[0.06] text-ink-6 text-sm font-medium">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showQrScan && (
        <DeviceQrScanOverlay
          qrVideoReady={qrVideoReady}
          videoRef={videoRef}
          canvasRef={canvasRef}
          qrResult={qrResult}
          qrError={qrError}
          cameraDenied={cameraDenied}
          scannedSerial={scannedSerial}
          scannedName={scannedName}
          stopQrScan={stopQrScan}
          startQrScan={startQrScan}
          setQrVideoReady={setQrVideoReady}
          setShowQrScan={setShowQrScan}
          setQrResult={setQrResult}
          setQrError={setQrError}
          setShowManualAdd={setShowManualAdd}
        />
      )}

      <AnimatePresence>
        {showManualAdd && (
          <ManualAddDeviceModal
            onClose={() => { setShowManualAdd(false); setScannedSerial(''); setScannedName('') }}
            initialSerialNumber={scannedSerial}
            initialName={scannedName}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProvisioning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProvisioningPage onClose={() => setShowProvisioning(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {blePermissionType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/[0.7] flex items-end"
            onClick={() => setBlePermissionType(null)}
          >
            <motion.div
              initial={{ y: 240, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 240, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-ink-10 rounded-t-[28px] p-6 pb-10"
            >
              <div className="w-10 h-1 bg-white/[0.15] rounded-full mx-auto mb-5" />
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-primary/[0.12] flex items-center justify-center mb-4">
                  <Icon name="bluetooth" size={32} />
                </div>
                <h3 className="text-title-lg font-semibold text-white mb-2">Bluetooth Permission Required</h3>
                {blePermissionType === 'unsupported' ? (
                  <p className="text-body-md text-ink-7 leading-relaxed max-w-[300px]">
                    Bluetooth scanning is not supported in this browser. On iOS, please use the Sierro native app, or go to Settings and enable Bluetooth access.
                  </p>
                ) : (
                  <p className="text-body-md text-ink-7 leading-relaxed max-w-[300px]">
                    Bluetooth is currently unavailable or access was denied. Please enable Bluetooth in your system settings and grant permission to this app.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={async () => {
                    setBlePermissionType(null)
                    const ok = await openAppSettings()
                    if (!ok) toast.info('Open Settings → Apps → Sierro → Permissions → Nearby devices, and allow it.')
                  }}
                  className="w-full h-12 rounded-m bg-primary text-ink-13 text-body-lg font-semibold active:scale-95 transition-transform"
                >
                  Open Settings
                </button>
                <button
                  onClick={() => setBlePermissionType(null)}
                  className="w-full h-12 rounded-m bg-white/[0.06] text-ink-7 text-body-lg font-medium active:scale-95 transition-transform"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
