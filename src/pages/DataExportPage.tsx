import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  Download,
  FileJson,
  FileText,
  Shield,
  Trash2,
  RotateCcw,
  Check,
  Info,
} from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'
import { useAuthStore } from '../stores/authStore'
import { useDeviceStore } from '../stores/deviceStore'
import { toast } from '../components/Toast'

/**
 * PRD v1.1 §8.3: Data Sovereignty - 数据主权页
 * - 数据导出 JSON / CSV
 * - 30 天回收站
 * - 隐私声明
 */
export default function DataExportPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = usePowerStationStore()
  const { user } = useAuthStore()
  const { devices, historyData, alarms } = useDeviceStore()

  const [exportLoading, setExportLoading] = useState<'json' | 'csv' | null>(null)
  const [privacyAck, setPrivacyAck] = useState(settings.privacyAcknowledged ?? false)

  // 导出为 JSON
  const handleExportJson = async () => {
    setExportLoading('json')
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: '1.1.0',
        user: user ? { account: user.account, userId: user.userId } : null,
        devices: devices.map(d => ({
          id: d.id,
          name: d.name,
          model: d.model,
          serialNumber: d.serialNumber,
          stationName: d.stationName,
          isOnline: d.isOnline,
          installedAt: d.installedAt,
        })),
        historyData: historyData ?? null,
        alarms: alarms.slice(0, 100),
        settings,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sierro-data-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export complete', 'JSON file downloaded')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown')
    } finally {
      setExportLoading(null)
    }
  }

  // 导出为 CSV
  const handleExportCsv = async () => {
    setExportLoading('csv')
    try {
      const rows: string[] = ['timestamp,device_id,device_name,key,value']
      if (historyData) {
        const allKeys = Object.keys(historyData)
        for (const key of allKeys) {
          const points = historyData[key] ?? []
          for (const pt of points) {
            rows.push(`${pt.time},${devices[0]?.id ?? ''},${devices[0]?.name ?? ''},${key},${pt.value}`)
          }
        }
      } else {
        rows.push(`${new Date().toISOString()},,,,no_history_data`)
      }
      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sierro-history-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export complete', 'CSV file downloaded')
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unknown')
    } finally {
      setExportLoading(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-ink-13 overflow-hidden">
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1 active:scale-95"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-ink-1">Privacy & Data</h2>
          <p className="text-caption text-ink-6">Export and manage your data</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[rgba(1,214,190,0.12)] flex items-center justify-center">
          <Shield size={18} className="text-primary" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
        {/* Privacy notice */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[rgba(1,214,190,0.06)] border border-[rgba(1,214,190,0.2)] rounded-[20px] p-4 mb-4"
        >
          <div className="flex items-start gap-3">
            <Info size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[13px] font-semibold text-ink-1 mb-1">Your data, your control</h3>
              <p className="text-caption text-ink-6 leading-relaxed">
                Sierro stores your energy data locally on this device and on our secure cloud.
                You can export or delete it at any time.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Export section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4"
        >
          <div className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-3 px-1">
            Export Data
          </div>
          <div className="space-y-2.5">
            <button
              onClick={handleExportJson}
              disabled={!!exportLoading}
              className="w-full flex items-center gap-3.5 p-4 bg-ink-10 rounded-l active:scale-[0.99] transition-transform disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-l bg-[rgba(1,214,190,0.12)] flex items-center justify-center flex-shrink-0">
                <FileJson size={20} className="text-primary" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-body-md font-semibold text-ink-1">Export as JSON</div>
                <div className="text-caption text-ink-6 mt-0.5">Full snapshot: devices, history, settings</div>
              </div>
              {exportLoading === 'json' ? (
                <RotateCcw size={18} className="text-primary animate-spin" />
              ) : (
                <Download size={18} className="text-ink-6" />
              )}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!!exportLoading}
              className="w-full flex items-center gap-3.5 p-4 bg-ink-10 rounded-l active:scale-[0.99] transition-transform disabled:opacity-50"
            >
              <div className="w-11 h-11 rounded-l bg-[rgba(255,149,0,0.12)] flex items-center justify-center flex-shrink-0">
                <FileText size={20} className="text-warning" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-body-md font-semibold text-ink-1">Export as CSV</div>
                <div className="text-caption text-ink-6 mt-0.5">Time-series history data for analysis</div>
              </div>
              {exportLoading === 'csv' ? (
                <RotateCcw size={18} className="text-warning animate-spin" />
              ) : (
                <Download size={18} className="text-ink-6" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Recycle bin */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-ink-10 rounded-[20px] overflow-hidden mb-4"
        >
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-l bg-[rgba(168,85,247,0.12)] flex items-center justify-center">
                  <RotateCcw size={18} className="text-[#A855F7]" />
                </div>
                <div>
                  <div className="text-body-md font-semibold text-ink-1">Recycle Bin</div>
                  <div className="text-caption text-ink-6 mt-0.5">Deleted data kept for 30 days</div>
                </div>
              </div>
              <span className="text-caption px-2 py-0.5 rounded-full bg-[rgba(168,85,247,0.15)] text-[#A855F7] font-semibold">
                Empty
              </span>
            </div>
          </div>
        </motion.div>

        {/* Privacy preferences */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-ink-10 rounded-[20px] overflow-hidden mb-4"
        >
          <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
            <span className="text-caption font-bold text-ink-6 tracking-widest uppercase">
              Privacy Preferences
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-9 h-9 rounded-l bg-[rgba(52,199,89,0.1)] flex items-center justify-center flex-shrink-0">
              <Check size={16} className="text-success" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-ink-1">Anonymous Analytics</div>
              <div className="text-caption text-ink-6 mt-0.5">Help improve Sierro (no personal data)</div>
            </div>
            <ToggleSwitch
              isOn={privacyAck}
              onToggle={() => {
                const next = !privacyAck
                setPrivacyAck(next)
                updateSettings({ privacyAcknowledged: next })
              }}
              size="sm"
            />
          </div>
        </motion.div>

        {/* Legal links */}
        <div className="text-center py-2 text-caption">
          <div className="flex items-center justify-center gap-3 mb-2">
            <button onClick={() => navigate('/privacy')} className="text-ink-6 hover:text-ink-1 transition-colors">
              Privacy Policy
            </button>
            <span className="text-ink-7">|</span>
            <button onClick={() => navigate('/terms')} className="text-ink-6 hover:text-ink-1 transition-colors">
              Terms of Use
            </button>
          </div>
          <p className="text-ink-7">Sierro Inc. · Data Protection Officer: privacy@sierro.com</p>
        </div>
      </div>
    </div>
  )
}
