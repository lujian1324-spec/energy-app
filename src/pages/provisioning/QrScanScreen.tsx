/**
 * QR scanner used by ProvisioningPage (jsQR + getUserMedia).
 * video.qr-scan-video hides the WebView default media play overlay.
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import ErrorToast from '../../components/ErrorToast'
import jsQR from 'jsqr'
import { Capacitor } from '@capacitor/core'
import { requestCamera } from '../../utils/permissions'
import { formatScanDisplayName } from '../../utils/scanDisplayName'

function QrScanScreen({ onBack, onScanned }: {
  onBack: () => void
  onScanned: (name: string, serial: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  const handleQrBack = () => {
    stopCamera()
    setCameraReady(false)
    onBack()
  }

  // Native: requestCamera BEFORE getUserMedia / mounting <video> so Android
  // never shows the default media play overlay on the permission dialog.
  useEffect(() => {
    let stopped = false
    const start = async () => {
      setError(null)
      setCameraReady(false)
      try {
        if (Capacitor.isNativePlatform()) {
          const cam = await requestCamera()
          if (stopped) return
          if (cam.state === 'denied') {
            setError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
            return
          }
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        setCameraReady(true)
      } catch {
        setError('Camera permission denied. Please allow camera access and try again.')
        setCameraReady(false)
      }
    }
    start()
    return () => {
      stopped = true
      stopCamera()
    }
  }, [])

  // Attach stream only after <video> is mounted (cameraReady).
  useEffect(() => {
    if (!cameraReady || !streamRef.current || !videoRef.current) return
    const video = videoRef.current
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')
    video.srcObject = streamRef.current
    void video.play().catch(() => {})
  }, [cameraReady])

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
        const rawName = parts.length >= 2 ? parts[1] : 'Sierro Device'
        const serial = parts.length >= 3 ? parts[2] : code.data
        const name = formatScanDisplayName({ name: rawName, serial })
        streamRef.current?.getTracks().forEach(t => t.stop())
        // A_1.3.1 has no result card — a good read moves to A_1.3.2 Device Scanned.
        onScanned(name, serial)
        return
      }
      rafRef.current = requestAnimationFrame(scan)
    }
    rafRef.current = requestAnimationFrame(scan)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [cameraReady])

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pb-5 safe-area-top-header flex items-center absolute top-0 left-0 right-0 z-10">
        <button onClick={handleQrBack} aria-label="Back" className="relative w-10 h-10 rounded-full bg-black/[0.5] flex items-center justify-center before:absolute before:content-[''] before:-inset-1">
          <ChevronLeft size={24} className="text-white" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-title-lg font-semibold text-white">
          Scan QR Code
        </h1>
      </div>

      {/* Camera feed — mount <video> only after permission + stream, matching DevicePage */}
      {cameraReady && !error && (
        <video
          ref={videoRef}
          className="qr-scan-video absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          controls={false}
          disablePictureInPicture
        />
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Viewfinder — A_1.3.1 draws a 306 square with teal corner arcs at y284. */}
      <div className="absolute inset-0">
        <div className="absolute left-1/2 -translate-x-1/2 w-[306px] h-[306px]" style={{ top: 284 }}>
          {/* corners */}
          {[['top-0 left-0', 'M0 20V4C0 1.79 1.79 0 4 0H20'],
            ['top-0 right-0', 'M24 20V4C24 1.79 22.21 0 20 0H4'],
            ['bottom-0 left-0', 'M0 4V20C0 22.21 1.79 24 4 24H20'],
            ['bottom-0 right-0', 'M24 4V20C24 22.21 22.21 0 20 24H4'],
          ].map(([pos, d], i) => (
            <svg key={i} className={`absolute ${pos}`} width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d={d} stroke="#01D6BE" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ))}
        </div>
      </div>

      {/* Caption under the viewfinder, then the failure toast at the bottom edge. */}
      <div className="absolute left-0 right-0 px-4 text-center" style={{ top: 605 }}>
        <p className="text-title-lg font-semibold text-white">Scan the QR Code on Your Device</p>
        <p className="mt-2 text-body-md text-white/[0.8]">
          The QR code is located on the side of your Sierro device near the power outlet.
        </p>
      </div>

      {error && (
        <div
          className="absolute left-0 right-0 px-4"
          style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 2px)' }}
        >
          <ErrorToast message={error} onDismiss={() => setError(null)} />
        </div>
      )}

    </div>
  )
}

export default QrScanScreen
