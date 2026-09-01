/**
 * QR scanner used by ProvisioningPage (jsQR + getUserMedia).
 * video.qr-scan-video hides the WebView default media play overlay.
 */
import { useState, useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
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
  const [scanned, setScanned] = useState<{ name: string; serial: string } | null>(null)
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

  // scanned == null 时（初次进入或点了 Rescan）重新获取摄像头流。
  // Native: requestCamera BEFORE getUserMedia / mounting <video> so Android
  // never shows the default media play overlay on the permission dialog.
  useEffect(() => {
    if (scanned) return
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
  }, [scanned])

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
        setScanned({ name, serial })
        return
      }
      rafRef.current = requestAnimationFrame(scan)
    }
    rafRef.current = requestAnimationFrame(scan)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [cameraReady])

  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top absolute top-0 left-0 right-0 z-10">
        <button onClick={handleQrBack} aria-label="Back" className="relative w-10 h-10 rounded-full bg-black/[0.5] flex items-center justify-center before:absolute before:content-[''] before:-inset-1">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="text-title-lg font-semibold text-white">Scan QR Code</h1>
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

      {/* Dark overlay with viewfinder cutout */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-64 h-64">
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

      <div className="absolute bottom-0 left-0 right-0 px-6 pb-10 safe-area-bottom">
        {error ? (
          <div className="bg-danger/90 rounded-l p-4 text-center">
            <p className="text-white text-body-md">{error}</p>
            <button onClick={handleQrBack} className="mt-3 text-white font-semibold underline text-body-md">Go Back</button>
          </div>
        ) : scanned ? (
          <div className="bg-black/[0.85] rounded-l p-5">
            <p className="text-caption text-primary font-semibold uppercase tracking-widest mb-1">Device Scanned</p>
            <p className="text-title-md font-bold text-white">{scanned.name}</p>
            <p className="text-caption text-ink-6 mb-5">{scanned.serial}</p>
            <div className="flex gap-3">
              <button onClick={() => { setScanned(null); setCameraReady(false) }}
                className="flex-1 h-12 rounded-full border border-white/[0.3] text-white font-semibold text-body-md">
                Rescan
              </button>
              <button onClick={() => onScanned(scanned.name, scanned.serial)}
                className="flex-1 h-12 rounded-full bg-primary text-black font-semibold text-body-md">
                Connect Device
              </button>
            </div>
          </div>
        ) : (
          <p className="text-center text-white/[0.7] text-body-md">
            Point your camera at the QR code on your Sierro device
          </p>
        )}
      </div>
    </div>
  )
}

export default QrScanScreen
