import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from '../../components/Toast'
import {
  FAN_SPEED_MAX,
  FAN_SPEED_MIN,
  applyFanSpeed,
  clampFanSpeed,
  loadFanSpeed,
  saveFanSpeed,
} from '../../api/fanControl'

/**
 * Manual fan speed, 0–100 %, on Device Settings.
 *
 * Dragging only moves the slider; the write goes out when the thumb is let go
 * (or a key changes it), so one drag is one passthrough frame, not one per step.
 * Writes are serialised: a value chosen while one is in flight is sent after it,
 * and only the newest such value. A refused write snaps the slider back to the
 * last speed the device accepted.
 */
export default function FanSpeedCard({
  deviceId,
  disabled = false,
  demo = false,
}: {
  deviceId: string
  /** Device offline: a passthrough cannot reach it. */
  disabled?: boolean
  /** Demo devices have nothing to write to; the slider still moves. */
  demo?: boolean
}) {
  const [value, setValue] = useState(() => loadFanSpeed(deviceId) ?? FAN_SPEED_MIN)
  const [sending, setSending] = useState(false)
  const confirmedRef = useRef(value)
  const inFlightRef = useRef(false)
  const queuedRef = useRef<number | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    const saved = loadFanSpeed(deviceId) ?? FAN_SPEED_MIN
    confirmedRef.current = saved
    setValue(saved)
    return () => { aliveRef.current = false }
  }, [deviceId])

  const send = async (speed: number) => {
    inFlightRef.current = true
    setSending(true)
    let next: number | null = speed
    while (next !== null) {
      const target: number = next
      queuedRef.current = null
      if (target === confirmedRef.current) break
      if (demo) {
        confirmedRef.current = target
        saveFanSpeed(deviceId, target)
      } else {
        const r = await applyFanSpeed(deviceId, target)
        if (r.ok) {
          confirmedRef.current = r.speed
          saveFanSpeed(deviceId, r.speed)
        } else {
          console.warn('[FanSpeed] write refused:', r.detail)
          if (aliveRef.current) {
            toast.error('Could not set fan speed')
            // A newer choice is still worth trying; otherwise show what the device holds.
            if (queuedRef.current === null) setValue(confirmedRef.current)
          }
        }
      }
      next = queuedRef.current
    }
    inFlightRef.current = false
    if (aliveRef.current) setSending(false)
  }

  const commit = (raw: number) => {
    const speed = clampFanSpeed(raw)
    if (inFlightRef.current) { queuedRef.current = speed; return }
    if (speed === confirmedRef.current) return
    void send(speed)
  }

  const pct = ((value - FAN_SPEED_MIN) / (FAN_SPEED_MAX - FAN_SPEED_MIN)) * 100

  return (
    <div className={`rounded-l bg-ink-10 px-4 py-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-body-lg text-ink-2">Fan Speed</span>
        <span className="flex items-center gap-2 text-body-md font-semibold text-primary tnum">
          {sending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {value}%
        </span>
      </div>
      <input
        type="range"
        min={FAN_SPEED_MIN}
        max={FAN_SPEED_MAX}
        step={1}
        value={value}
        disabled={disabled}
        aria-label="Fan speed"
        aria-valuetext={`${value}%`}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onTouchEnd={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        className="w-full h-1.5 rounded-pill appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(to right, #01D6BE 0%, #01D6BE ${pct}%, #454545 ${pct}%, #454545 100%)`,
        }}
      />
      <div className="flex justify-between mt-1 text-tiny text-ink-7">
        <span>{FAN_SPEED_MIN}%</span>
        <span>{FAN_SPEED_MAX}%</span>
      </div>
    </div>
  )
}
