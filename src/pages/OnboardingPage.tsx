import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Zap,
  User,
  Bluetooth,
  QrCode,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  X,
  Battery,
  Snowflake,
  Wind,
  Sun,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../components/Toast'

/**
 * PRD v1.1 §4.7.3: Onboarding 引导流程
 *
 * 步骤：
 *  1. Welcome - 品牌介绍
 *  2. Profile - 输入姓名
 *  3. Add Device - 引导添加第一台设备（BLE 或 QR）
 *  4. Done - 完成
 *
 * 触发条件：authStore.needsOnboarding === true（首次登录）
 */
export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, completeOnboarding } = useAuthStore()

  const [step, setStep] = useState(0)
  const initialName: string =
    (typeof user?.account === 'string' ? user.account.split('@')[0] : '') ?? ''
  const [name, setName] = useState<string>(initialName)
  const [addingMethod, setAddingMethod] = useState<'ble' | 'qr' | null>(null)
  const [skipDevice, setSkipDevice] = useState(false)

  // 若用户已经完成 onboarding，直接跳走
  useEffect(() => {
    if (user?.onboardingCompleted) {
      navigate('/devices', { replace: true })
    }
  }, [user?.onboardingCompleted, navigate])

  const totalSteps = 4
  const isLast = step === totalSteps - 1

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      toast.error('Name required', 'Please tell us your name')
      return
    }
    if (step < totalSteps - 1) {
      setStep(s => s + 1)
    } else {
      // 完成
      completeOnboarding({ name: name.trim() })
      toast.success('Welcome!', 'Your account is ready')
      navigate('/devices', { replace: true })
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(s => s - 1)
  }

  const handleSkip = () => {
    completeOnboarding({})
    navigate('/devices', { replace: true })
  }

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Progress bar */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={handleBack}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF] active:scale-95 transition-transform"
          disabled={step === 0}
          aria-label="Back"
          style={step === 0 ? { opacity: 0.3 } : {}}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full transition-all"
              style={{
                backgroundColor: i <= step ? '#01D6BE' : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>
        <button
          onClick={handleSkip}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#A0A0A5] active:scale-95 transition-transform"
          aria-label="Skip onboarding"
        >
          <X size={16} />
        </button>
      </div>

      {/* Step counter */}
      <div className="px-5 pb-2">
        <p className="text-caption text-[#A0A0A5]">Step {step + 1} of {totalSteps}</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-32"
        >
          {step === 0 && <Step0Welcome />}
          {step === 1 && <Step1Profile name={name} setName={setName} />}
          {step === 2 && <Step2AddDevice addingMethod={addingMethod} setAddingMethod={setAddingMethod} skipDevice={skipDevice} setSkipDevice={setSkipDevice} />}
          {step === 3 && <Step3Done name={name} />}
        </motion.div>
      </AnimatePresence>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-3 bg-gradient-to-t from-[#141414] via-[#141414] to-transparent">
        <button
          onClick={handleNext}
          className="w-full h-12 rounded-l bg-[#01D6BE] text-[#000000] text-body-md font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {isLast ? (<><Check size={18} /> Get Started</>) : (<>Continue <ArrowRight size={18} /></>)}
        </button>
      </div>
    </div>
  )
}

function Step0Welcome() {
  return (
    <div className="flex flex-col items-center text-center pt-6">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 15 }}
        className="w-24 h-24 rounded-[32px] bg-[rgba(1,214,190,0.12)] border border-[rgba(1,214,190,0.3)] flex items-center justify-center mb-6"
      >
        <Zap size={48} className="text-[#01D6BE]" />
      </motion.div>
      <h1 className="text-[28px] font-bold text-[#FFFFFF] mb-3">Welcome to Sierro</h1>
      <p className="text-body-md text-[#A0A0A5] max-w-[280px] leading-relaxed mb-8">
        Smart energy management for your home battery, solar, and devices. Let&apos;s get you set up in a few quick steps.
      </p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-[320px]">
        <FeatureCard icon={Battery} label="Monitor" desc="Real-time battery & solar" color="#34C759" />
        <FeatureCard icon={Sun} label="Optimize" desc="Smart charge schedules" color="#FF9500" />
        <FeatureCard icon={Zap} label="Save" desc="Peak shaving & TOU rates" color="#01D6BE" />
        <FeatureCard icon={Sparkles} label="Insights" desc="Track carbon & savings" color="#A855F7" />
      </div>
    </div>
  )
}

