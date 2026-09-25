/**
 * Silent Mode (`/device/:id/charging/silent`, v4.22.0) — replaces Sleep Mode.
 *
 * The switch limits AC charging to 150 W (Sierro 2000: 300 W) for a quieter
 * unit. With "Scheduled Silent Mode" on, the limit applies only inside the
 * From–To window on the chosen days (a window may end the next day); outside it
 * the saved AC Charging Power is restored. The relay switches it with the app
 * closed.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SecondaryHeader } from '../../components/PageHeader'
import ToggleSwitch from '../../components/ToggleSwitch'
import { InlineTimePicker } from '../../components/TimeWheel'
import { toast } from '../../components/Toast'
import { useDeviceProgram } from '../../hooks/useDeviceProgram'
import {
  nextSilentChange, repeatLabel, silentCapW, silentState, silentToLabel, time12, type SilentSettings,
} from '../../utils/deviceProgram'
import { ChevronRow, DayPicker, SaveButton, saveToast } from './ui'

const sameSilent = (a: SilentSettings, b: SilentSettings) =>
  a.enabled === b.enabled && a.scheduled === b.scheduled && a.from === b.from && a.to === b.to && a.days.join() === b.days.join()

export default function SilentModePage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { program, model, saving, save } = useDeviceProgram(id)
  const [draft, setDraft] = useState<SilentSettings>(program.silent)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState<'from' | 'to' | 'repeat' | null>(null)
  useEffect(() => { if (!touched) setDraft(program.silent) }, [program, touched])

  const set = (patch: Partial<SilentSettings>) => { setTouched(true); setDraft(d => ({ ...d, ...patch })) }
  const cap = silentCapW(model)
  const preview = { ...program, silent: draft }
  const now = Date.now()
  const on = silentState(preview, now).on
  const change = nextSilentChange(preview, now)
  const to = silentToLabel(draft.from, draft.to)

  const onSave = async () => {
    const r = await save({ silent: draft })
    const t = saveToast(r, 'Silent Mode')
    toast[t.kind](t.title, t.body)
    if (r.ok) setTouched(false)
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Silent Mode" onBack={() => navigate(-1)}
        right={<SaveButton dirty={!sameSilent(draft, program.silent)} saving={saving} onSave={onSave} />} />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-4">
        <div className="rounded-l bg-ink-10 px-4 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-body-lg text-white">Silent Mode</p>
            <p className="text-body-md text-ink-6 mt-1" data-testid="silent-sub">
              {draft.enabled ? `AC charging limit: ${cap} W` : `Turn on to limit AC charging power to ${cap} W or less.`}
            </p>
          </div>
          <ToggleSwitch isOn={draft.enabled} ariaLabel="Silent Mode" onToggle={() => set({ enabled: !draft.enabled })} />
        </div>

        {draft.enabled && (
          <div>
            <p className="text-body-lg text-ink-4 mb-2 px-1">Schedule</p>
            <div className="rounded-l bg-ink-10 overflow-hidden divide-y divide-ink-9">
              <div className="min-h-[56px] px-4 flex items-center justify-between">
                <span className="text-body-lg text-white">Scheduled Silent Mode</span>
                <ToggleSwitch isOn={draft.scheduled} ariaLabel="Scheduled Silent Mode" onToggle={() => set({ scheduled: !draft.scheduled })} />
              </div>
              {draft.scheduled && (
                <>
                  <ChevronRow label="From" value={time12(draft.from)} ariaLabel={`From ${time12(draft.from)}`}
                    onPress={() => setOpen(o => (o === 'from' ? null : 'from'))} />
                  {open === 'from' && (
                    <div className="px-2 pb-2"><InlineTimePicker value={draft.from} onChange={from => set({ from })} onDone={() => setOpen(null)} /></div>
                  )}
                  <ChevronRow label="To" value={to.time} sub={to.nextDay ? 'Next day' : undefined} ariaLabel={`To ${to.time}${to.nextDay ? ' next day' : ''}`}
                    onPress={() => setOpen(o => (o === 'to' ? null : 'to'))} />
                  {open === 'to' && (
                    <div className="px-2 pb-2"><InlineTimePicker value={draft.to} onChange={value => set({ to: value })} onDone={() => setOpen(null)} /></div>
                  )}
                  <ChevronRow label="Repeat" value={repeatLabel(draft.days)} onPress={() => setOpen(o => (o === 'repeat' ? null : 'repeat'))} />
                  {open === 'repeat' && (
                    <div className="px-4 pb-4 pt-1"><DayPicker days={draft.days} onChange={days => set({ days })} /></div>
                  )}
                </>
              )}
            </div>
            <p className="text-label text-ink-6 mt-3 px-1" data-testid="silent-status">
              {draft.scheduled
                ? on
                  ? `Limiting now${change?.at ? ` · ends ${clock(change.at)}` : ''}. Outside the schedule your AC Charging Power is restored.`
                  : `Starts ${change?.at ? clock(change.at) : 'on the next scheduled day'}. Outside the schedule your AC Charging Power is used.`
                : 'Limiting all the time. Turn on Scheduled Silent Mode to limit only at set times.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** "9:00 AM" today, or "Sat 9:00 AM". */
function clock(ms: number): string {
  const d = new Date(ms)
  const t = time12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return t
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow ${t}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`
}
