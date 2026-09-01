import { useState, useRef, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import jsQR from 'jsqr'
import { requestCamera } from '../../utils/permissions'

export function parseQrPayload(text: string): { serial: string; name: string } {
  const raw = text.trim()
  if (/^SIERRO:/i.test(raw)) {
    const parts = raw.split(':')
    const serial = parts[2]?.trim() || parts[1]?.trim() || raw
    const name = parts.length >= 3 ? parts[1]?.trim() : ''
    return { serial, name: name || '' }
  }
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw)
      const serial = String(obj.sn ?? obj.serialNumber ?? obj.deviceSerialNumber ?? obj.deviceId ?? obj.id ?? '').trim()
      const name = String(obj.name ?? obj.deviceName ?? obj.model ?? '').trim()
      if (serial) return { serial, name }
    } catch { /* ignore */ }
  }
  if (/^https?:\/\//i.test(raw) || raw.includes('?')) {
    try {
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
      const params = new URLSearchParams(qs)
      const serial = (params.get('sn') ?? params.get('serialNumber') ?? params.get('deviceId') ?? params.get('id') ?? '').trim()
      const name = (params.get('name') ?? params.get('model') ?? '').trim()
      if (serial) return { serial, name }
    } catch { /* ignore */ }
  }
  return { serial: raw, name: '' }
}

export function useDeviceQrScan() {
  const [showQrScan, setShowQrScan] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [, setQrScanning] = useState(false)
  const [qrResult, setQrResult] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [cameraDenied, setCameraDenied] = useState(false)
  const [qrVideoReady, setQrVideoReady] = useState(false)
  const qrStreamRef = useRef<MediaStream | null>(null)
  const cameraDeniedRef = useRef(cameraDenied)
  cameraDeniedRef.current = cameraDenied
  const showQrScanRef = useRef(showQrScan)
  showQrScanRef.current = showQrScan
  const [scannedSerial, setScannedSerial] = useState('')
  const [scannedName, setScannedName] = useState('')
  const animationFrameRef = useRef<number | null>(null)

  function stopQrScan() {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    const stream = qrStreamRef.current || (videoRef.current?.srcObject as MediaStream | null)
    stream?.getTracks().forEach(t => t.stop())
    qrStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setQrScanning(false)
    setQrVideoReady(false)
  }

  function tickQrDecode() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      return
    }
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) {
      animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      return
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { animationFrameRef.current = requestAnimationFrame(tickQrDecode); return }
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
    if (code && code.data) {
      const { serial, name } = parseQrPayload(code.data)
      setScannedSerial(serial)
      setScannedName(name)
      setQrResult(code.data)
      stopQrScan()
      return
    }
    animationFrameRef.current = requestAnimationFrame(tickQrDecode)
  }

  async function startQrScan() {
    setQrScanning(true)
    setQrError(null)
    setQrResult(null)
    setCameraDenied(false)
    setQrVideoReady(false)
    setScannedSerial('')
    setScannedName('')
    try {
      if (Capacitor.isNativePlatform()) {
        const cam = await requestCamera()
        if (cam.state === 'denied') {
          setCameraDenied(true)
          setQrError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
          setQrScanning(false)
          return
        }
      }
      qrStreamRef.current?.getTracks().forEach(tr => tr.stop())
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      qrStreamRef.current = stream
      flushSync(() => setQrVideoReady(true))
      if (videoRef.current) {
        videoRef.current.setAttribute('playsinline', 'true')
        videoRef.current.setAttribute('webkit-playsinline', 'true')
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = requestAnimationFrame(tickQrDecode)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/denied|permission|notallowed/i.test(msg)) {
        setCameraDenied(true)
        setQrError('Camera access was denied. Please enable camera permission in Settings to scan QR codes.')
      } else {
        setQrError(`Camera error: ${msg}`)
      }
      setQrScanning(false)
      setQrVideoReady(false)
    }
  }

  useEffect(() => {
    if (showQrScan) {
      startQrScan()
    }
    return () => { stopQrScan() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQrScan])

  useEffect(() => {
    let removed = false
    let handle: { remove: () => Promise<void> } | undefined
    const setup = async () => {
      handle = await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || removed) return
        if (cameraDeniedRef.current && showQrScanRef.current) {
          void startQrScan()
        }
      })
    }
    void setup()
    return () => {
      removed = true
      void handle?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    showQrScan,
    setShowQrScan,
    videoRef,
    canvasRef,
    qrResult,
    setQrResult,
    qrError,
    setQrError,
    cameraDenied,
    qrVideoReady,
    setQrVideoReady,
    scannedSerial,
    setScannedSerial,
    scannedName,
    setScannedName,
    stopQrScan,
    startQrScan,
  }
}
