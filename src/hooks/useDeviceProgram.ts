/**
 * One device's program for the Smart Schedule / Charging Settings / Silent Mode /
 * Limits screens (v4.22.0). Paints this phone's copy at once, then the relay's.
 *
 * Each screen edits only its own part and saves through `save(patch)`, which
 * merges the patch onto the latest saved program — so saving Silent Mode can
 * never undo a power change saved a moment ago on Charging Settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDeviceStore } from '../stores/deviceStore'
import { loadRatedParams } from '../db/powerflowDB'
import { loadProgram, peekProgram, saveProgram, sessionPrograms, type ProgramSaveResult } from '../api/programApi'
import { adaptProgram, type DeviceProgram } from '../utils/deviceProgram'

/** The last program each device was seen with in this session (screens share it). */
const latest = sessionPrograms

export function useDeviceProgram(deviceId: string) {
  const device = useDeviceStore(s => s.devices.find(d => String(d.id) === deviceId))
  const isDemoMode = useDeviceStore(s => s.isDemoMode)
  const [model, setModel] = useState<string>(device?.model || 'Sierro 1000')
  const [program, setProgram] = useState<DeviceProgram>(() => latest.get(deviceId) ?? peekProgram(deviceId, device?.model || 'Sierro 1000'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const online = device ? device.isOnline !== false : true

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const rated = await loadRatedParams(deviceId).catch(() => undefined)
      const m = rated?.model || device?.model || 'Sierro 1000'
      if (cancelled) return
      setModel(m)
      setProgram(p => adaptProgram(p, m))
      const loaded = isDemoMode ? { program: peekProgram(deviceId, m) } : await loadProgram(deviceId, m)
      if (cancelled) return
      latest.set(deviceId, loaded.program)
      setProgram(loaded.program)
      setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  const save = useCallback(async (patch: Partial<DeviceProgram>): Promise<ProgramSaveResult> => {
    if (savingRef.current) return { ok: false, background: false, applied: null, detail: 'Already saving' }
    savingRef.current = true
    setSaving(true)
    try {
      const base = latest.get(deviceId) ?? program
      const result = await saveProgram(deviceId, { ...base, ...patch, model }, { deviceOnline: online, base })
      const shown = result.ok ? result.program : result.current && adaptProgram(result.current, model)
      if (shown) {
        latest.set(deviceId, shown)
        setProgram(shown)
      }
      return result
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [deviceId, program, model, online])

  return { program, model, loading, saving, online, save, deviceName: device?.name ?? 'Device' }
}
