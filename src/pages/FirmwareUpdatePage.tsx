/**
 * Firmware Update (`/firmware-update`, v4.20.0) — opened from Settings, under Feedback.
 *
 * Checks every device for newer firmware (versions differ → update offered),
 * shows what the release adds and fixes, and after the user confirms, runs the
 * update while the rest of the app stays silent (utils/firmwareLock). The update
 * keeps running and the lock holds if the user leaves this screen; coming back
 * shows its progress. Gated by FIRMWARE_UPDATE_ENABLED.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertTriangle, Cpu } from 'lucide-react'
import { SecondaryHeader } from '../components/PageHeader'
import BottomSheet from '../components/BottomSheet'
import { useDeviceStore } from '../stores/deviceStore'
import { useFirmwareUpdateStore, type DeviceFirmwareCheck } from '../stores/firmwareUpdateStore'

const STATE_LABEL: Record<DeviceFirmwareCheck['state'], string> = {
  'checking': 'Checking…',
  'up-to-date': 'Up to date',
  'update-available': 'Update available',
  'unavailable': 'No firmware available',
  'offline': 'Device offline',
  'not-allowed': 'Updates not available',
  'error': "Couldn't check",
}

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function formatDate(ms?: number): string | null {
  return ms ? new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null
}

/** The release notes block: what this update adds and fixes. */
function ReleaseNotes({ notes }: { notes: string }) {
  return (
    <div className="rounded-l bg-ink-10 px-4 py-4">
      <p className="text-body-md font-semibold text-white mb-2">What's new</p>
      <p className="text-body-md text-ink-5 whitespace-pre-line" data-testid="fw-notes">
        {notes || 'Improvements and fixes.'}
      </p>
    </div>
  )
}

