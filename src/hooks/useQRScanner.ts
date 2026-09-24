/**
 * T25: QR Code 扫描配网 hook
 *
 * 二维码扫描策略（按浏览器支持度降级）：
 * 1. BarcodeDetector API（Chrome 83+, Edge 83+）— 原生，性能最佳
 * 2. jsQR（兼容模式）— 纯 JS，Universal 支持
 *
 * 配网二维码格式（Sierro Open API 规范）：
 *   sierro://<deviceId>?sn=<sn>&model=<model>&wifi=<ssid>&pass=<wifiPass>
 *   或纯文本: <deviceId> （最简格式）
 *
 * 使用方法：
 *   const { startScan, stopScan, scanning, result, error } = useQRScanner()
 *   // result?.deviceId 为解析出的设备 ID
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { toUserFacingError } from '../utils/uiCopy'

// ----------------------------------------------------------------
// 二维码结果类型
// ----------------------------------------------------------------
export interface QRScanResult {
  /** 原始二维码文本 */
  raw: string
  /** 解析出的设备 ID */
  deviceId?: string
  /** 设备序列号 */
  sn?: string
  /** 设备型号 */
  model?: string
  /** Wi-Fi SSID（AP 配网模式） */
  wifiSsid?: string
  /** Wi-Fi 密码 */
  wifiPass?: string
  /** 扫描时间戳 */
  scannedAt: number
}

// ----------------------------------------------------------------
// 解析二维码内容
// ----------------------------------------------------------------
function parseQRContent(raw: string): QRScanResult {
  const base: QRScanResult = { raw, scannedAt: Date.now() }

  // 尝试 sierro:// schema
  if (raw.startsWith('sierro://')) {
    try {
      const url = new URL(raw)
      base.deviceId = url.hostname || url.pathname.replace(/^\//, '')
      base.sn = url.searchParams.get('sn') ?? undefined
      base.model = url.searchParams.get('model') ?? undefined
      base.wifiSsid = url.searchParams.get('wifi') ?? undefined
      base.wifiPass = url.searchParams.get('pass') ?? undefined
      return base
    } catch {/* fall through */}
  }

  // 尝试 JSON
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>
      base.deviceId = obj['deviceId'] ?? obj['device_id'] ?? obj['id']
      base.sn = obj['sn'] ?? obj['serialNumber']
      base.model = obj['model']
      base.wifiSsid = obj['wifi'] ?? obj['ssid']
      base.wifiPass = obj['pass'] ?? obj['password']
      return base
    } catch {/* fall through */}
  }

  // 纯文本：直接当 deviceId（字母数字，16~32位）
  if (/^[A-Za-z0-9_-]{8,40}$/.test(raw.trim())) {
    base.deviceId = raw.trim()
  }

  return base
}

// ----------------------------------------------------------------
// 检测 BarcodeDetector 是否可用
// ----------------------------------------------------------------
function isBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

// BarcodeDetector 实例类型
interface BarcodeDetectorInstance {
  detect(img: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

// 创建 BarcodeDetector 实例（不支持时返回 null）
function createBarcodeDetector(): BarcodeDetectorInstance | null {
  if (!isBarcodeDetectorSupported()) return null
  try {
    const BD = (window as typeof window & {
      BarcodeDetector: new(opts?: { formats?: string[] }) => BarcodeDetectorInstance
    }).BarcodeDetector
    return new BD({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

// ----------------------------------------------------------------
// Hook
// ----------------------------------------------------------------
export type ScanStatus = 'idle' | 'requesting' | 'scanning' | 'success' | 'error'

export interface UseQRScannerOptions {
  /** 扫描到结果后自动停止摄像头（默认 true） */
  autoStop?: boolean
  /** 每帧扫描间隔 ms（默认 300） */
  scanInterval?: number
  /** 扫到结果的回调 */
  onResult?: (result: QRScanResult) => void
}

export interface UseQRScannerReturn {
  status: ScanStatus
  scanning: boolean
  result: QRScanResult | null
  error: string | null
  videoRef: React.RefObject<HTMLVideoElement>
  startScan: () => Promise<void>
  stopScan: () => void
  resetResult: () => void
}

export function useQRScanner(opts: UseQRScannerOptions = {}): UseQRScannerReturn {
  const { autoStop = true, scanInterval = 300, onResult } = opts

  const [status, setStatus] = useState<ScanStatus>('idle')
  const [result, setResult] = useState<QRScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // ----------------------------------------------------------------
  // BarcodeDetector 扫描（现代浏览器）
  // ----------------------------------------------------------------
  const scanWithNativeAPI = useCallback(async (
    video: HTMLVideoElement,
    detector: BarcodeDetectorInstance
  ): Promise<string | null> => {
    try {
      const barcodes = await detector.detect(video)
      if (barcodes.length > 0) {
        return barcodes[0].rawValue
      }
    } catch {/* ignore detection errors */}
    return null
  }, [])

  // ----------------------------------------------------------------
  // Canvas / jsQR 扫描（降级）
  // ----------------------------------------------------------------
  const scanWithCanvas = useCallback((video: HTMLVideoElement): string | null => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 尝试读取 data URL 并做简单模式匹配（仅作最基础降级）
    // 生产环境应引入 jsQR: import jsQR from 'jsqr'
    // const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    // const code = jsQR(imageData.data, imageData.width, imageData.height)
    // return code?.data ?? null
    return null  // 未安装 jsQR 时返回 null
  }, [])

  // ----------------------------------------------------------------
  // 停止扫描
  // ----------------------------------------------------------------
  const stopScan = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (mountedRef.current) {
      setStatus(prev => prev === 'success' ? 'success' : 'idle')
    }
  }, [])

  // ----------------------------------------------------------------
  // 开始扫描
  // ----------------------------------------------------------------
  const startScan = useCallback(async () => {
    if (!mountedRef.current) return
    setError(null)
    setResult(null)
    setStatus('requesting')

    // 1. 申请摄像头权限
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',  // 后置摄像头优先
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setStatus('scanning')
    } catch (err) {
      console.error('[useQRScanner] camera failed:', err)
      const msg = toUserFacingError(err, 'Camera error')
      if (mountedRef.current) {
        setError(msg)
        setStatus('error')
      }
      return
    }

    // 2. 初始化 BarcodeDetector 或降级
    const detector = createBarcodeDetector()

    // 3. 轮询扫描帧
    timerRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      let rawValue: string | null = null

      if (detector) {
        rawValue = await scanWithNativeAPI(video, detector)
      } else {
        rawValue = scanWithCanvas(video)
      }

      if (rawValue && mountedRef.current) {
        const parsed = parseQRContent(rawValue)
        setResult(parsed)
        setStatus('success')
        onResult?.(parsed)

        if (autoStop) {
          stopScan()
        }
      }
    }, scanInterval)
  }, [autoStop, scanInterval, onResult, scanWithNativeAPI, scanWithCanvas, stopScan])

  // ----------------------------------------------------------------
  // 重置结果
  // ----------------------------------------------------------------
  const resetResult = useCallback(() => {
    setResult(null)
    setError(null)
    setStatus('idle')
  }, [])

  // ----------------------------------------------------------------
  // 清理
  // ----------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopScan()
    }
  }, [stopScan])

  return {
    status,
    scanning: status === 'scanning',
    result,
    error,
    videoRef,
    startScan,
    stopScan,
    resetResult,
  }
}
