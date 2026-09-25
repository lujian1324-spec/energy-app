/**
 * Charging Settings (`/device/:id/charging`, v4.22.0).
 *
 * The AC charging power — a slider since v4.24.0 (Sierro 1000: 50, 100, 200, 300,
 * 400 W; Sierro 2000: 100–800 W every 100 W) — and the
 * way into Silent Mode. Save stores it with the rest of the program and writes the
 * power the program implies now to register 0x0085:
 *  - while Silent Mode is limiting, the slider stays at or under its limit, and a
 *    power picked there is the user's own setting (kept after a window ends);
 *  - while a Stop Charging schedule is in effect the new power is kept for when
 *    charging starts again — changing it never starts a charge.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SecondaryHeader } from '../../components/PageHeader'
import { toast } from '../../components/Toast'
import { useDeviceProgram } from '../../hooks/useDeviceProgram'
import {
  chargePowerOptions, chargeState, nextOccurrence, silentCapW, silentState, time12,
} from '../../utils/deviceProgram'
import { ChevronRow, PowerSlider, SaveButton, saveToast } from './ui'

export default function ChargingSettingsPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { program, model, saving, save } = useDeviceProgram(id)
  const [power, setPower] = useState(program.chargePowerW)
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setPower(program.chargePowerW) }, [program, touched])

  const now = Date.now()
  const cap = silentCapW(model)
  const silentOn = silentState(program, now).on
  const shownPower = silentOn ? Math.min(power, cap) : power
  const charging = chargeState(program, now)
  const nextStart = charging.charging ? null : nextStartLabel(program, now)

  const onSave = async () => {
    const r = await save({ chargePowerW: power })
    const t = saveToast(r, 'Charging Settings')
    toast[t.kind](t.title, t.body)
    if (r.ok) setTouched(false)
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Charging Settings" onBack={() => navigate(-1)}
        right={<SaveButton dirty={power !== program.chargePowerW} saving={saving} onSave={onSave} />} />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-4">
        <div className="rounded-l bg-ink-10 p-4">
          <p id="ac-power-label" className="text-title-md text-white">AC Charging Power</p>
          <p className="text-headline-xl font-semibold text-white tnum mt-1 mb-4" data-testid="ac-power-value">{shownPower} W</p>
          <PowerSlider
            labelledBy="ac-power-label"
            stops={chargePowerOptions(model)}
            value={shownPower}
            maxAllowed={silentOn ? cap : undefined}
            onChange={w => { setTouched(true); setPower(w) }}
          />
          {silentOn && (
            <p className="text-label text-ink-6 mt-3">Silent Mode is limiting AC charging to {cap} W.</p>
          )}
          {!charging.charging && (
            <p className="text-label text-warning mt-3" data-testid="charging-paused-note">
              Charging is paused by Smart Schedule{nextStart ? ` until ${nextStart}` : ''}. A new power applies when charging starts.
            </p>
          )}
        </div>

        <div className="rounded-l bg-ink-10 overflow-hidden">
          <ChevronRow label="Silent Mode" value={program.silent.enabled ? 'On' : 'Off'}
            onPress={() => navigate(`/device/${id}/charging/silent`)} />
        </div>
      </div>
    </div>
  )
}

/** "11:00 PM" — when the next Start Charging schedule runs, if there is one. */
function nextStartLabel(program: Parameters<typeof chargeState>[0], now: number): string | null {
  let best: number | null = null
  for (const t of program.tasks) {
    if (!t.enabled || t.kind !== 'charge' || t.action !== 'start') continue
    const at = nextOccurrence(t.time, t.days, program.tz, now)
    if (at != null && (best == null || at < best)) best = at
  }
  if (best == null) return null
  const d = new Date(best)
  return time12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}