export default function FirmwareUpdatePage() {
  const navigate = useNavigate()
  const devices = useDeviceStore(s => s.devices)
  const { checks, checking, run, checkAll, start, dismiss } = useFirmwareUpdateStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const busy = run.phase === 'starting' || run.phase === 'running'

  useEffect(() => {
    if (!busy && devices.length) void checkAll(devices.map(d => ({ id: d.id, name: d.name })))
    // Check once per visit; "Check again" re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.length])

  const open = checks.find(c => c.deviceId === openId) ?? null

  // ── An update is running (or just ended): the progress / result screen ──
  if (run.phase !== 'idle' && run.session) {
    const s = run.session
    const done = run.phase === 'success' || run.phase === 'failed' || run.phase === 'unknown'
    return (
      <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
        <SecondaryHeader title="Firmware Update" onBack={() => navigate(-1)} />
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-4">
          <div className="rounded-l bg-ink-10 px-4 py-5 text-center" role="status" aria-live="polite">
            {run.phase === 'success' ? (
              <CheckCircle2 size={40} className="mx-auto text-success" aria-hidden />
            ) : done ? (
              <AlertTriangle size={40} className="mx-auto text-warning" aria-hidden />
            ) : (
              <Loader2 size={40} className="mx-auto text-primary animate-spin" aria-hidden />
            )}
            <p className="mt-3 text-title-md font-semibold text-white" data-testid="fw-run-title">
              {run.phase === 'success' ? 'Firmware updated'
                : run.phase === 'failed' ? 'Update failed'
                : run.phase === 'unknown' ? 'Update status unknown'
                : 'Updating firmware…'}
            </p>
            <p className="mt-1 text-body-md text-ink-5">{s.deviceName} · {s.version}</p>
            {!done && (
              <>
                <div className="mt-4 h-1.5 rounded-pill bg-ink-9 overflow-hidden">
                  <div
                    className={`h-full bg-primary rounded-pill ${run.percent == null ? 'w-1/3 animate-pulse' : ''}`}
                    style={run.percent != null ? { width: `${run.percent}%` } : undefined}
                  />
                </div>
                {run.percent != null && <p className="mt-2 text-label text-ink-5">{Math.round(run.percent)}%</p>}
                <p className="mt-3 text-label text-ink-5">
                  Keep the device on and connected to Wi-Fi. Everything else in the app is paused until the update finishes.
                </p>
              </>
            )}
            {run.phase === 'failed' && (
              <p className="mt-3 text-label text-ink-5">{run.message ?? 'The device did not finish the update. It keeps its current firmware. Try again later.'}</p>
            )}
            {run.phase === 'unknown' && (
              <p className="mt-3 text-label text-ink-5">The update did not report back in time. Check the device, then check for updates again.</p>
            )}
          </div>
          <ReleaseNotes notes={s.notes} />
          {done && (
            <button
              onClick={() => { dismiss(); void checkAll(devices.map(d => ({ id: d.id, name: d.name }))) }}
              className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg active:scale-95 transition-transform"
            >
              Done
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── The device list ──
  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title="Firmware Update" onBack={() => navigate(-1)} />
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 space-y-3">
        {devices.length === 0 && (
          <p className="text-body-md text-ink-5 text-center pt-10">Add a device to check its firmware.</p>
        )}
        {checks.map(c => {
          const actionable = c.state === 'update-available'
          return (
            <button
              key={c.deviceId}
              onClick={() => actionable && setOpenId(c.deviceId)}
              disabled={!actionable}
              className="w-full min-h-[68px] rounded-l bg-ink-10 px-4 py-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:active:scale-100"
              data-testid={`fw-row-${c.deviceId}`}
            >
              <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
                <Cpu size={18} className="text-white" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-lg text-white truncate">{c.name}</p>
                <p className="text-label text-ink-5 truncate">
                  Current: {c.currentVersion || 'Unknown'}
                  {c.latest && c.state !== 'up-to-date' ? ` · Latest: ${c.latest.version}` : ''}
                </p>
              </div>
              <span className={`text-label font-semibold flex-shrink-0 ${actionable ? 'text-primary' : 'text-ink-6'}`}>
                {c.state === 'checking' ? <Loader2 size={16} className="animate-spin" aria-label="Checking" /> : STATE_LABEL[c.state]}
              </span>
            </button>
          )
        })}
        {devices.length > 0 && (
          <button
            onClick={() => void checkAll(devices.map(d => ({ id: d.id, name: d.name })))}
            disabled={checking}
            className="w-full h-12 rounded-m border-s border-ink-7 text-body-md font-semibold text-ink-3 disabled:opacity-50 active:scale-95 transition-transform"
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
        )}
      </div>

      {open?.latest && (
        <BottomSheet title="Firmware Update" onClose={() => { setOpenId(null); setConfirming(false) }}>
          <div className="px-4 pt-4 pb-2 space-y-3">
            <div className="rounded-l bg-ink-10 px-4 py-3 space-y-1">
              <p className="text-body-lg text-white">{open.name}</p>
              <p className="text-label text-ink-5">Current: {open.currentVersion || 'Unknown'}</p>
              <p className="text-label text-ink-5">
                New: {open.latest.version}
                {[formatDate(open.latest.createdAt), formatSize(open.latest.sizeBytes)].filter(Boolean).map(t => ` · ${t}`).join('')}
              </p>
            </div>
            <ReleaseNotes notes={open.latest.notes} />
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="w-full h-12 rounded-m bg-primary text-primary-darker font-semibold text-body-lg active:scale-95 transition-transform"
              >
                Update Firmware
              </button>
            ) : (
              <div className="rounded-l bg-ink-10 px-4 py-4">
                <p className="text-body-md text-white">
                  Keep {open.name} on and connected to Wi-Fi until the update finishes. The app pauses all other data while it updates.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 h-11 rounded-m border-s border-ink-4 text-body-lg font-semibold text-ink-4 active:scale-95 transition-transform"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { const id = open.deviceId; setOpenId(null); setConfirming(false); void start(id) }}
                    className="flex-1 h-11 rounded-m bg-primary text-body-lg font-semibold text-primary-darker active:scale-95 transition-transform"
                  >
                    Start Update
                  </button>
                </div>
              </div>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
