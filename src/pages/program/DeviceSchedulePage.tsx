/**
 * Smart Schedule (`/device/:id/schedule`, v4.22.0).
 *
 * Timed tasks for one device, in two tabs: AC Output (turn the outlets on/off)
 * and Charging (start/stop charging). Each task has a time, repeat days and its
 * own switch; tasks are added, edited and deleted in a sheet, and nothing reaches
 * the device until Save. Saved tasks run on Sierro's server (the relay) with the
 * app closed, in this phone's time zone — see server/deviceProgram.js for the rules.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { SecondaryHeader } from '../../components/PageHeader'
import BottomSheet from '../../components/BottomSheet'
import ToggleSwitch from '../../components/ToggleSwitch'
import Icon from '../../components/Icon'
import { InlineTimePicker } from '../../components/TimeWheel'
import { toast } from '../../components/Toast'
import { useDeviceProgram } from '../../hooks/useDeviceProgram'
import {
  MAX_TASKS, findClash, newTask, repeatLabel, taskTitle, time12, type ScheduleTask,
} from '../../utils/deviceProgram'
import { DayPicker, SaveButton, saveToast } from './ui'

type Kind = ScheduleTask['kind']

const sameTasks = (a: ScheduleTask[], b: ScheduleTask[]) => JSON.stringify(a.map(strip)) === JSON.stringify(b.map(strip))
function strip(t: ScheduleTask) { const { updatedAt: _u, ...rest } = t; return rest }

export default function DeviceSchedulePage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { program, loading, saving, save } = useDeviceProgram(id)
  const [tab, setTab] = useState<Kind>('charge')
  const [tasks, setTasks] = useState<ScheduleTask[]>(program.tasks)
  const [editing, setEditing] = useState<{ task: ScheduleTask; isNew: boolean } | null>(null)

  // Follow the saved copy (relay) until the user starts editing.
  const [touched, setTouched] = useState(false)
  useEffect(() => { if (!touched) setTasks(program.tasks) }, [program, touched])

  const dirty = !sameTasks(tasks, program.tasks)
  const shown = useMemo(() => tasks.filter(t => t.kind === tab), [tasks, tab])

  const update = (next: ScheduleTask[]) => { setTouched(true); setTasks(next) }

  const onSave = async () => {
    const clash = findClash(tasks)
    if (clash) { toast.error("Couldn't save Smart Schedule", clash); return }
    const r = await save({ tasks })
    const t = saveToast(r, 'Smart Schedule')
    toast[t.kind](t.title, t.body)
    if (r.ok) setTouched(false)
  }

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Smart Schedule" onBack={() => navigate(-1)}
        right={<SaveButton dirty={dirty} saving={saving} onSave={onSave} />} />
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-3">
        {/* Tabs */}
        <div role="tablist" className="grid grid-cols-2 rounded-l bg-ink-10 border-s border-ink-9 p-1">
          {([['ac', 'AC Output'], ['charge', 'Charging']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
              className={`h-11 rounded-m text-body-lg transition-colors ${tab === k ? 'bg-ink-8 text-white font-semibold' : 'text-ink-4'}`}>
              {label}
            </button>
          ))}
        </div>

        {shown.map(t => (
          <div key={t.id} data-testid={`task-${t.id}`} className="rounded-l bg-ink-10 pl-4 pr-2 py-4 flex items-center gap-3">
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing({ task: t, isNew: false })}>
              <p className="text-body-lg text-white">{taskTitle(t)}</p>
              <p className={`text-headline-lg tnum mt-1 ${t.enabled ? 'text-white' : 'text-ink-7'}`}>{time12(t.time)}</p>
              <p className="text-body-md text-ink-6 mt-1">{repeatLabel(t.days)}</p>
            </button>
            <ToggleSwitch isOn={t.enabled} ariaLabel={`${taskTitle(t)} at ${time12(t.time)}`}
              onToggle={() => update(tasks.map(x => x.id === t.id ? { ...x, enabled: !x.enabled } : x))} />
            <button type="button" aria-label={`Edit ${taskTitle(t)}`} onClick={() => setEditing({ task: t, isNew: false })}
              className="w-10 h-12 flex items-center justify-center text-ink-4">
              <Icon name="chevron-right" size={22} />
            </button>
          </div>
        ))}

        {!loading && shown.length === 0 && (
          <p className="text-body-md text-ink-6 text-center py-6">
            {tab === 'ac' ? 'No AC Output schedules yet.' : 'No charging schedules yet.'}
          </p>
        )}

        <button type="button" disabled={tasks.length >= MAX_TASKS}
          onClick={() => setEditing({ task: newTask(tab), isNew: true })}
          className="w-full h-12 rounded-l border-m border-primary text-primary text-body-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30">
          <Plus size={20} aria-hidden /> Add Schedule
        </button>

        <p className="text-label text-ink-6 px-1 pt-1">
          Schedules run on Sierro's server, so they keep working when the app is closed. Times follow this phone's time zone ({program.tz}).
        </p>
      </div>

      {editing && (
        <TaskEditor
          task={editing.task}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onDone={task => {
            update(editing.isNew ? [...tasks, task] : tasks.map(x => x.id === task.id ? task : x))
            setEditing(null)
          }}
          onDelete={() => { update(tasks.filter(x => x.id !== editing.task.id)); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TaskEditor({ task, isNew, onClose, onDone, onDelete }: {
  task: ScheduleTask
  isNew: boolean
  onClose: () => void
  onDone: (t: ScheduleTask) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<ScheduleTask>(task)
  const [pickTime, setPickTime] = useState(false)
  const actions = draft.kind === 'ac'
    ? [['on', 'Turn On'], ['off', 'Turn Off']] as const
    : [['start', 'Start Charging'], ['stop', 'Stop Charging']] as const
  return (
    <BottomSheet title={isNew ? 'Add Schedule' : 'Edit Schedule'} onClose={onClose}>
      <div className="px-4 pt-4 pb-2 space-y-4">
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Action">
          {actions.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={draft.action === value}
              onClick={() => setDraft(d => ({ ...d, action: value }))}
              className={`h-12 rounded-m text-body-md font-semibold ${draft.action === value ? 'bg-primary text-primary-darker' : 'border-s border-ink-7 text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-l bg-ink-10">
          <button type="button" onClick={() => setPickTime(p => !p)} aria-expanded={pickTime}
            className="w-full h-14 px-4 flex items-center justify-between">
            <span className="text-body-lg text-white">Time</span>
            <span className={`text-body-lg tnum ${pickTime ? 'text-primary' : 'text-white'}`}>{time12(draft.time)}</span>
          </button>
        </div>
        {pickTime && <InlineTimePicker value={draft.time} onChange={time => setDraft(d => ({ ...d, time }))} onDone={() => setPickTime(false)} />}

        <div>
          <p className="text-body-md font-semibold text-white mb-3">Repeat · {repeatLabel(draft.days)}</p>
          <DayPicker days={draft.days} onChange={days => setDraft(d => ({ ...d, days }))} />
        </div>

        <button type="button" onClick={() => onDone(draft)}
          className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg active:scale-95 transition-transform">
          Done
        </button>
        {!isNew && (
          <button type="button" onClick={onDelete}
            className="w-full h-12 rounded-m text-danger font-semibold text-body-lg active:opacity-70">
            Delete Schedule
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
