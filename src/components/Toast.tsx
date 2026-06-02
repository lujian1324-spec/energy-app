import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'warning' | 'error' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

// ───── 单条 Toast ─────
function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const duration = toast.duration ?? 3500

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), duration)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [toast.id, duration, onDismiss])

  const config: Record<ToastType, { icon: typeof CheckCircle; color: string; bg: string; border: string }> = {
    success: { icon: CheckCircle, color: '#34C759', bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.25)' },
    warning: { icon: AlertTriangle, color: '#FF9500', bg: 'rgba(255,149,0,0.12)', border: 'rgba(255,149,0,0.25)' },
    error:   { icon: XCircle,      color: '#FF3B30', bg: 'rgba(255,59,48,0.12)',  border: 'rgba(255,59,48,0.25)'  },
    info:    { icon: Info,          color: '#0D9488', bg: 'rgba(13,148,136,0.12)', border: 'rgba(13,148,136,0.25)' },
  }

  const { icon: Icon, color, bg, border } = config[toast.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: 'spring', damping: 26, stiffness: 360 }}
      className="flex items-start gap-3 px-4 py-3 rounded-[18px] mx-4"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        backdropFilter: 'none',
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#FFFFFF] leading-snug">{toast.title}</div>
        {toast.message && (
          <div className="text-[11px] text-[#8E8E93] mt-0.5 leading-snug">{toast.message}</div>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 w-5 h-5 rounded-full bg-[rgba(255,255,255,0.08)] flex items-center justify-center mt-0.5"
      >
        <X size={10} className="text-[#8E8E93]" />
      </button>
    </motion.div>
  )
}

// ───── Toast 容器 ─────
export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed top-safe-4 left-0 right-0 z-[200] pointer-events-none"
      style={{ top: 'env(safe-area-inset-top, 16px)', paddingTop: '16px' }}
    >
      <div className="pointer-events-auto flex flex-col gap-2">
        <AnimatePresence mode="sync">
          {toasts.map(t => (
            <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ───── useToast hook ─────
let _globalShow: ((toast: Omit<ToastItem, 'id'>) => void) | null = null

export function registerToast(fn: (toast: Omit<ToastItem, 'id'>) => void) {
  _globalShow = fn
}

/** 全局调用方式：toast.success('Done') / toast.error('Failed') */
export const toast = {
  show: (t: Omit<ToastItem, 'id'>) => _globalShow?.(t),
  success: (title: string, message?: string) => _globalShow?.({ type: 'success', title, message }),
  error:   (title: string, message?: string) => _globalShow?.({ type: 'error',   title, message }),
  warning: (title: string, message?: string) => _globalShow?.({ type: 'warning', title, message }),
  info:    (title: string, message?: string) => _globalShow?.({ type: 'info',    title, message }),
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts(prev => [{ id, ...t }, ...prev].slice(0, 4)) // 最多4条
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // 注册全局调用
  useEffect(() => {
    registerToast(show)
    return () => { _globalShow = null }
  }, [show])

  return { toasts, show, dismiss }
}
