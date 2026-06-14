import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Bell, Zap, WifiOff, Sun, Mail } from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'

/**
 * PRD v1.1 §4.5.4: Push Notifications 子页
 * - Power Outage on/off
 * - Low Battery on/off + 阈值 10/20/30%
 * - Solar Status on/off
 * - Quiet Hours (Do Not Disturb)
 */
export default function NotificationsPage() {
  const navigate = useNavigate()
  const { settings, updateSettings } = usePowerStationStore()

  const [pushOutage, setPushOutage] = useState(settings.pushNotifications ?? true)
  const [pushLowBattery, setPushLowBattery] = useState(settings.pushNotifications ?? true)
  const [lowBatteryThreshold, setLowBatteryThreshold] = useState(settings.lowBatteryThreshold ?? 30)
  const [pushSolarStatus, setPushSolarStatus] = useState(settings.pushSolarStatus ?? false)
  const [quietEnabled, setQuietEnabled] = useState(settings.doNotDisturb ?? false)
  const [quietStart, setQuietStart] = useState(settings.doNotDisturbStart ?? '22:00')
  const [quietEnd, setQuietEnd] = useState(settings.doNotDisturbEnd ?? '07:00')
  const [emailNotif, setEmailNotif] = useState(true)

  const persist = (key: string, val: unknown) => {
    updateSettings({ [key]: val } as Record<string, unknown>)
  }

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-[#FFFFFF]">Push Notifications</h2>
          <p className="text-caption text-[#A0A0A5]">Manage alerts and quiet hours</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[rgba(1,214,190,0.12)] flex items-center justify-center">
          <Bell size={18} className="text-[#01D6BE]" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-6">
        {/* Power Outage */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#262626] rounded-[20px] overflow-hidden mb-4"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(255,59,48,0.12)] flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-[#FF3B30]" />
            </div>
            <div className="flex-1">
              <div className="text-body-md font-semibold text-[#FFFFFF]">Power Outage</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">Alert when the grid power is lost</div>
            </div>
            <ToggleSwitch
              isOn={pushOutage}
              onToggle={() => {
                setPushOutage(!pushOutage)
                persist('pushNotifications', !pushOutage)
              }}
              size="sm"
            />
          </div>
        </motion.div>

        {/* Low Battery + Threshold */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[#262626] rounded-[20px] overflow-hidden mb-4"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(255,149,0,0.12)] flex items-center justify-center flex-shrink-0">
              <WifiOff size={18} className="text-[#FF9500]" />
            </div>
            <div className="flex-1">
              <div className="text-body-md font-semibold text-[#FFFFFF]">Low Battery</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">
                {pushLowBattery
                  ? `Alert when below ${lowBatteryThreshold}%`
                  : 'Disabled'}
              </div>
            </div>
            <ToggleSwitch
              isOn={pushLowBattery}
              onToggle={() => {
                setPushLowBattery(!pushLowBattery)
                persist('pushNotifications', !pushLowBattery)
              }}
              size="sm"
            />
          </div>

          <AnimatePresence>
            {pushLowBattery && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-2 border-t border-[rgba(255,149,0,0.1)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-caption text-[#A0A0A5]">Alert Threshold</span>
                    <span className="text-[13px] font-semibold text-[#FF9500]">{lowBatteryThreshold}%</span>
                  </div>
                  <div className="relative">
                    <input
                      type="range"
                      min="10"
                      max="30"
                      step="10"
                      value={lowBatteryThreshold}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        setLowBatteryThreshold(val)
                        persist('lowBatteryThreshold', val)
                      }}
                      className="w-full h-1.5 bg-[#333333] rounded-full appearance-none cursor-pointer accent-[#FF9500]"
                      style={{
                        background: `linear-gradient(to right, #FF9500 0%, #FF9500 ${((lowBatteryThreshold - 10) / 20) * 100}%, #333333 ${((lowBatteryThreshold - 10) / 20) * 100}%, #333333 100%)`,
                      }}
                      aria-label="Low battery alert threshold"
                    />
                    <div className="flex justify-between px-0.5 mt-2">
                      {[10, 20, 30].map((val) => (
                        <button
                          key={val}
                          onClick={() => {
                            setLowBatteryThreshold(val)
                            persist('lowBatteryThreshold', val)
                          }}
                          className={`text-xs transition-colors px-2 py-0.5 rounded ${
                            lowBatteryThreshold === val
                              ? 'text-[#FF9500] font-semibold bg-[rgba(255,149,0,0.1)]'
                              : 'text-[#636366]'
                          }`}
                          aria-label={`Set threshold to ${val} percent`}
                          aria-pressed={lowBatteryThreshold === val}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Solar Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[#262626] rounded-[20px] overflow-hidden mb-4"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(1,214,190,0.12)] flex items-center justify-center flex-shrink-0">
              <Sun size={18} className="text-[#01D6BE]" />
            </div>
            <div className="flex-1">
              <div className="text-body-md font-semibold text-[#FFFFFF]">Solar Status</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">Notify when solar generation changes</div>
            </div>
            <ToggleSwitch
              isOn={pushSolarStatus}
              onToggle={() => {
                setPushSolarStatus(!pushSolarStatus)
                persist('pushSolarStatus', !pushSolarStatus)
              }}
              size="sm"
            />
          </div>
        </motion.div>

        {/* Quiet Hours */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[#262626] rounded-[20px] overflow-hidden mb-4"
        >
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
            <div className="w-10 h-10 rounded-xl bg-[rgba(168,85,247,0.12)] flex items-center justify-center flex-shrink-0">
              <Bell size={18} className="text-[#A855F7]" />
            </div>
            <div className="flex-1">
              <div className="text-body-md font-semibold text-[#FFFFFF]">Quiet Hours</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">
                {quietEnabled ? `${quietStart} – ${quietEnd}` : 'Disable all sounds'}
              </div>
            </div>
            <ToggleSwitch
              isOn={quietEnabled}
              onToggle={() => {
                setQuietEnabled(!quietEnabled)
                persist('doNotDisturb', !quietEnabled)
              }}
              size="sm"
            />
          </div>

          <AnimatePresence>
            {quietEnabled && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-2 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-[#A0A0A5] mb-1">From</div>
                    <input
                      type="time"
                      value={quietStart}
                      onChange={(e) => {
                        setQuietStart(e.target.value)
                        persist('doNotDisturbStart', e.target.value)
                      }}
                      className="w-full px-3 py-2 rounded-[10px] bg-[#141414] border border-[rgba(168,85,247,0.2)] text-[#FFFFFF] text-[13px] focus:outline-none focus:border-[#A855F7]"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-[#A0A0A5] mb-1">To</div>
                    <input
                      type="time"
                      value={quietEnd}
                      onChange={(e) => {
                        setQuietEnd(e.target.value)
                        persist('doNotDisturbEnd', e.target.value)
                      }}
                      className="w-full px-3 py-2 rounded-[10px] bg-[#141414] border border-[rgba(168,85,247,0.2)] text-[#FFFFFF] text-[13px] focus:outline-none focus:border-[#A855F7]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Email digest */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[#262626] rounded-[20px] overflow-hidden mb-4"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(1,214,190,0.12)] flex items-center justify-center flex-shrink-0">
              <Mail size={18} className="text-[#01D6BE]" />
            </div>
            <div className="flex-1">
              <div className="text-body-md font-semibold text-[#FFFFFF]">Email Digest</div>
              <div className="text-caption text-[#A0A0A5] mt-0.5">Weekly summary of energy usage</div>
            </div>
            <ToggleSwitch
              isOn={emailNotif}
              onToggle={() => setEmailNotif(!emailNotif)}
              size="sm"
            />
          </div>
        </motion.div>

        <p className="text-caption text-[#636366] text-center px-4 leading-relaxed">
          Critical alerts (e.g. fire, hardware fault) will always notify you regardless of quiet hours.
        </p>
      </div>
    </div>
  )
}
