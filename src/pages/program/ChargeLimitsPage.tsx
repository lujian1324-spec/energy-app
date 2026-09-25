/**
 * Charge & Discharge Limits (`/device/:id/limits`, v4.22.0) — NOT RELEASED.
 * Only registered when CHARGE_LIMITS_ENABLED (config/chargeLimits.ts): the values
 * are saved with the program and uploaded, but no firmware register takes them yet.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SecondaryHeader } from '../../components/PageHeader'
import { toast } from '../../components/Toast'
import { useDeviceProgram } from '../../hooks/useDeviceProgram'
import { CHARGE_LIMIT_OPTIONS, DISCHARGE_LIMIT_OPTIONS, type ChargeLimits } from '../../utils/deviceProgram'
import { OptionGrid, SaveButton, saveToast } from './ui'

export default function ChargeLimitsPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { program, saving, save } = useDeviceProgram(id)
  const [draft, setDraft] = useState<ChargeLimits>(program.limits)
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setDraft(program.limits) }, [program, touched])
  const set = (patch: Partial<ChargeLimits>) => { setTouched(true); setDraft(d => ({ ...d, ...patch })) }
  const dirty = draft.chargeMax !== program.limits.chargeMax || draft.dischargeMin !== program.limits.dischargeMin

  const onSave = async () => {
    const r = await save({ limits: draft })
    const t = saveToast(r, 'Limits')
    toast[t.kind](t.title, t.body)
    if (r.ok) setTouched(false)
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader
        title={<h2 className="text-title-lg font-semibold text-ink-1 leading-tight">Charge &amp; Discharge<br />Limits</h2>}
        onBack={() => navigate(-1)}
        right={<SaveButton dirty={dirty} saving={saving} onSave={onSave} />}
      />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-4">
        <div className="rounded-l bg-ink-10 p-4">
          <p id="charge-limit-label" className="text-body-lg text-white mb-3">Charge Limit</p>
          <OptionGrid labelledBy="charge-limit-label" options={CHARGE_LIMIT_OPTIONS} value={draft.chargeMax}
            onChange={chargeMax => set({ chargeMax })} format={v => `${v}%`} />
        </div>
        <div className="rounded-l bg-ink-10 p-4">
          <p id="discharge-limit-label" className="text-body-lg text-white mb-3">Discharge Limit</p>
          <OptionGrid labelledBy="discharge-limit-label" options={DISCHARGE_LIMIT_OPTIONS} value={draft.dischargeMin}
            onChange={dischargeMin => set({ dischargeMin })} format={v => `${v}%`} />
        </div>
        <p className="text-label text-ink-6 px-1">
          Charging stops at the Charge Limit. With no AC input, the battery stops discharging at the Discharge Limit, including during a power outage.
        </p>
      </div>
    </div>
  )
}