function Step1Profile({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div className="pt-6">
      <h2 className="text-[22px] font-bold text-[#FFFFFF] mb-2">What should we call you?</h2>
      <p className="text-[13px] text-[#A0A0A5] mb-6 leading-relaxed">
        Your name will appear on your device dashboard and in shared energy reports.
      </p>
      <div className="bg-[#262626] rounded-[20px] p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[rgba(1,214,190,0.12)] flex items-center justify-center">
            <User size={18} className="text-[#01D6BE]" />
          </div>
          <div>
            <div className="text-label font-semibold text-[#FFFFFF]">Display Name</div>
            <div className="text-xs text-[#A0A0A5]">2-20 characters</div>
          </div>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          placeholder="e.g. Alex"
          className="w-full px-4 py-3 rounded-l bg-[#141414] border border-[rgba(1,214,190,0.15)] text-[#FFFFFF] text-[15px] placeholder:text-[#636366] focus:outline-none focus:border-[#01D6BE] transition-colors"
        />
        <p className="text-xs text-[#636366] mt-2 text-right">{name.length}/20</p>
      </div>
    </div>
  )
}

function Step2AddDevice({
  addingMethod, setAddingMethod, skipDevice, setSkipDevice,
}: {
  addingMethod: 'ble' | 'qr' | null
  setAddingMethod: (m: 'ble' | 'qr' | null) => void
  skipDevice: boolean
  setSkipDevice: (s: boolean) => void
}) {
  return (
    <div className="pt-6">
      <h2 className="text-[22px] font-bold text-[#FFFFFF] mb-2">Add your first device</h2>
      <p className="text-[13px] text-[#A0A0A5] mb-6 leading-relaxed">
        Pair a Sierro power station or compatible smart device to start monitoring.
      </p>

      <div className="space-y-3 mb-5">
        <button
          onClick={() => { setAddingMethod('ble'); setSkipDevice(false) }}
          className={`w-full flex items-center gap-4 p-4 rounded-l border-2 transition-all text-left ${
            addingMethod === 'ble'
              ? 'bg-[rgba(1,214,190,0.12)] border-[#01D6BE]'
              : 'bg-[#262626] border-transparent hover:border-[rgba(1,214,190,0.3)]'
          }`}
        >
          <div className="w-12 h-12 rounded-l bg-[rgba(1,214,190,0.15)] flex items-center justify-center flex-shrink-0">
            <Bluetooth size={22} className="text-[#01D6BE]" />
          </div>
          <div className="flex-1">
            <div className="text-body-md font-semibold text-[#FFFFFF]">Bluetooth Pairing</div>
            <div className="text-caption text-[#A0A0A5] mt-0.5">Recommended · Fastest setup</div>
          </div>
          {addingMethod === 'ble' && <Check size={18} className="text-[#01D6BE]" />}
        </button>

        <button
          onClick={() => { setAddingMethod('qr'); setSkipDevice(false) }}
          className={`w-full flex items-center gap-4 p-4 rounded-l border-2 transition-all text-left ${
            addingMethod === 'qr'
              ? 'bg-[rgba(1,214,190,0.12)] border-[#01D6BE]'
              : 'bg-[#262626] border-transparent hover:border-[rgba(1,214,190,0.3)]'
          }`}
        >
          <div className="w-12 h-12 rounded-l bg-[rgba(255,149,0,0.15)] flex items-center justify-center flex-shrink-0">
            <QrCode size={22} className="text-[#FF9500]" />
          </div>
          <div className="flex-1">
            <div className="text-body-md font-semibold text-[#FFFFFF]">Scan QR Code</div>
            <div className="text-caption text-[#A0A0A5] mt-0.5">Use the code on the device label</div>
          </div>
          {addingMethod === 'qr' && <Check size={18} className="text-[#01D6BE]" />}
        </button>

        <button
          onClick={() => { setSkipDevice(true); setAddingMethod(null) }}
          className={`w-full flex items-center gap-4 p-4 rounded-l border-2 transition-all text-left ${
            skipDevice
              ? 'bg-[rgba(168,85,247,0.08)] border-[#A855F7]'
              : 'bg-[#262626] border-transparent hover:border-[rgba(168,85,247,0.3)]'
          }`}
        >
          <div className="w-12 h-12 rounded-l bg-[rgba(168,85,247,0.15)] flex items-center justify-center flex-shrink-0">
            <ArrowRight size={22} className="text-[#A855F7]" />
          </div>
          <div className="flex-1">
            <div className="text-body-md font-semibold text-[#FFFFFF]">Skip for now</div>
            <div className="text-caption text-[#A0A0A5] mt-0.5">Add devices later from Devices tab</div>
          </div>
          {skipDevice && <Check size={18} className="text-[#A855F7]" />}
        </button>
      </div>

      {addingMethod && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[rgba(1,214,190,0.06)] border border-[rgba(1,214,190,0.2)] rounded-l p-4"
        >
          <p className="text-label text-[#01D6BE] mb-2 font-semibold">
            {addingMethod === 'ble' ? 'Bluetooth pairing' : 'QR scanning'} is ready
          </p>
          <p className="text-caption text-[#A0A0A5] leading-relaxed">
            {addingMethod === 'ble'
              ? 'You can start pairing your device from the Devices tab once setup is complete.'
              : 'Open the camera and point it at the device QR code on the next screen.'}
          </p>
        </motion.div>
      )}

      {/* Sample device preview */}
      <div className="mt-6">
        <p className="text-xs text-[#A0A0A5] uppercase tracking-widest font-bold mb-2 px-1">Compatible Devices</p>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {[
            { icon: Battery, label: 'Sierro 1000', color: '#01D6BE' },
            { icon: Snowflake, label: 'Fridge', color: '#5AC8FA' },
            { icon: Wind, label: 'CPAP', color: '#AF52DE' },
            { icon: Sun, label: 'Solar', color: '#FF9500' },
          ].map(d => {
            const Icon = d.icon
            return (
              <div key={d.label} className="flex-shrink-0 w-20 bg-[#262626] rounded-l p-3 text-center">
                <Icon size={22} style={{ color: d.color }} className="mx-auto mb-1" />
                <div className="text-xs text-[#A0A0A5]">{d.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Step3Done({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center text-center pt-12">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12, delay: 0.1 }}
        className="w-28 h-28 rounded-full bg-[rgba(52,199,89,0.15)] flex items-center justify-center mb-6 relative"
      >
        <Check size={56} className="text-[#34C759]" strokeWidth={3} />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute inset-0 rounded-full border-2 border-[#34C759]"
        />
      </motion.div>
      <h2 className="text-headline-md font-bold text-[#FFFFFF] mb-3">You&apos;re all set{name ? `, ${name}` : ''}!</h2>
      <p className="text-body-md text-[#A0A0A5] max-w-[300px] leading-relaxed mb-6">
        Your Sierro app is ready. Head to the Devices tab to start monitoring your power and solar.
      </p>
      <div className="bg-[#262626] rounded-[20px] p-4 w-full max-w-[320px]">
        <div className="flex items-center gap-3 text-left">
          <Sparkles size={18} className="text-[#FFD700] flex-shrink-0" />
          <div>
            <div className="text-label font-semibold text-[#FFFFFF]">Pro tip</div>
            <div className="text-caption text-[#A0A0A5] mt-0.5 leading-relaxed">
              Connect to Wi-Fi to enable cloud sync and remote monitoring.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, label, desc, color }: { icon: typeof Zap; label: string; desc: string; color: string }) {
  return (
    <div className="bg-[#262626] rounded-l p-3 text-left">
      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-2" style={{ backgroundColor: `${color}1A` }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="text-label font-semibold text-[#FFFFFF]">{label}</div>
      <div className="text-xs text-[#A0A0A5] mt-0.5 leading-tight">{desc}</div>
    </div>
  )
}
