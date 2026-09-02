import type { RefObject } from 'react'
import { motion } from 'framer-motion'
import Icon from '../../components/Icon'
import { openAppSettings } from '../../utils/openAppSettings'
import { toast } from '../../components/Toast'

/** QR scan overlay (APP-003/007) — extracted from DevicePage so the page stays under the MCP size cap. */
export default function DeviceQrScanOverlay({
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
}: {
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
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-ink-12 flex flex-col">
      <div className="flex items-center justify-between p-5 safe-area-top">
        <h3 className="text-lg font-bold text-ink-1">Scan QR Code</h3>
        <button onClick={() => { stopQrScan(); setQrVideoReady(false); setShowQrScan(false); setQrResult(null); setQrError(null) }}
          aria-label="Close"
          className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center text-white before:absolute before:content-[''] before:-inset-1.5">
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-5">
        {!qrResult ? (
          <>
            <div className="relative w-64 h-64 mb-6">
              {qrVideoReady && (
                <video
                  ref={videoRef as RefObject<HTMLVideoElement>}
                  className="absolute inset-0 w-full h-full object-cover rounded-l qr-scan-video"
                  playsInline
                  muted
                  controls={false}
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noremoteplayback"
                />
              )}
              <canvas ref={canvasRef as RefObject<HTMLCanvasElement>} className="hidden" />
              <div className="absolute inset-0 border-2 border-primary rounded-l">
                {([['top-0 left-0', 'border-t-4 border-l-4'], ['top-0 right-0', 'border-t-4 border-r-4'], ['bottom-0 left-0', 'border-b-4 border-l-4'], ['bottom-0 right-0', 'border-b-4 border-r-4']] as const).map(([pos, border], i) => (
                  <div key={i} className={`absolute w-8 h-8 ${pos} ${border} border-primary rounded-m`} />
                ))}
              </div>
              {!qrVideoReady && (
                <div className="absolute inset-0 bg-ink-10 rounded-l flex items-center justify-center">
                  <Icon name="scan" size={64} className="opacity-50" />
                </div>
              )}
            </div>
            {qrError ? (
              <div className="text-center px-2">
                <p className="text-body-md text-danger mb-4">{qrError}</p>
                {cameraDenied ? (
                  <button
                    onClick={async () => {
                      const ok = await openAppSettings()
                      if (!ok) toast.info('Camera is blocked. In your browser, tap the site-info icon in the address bar and allow Camera, then retry.')
                    }}
                    className="px-5 py-2 bg-primary rounded-full text-ink-13 text-body-md font-semibold"
                  >
                    Open Settings
                  </button>
                ) : (
                  <button onClick={startQrScan} className="px-5 py-2 bg-primary rounded-full text-ink-13 text-body-md font-semibold">Retry</button>
                )}
              </div>
            ) : (
              <>
                <p className="text-body-lg font-semibold text-ink-1 mb-1">Point camera at QR code</p>
                <p className="text-label text-ink-6">The code will be scanned automatically</p>
              </>
            )}
          </>
        ) : (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm bg-ink-10 rounded-l p-6">
            <div className="w-16 h-16 rounded-full bg-success/[0.15] flex items-center justify-center mx-auto mb-4">
              <Icon name="scan" size={32} />
            </div>
            <h4 className="text-lg font-bold text-ink-1 text-center mb-2">QR Code Scanned!</h4>
            <div className="bg-ink-12 rounded-l p-4 mb-3">
              <p className="text-caption text-ink-7 mb-1">Device ID / Serial Number</p>
              <p className="text-body-lg font-semibold text-primary break-all">{scannedSerial || '--'}</p>
              {scannedName && <p className="text-label text-ink-6 mt-1">{scannedName}</p>}
            </div>
            <div className="bg-ink-9 rounded-l p-3 mb-5">
              <p className="text-tiny text-ink-7 mb-1">Raw</p>
              <pre className="text-caption text-ink-6 whitespace-pre-wrap break-all">{qrResult}</pre>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setQrResult(null); startQrScan() }} className="flex-1 h-11 rounded-l bg-ink-9 text-ink-1 text-body-md font-medium">Scan Again</button>
              <button
                onClick={() => {
                  stopQrScan()
                  setQrVideoReady(false)
                  setShowQrScan(false)
                  setQrResult(null)
                  setQrError(null)
                  setShowManualAdd(true)
                }}
                className="flex-1 h-11 rounded-l bg-primary text-ink-13 text-body-md font-semibold"
              >
                Add Device
              </button>
            </div>
          </motion.div>
        )}
      </div>
      <div className="p-5 safe-area-bottom text-center">
        <p className="text-caption text-ink-7">Make sure the QR code is well-lit and in focus</p>
      </div>
    </div>
  )
}
