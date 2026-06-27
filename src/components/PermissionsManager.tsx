/**
 * Permissions status + tester for the Settings page.
 *
 * Shows the live state of every permission and lets the user:
 *   • Test all   — re-run check() for each permission without prompting
 *   • Request    — trigger the system prompt for a single permission
 *   • Open Settings — deep-link to the OS settings when blocked
 */
import { useEffect, useState, useCallback } from 'react'
import { HardDrive, Wifi, RefreshCw, Loader2, CheckCircle2, XCircle, CircleDashed, MinusCircle } from 'lucide-react'
import Icon from './Icon'
import {
  PERMISSION_DEFS,
  type PermissionId,
  type PermissionResult,
  type PermissionState,
} from '../utils/permissions'
import { openAppSettings } from '../utils/openAppSettings'

const ICONS: Record<PermissionId, { name?: string; Lucide?: React.FC<{ size?: number; className?: string }> }> = {
  storage: { Lucide: HardDrive },
  notifications: { name: 'bell' },
  camera: { name: 'scan' },
  bluetooth: { name: 'bluetooth' },
  wifi: { Lucide: Wifi },
}

function PermIcon({ id, size = 16 }: { id: PermissionId; size?: number }) {
  const cfg = ICONS[id]
  if (cfg.name) return <Icon name={cfg.name} size={size} />
  if (cfg.Lucide) return <cfg.Lucide size={size} className="text-primary" />
  return null
}

function StateBadge({ state }: { state?: PermissionState }) {
  switch (state) {
    case 'granted':
      return <span className="flex items-center gap-1 text-label font-semibold text-success"><CheckCircle2 size={14} /> Granted</span>
    case 'denied':
      return <span className="flex items-center gap-1 text-label font-semibold text-danger"><XCircle size={14} /> Denied</span>
    case 'unsupported':
      return <span className="flex items-center gap-1 text-label font-semibold text-ink-7"><MinusCircle size={14} /> N/A</span>
    default:
      return <span className="flex items-center gap-1 text-label font-semibold text-warning"><CircleDashed size={14} /> Ask</span>
  }
}

export default function PermissionsManager() {
  const [results, setResults] = useState<Record<string, PermissionResult>>({})
  const [busy, setBusy] = useState<PermissionId | 'all' | null>(null)

  const testAll = useCallback(async () => {
    setBusy('all')
    const next: Record<string, PermissionResult> = {}
    for (const def of PERMISSION_DEFS) {
      next[def.id] = await def.check()
    }
    setResults(next)
    setBusy(null)
  }, [])

  useEffect(() => { testAll() }, [testAll])

  const requestOne = async (id: PermissionId) => {
    const def = PERMISSION_DEFS.find(d => d.id === id)
    if (!def) return
    setBusy(id)
    const res = await def.request()
    setResults(prev => ({ ...prev, [id]: res }))
    setBusy(null)
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-title-md font-semibold text-ink-1">Permissions</h3>
        <button
          onClick={testAll}
          disabled={busy !== null}
          className="flex items-center gap-1.5 text-label font-semibold text-primary active:opacity-70 disabled:opacity-40"
        >
          {busy === 'all'
            ? <Loader2 size={14} className="animate-spin" />
            : <RefreshCw size={14} />}
          Test all
        </button>
      </div>

      <div className="space-y-3">
        {PERMISSION_DEFS.map(({ id, title, description }) => {
          const res = results[id]
          const blocked = res?.state === 'denied'
          const askable = res?.state === 'prompt' || res?.state === 'granted'
          return (
            <div key={id} className="bg-ink-10 rounded-l px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
                  <PermIcon id={id} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-lg font-semibold text-ink-1">{title}</div>
                  <div className="text-body-md text-ink-6 mt-0.5 leading-snug">{description}</div>
                </div>
                <StateBadge state={res?.state} />
              </div>

              {/* Detail + action row */}
              <div className="flex items-center justify-between gap-2 mt-2.5 pl-12">
                <span className="text-caption text-ink-7 truncate">
                  {busy === id ? 'Working…' : (res?.detail ?? '—')}
                </span>
                {res?.state !== 'unsupported' && (
                  blocked ? (
                    <button
                      onClick={() => openAppSettings()}
                      className="flex-shrink-0 text-label font-semibold text-primary active:opacity-70"
                    >
                      Open Settings
                    </button>
                  ) : askable ? (
                    <button
                      onClick={() => requestOne(id)}
                      disabled={busy !== null}
                      className="flex-shrink-0 text-label font-semibold text-primary active:opacity-70 disabled:opacity-40"
                    >
                      {res?.state === 'granted' ? 'Re-test' : 'Allow'}
                    </button>
                  ) : null
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
