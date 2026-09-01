/**
 * Name + icon steps for BLE provisioning.
 */
import { ChevronLeft, X, Zap, Refrigerator, Lamp, Car, Plug, Fan, BedDouble, Server } from 'lucide-react'
import { SIERRO_MODEL_LIST, type SierroModel } from '../../data/deviceModels'

// Device icon choices (Figma "Choose an Icon")
const DEVICE_ICONS = [
  { id: 'power', Icon: Zap },
  { id: 'fridge', Icon: Refrigerator },
  { id: 'server', Icon: Server as typeof Zap },
  { id: 'lamp', Icon: Lamp },
  { id: 'car', Icon: Car },
  { id: 'plug', Icon: Plug },
  { id: 'fan', Icon: Fan },
  { id: 'bed', Icon: BedDouble },
] as const


export function NameDeviceScreen({
  deviceNameInput, setDeviceNameInput, nameError, setNameError,
  selectedModel, setSelectedModel, onBack, onNext,
}: {
  deviceNameInput: string
  setDeviceNameInput: (v: string) => void
  nameError: string
  setNameError: (v: string) => void
  selectedModel: SierroModel
  setSelectedModel: (m: SierroModel) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
        <button
          onClick={onBack}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
      </div>

      <div className="flex-1 px-6 pt-6">
        <h1 className="text-headline-lg font-bold text-white mb-2">Name Your Device</h1>
        <p className="text-body-md text-ink-6 mb-8">
          Give your device a name so you can easily identify it.
        </p>

        <div className={`bg-ink-10 rounded-l px-4 py-4 flex items-center gap-3 mb-2
          ${nameError ? 'border border-danger' : ''}`}
        >
          <input
            type="text"
            value={deviceNameInput}
            onChange={(e) => { setDeviceNameInput(e.target.value); setNameError('') }}
            placeholder="Device name"
            autoFocus
            className="flex-1 bg-transparent text-body-lg text-white placeholder:text-ink-7 outline-none caret-primary"
          />
          {deviceNameInput.length > 0 && (
            <button onClick={() => setDeviceNameInput('')}>
              <X size={16} className="text-ink-7" />
            </button>
          )}
        </div>

        {nameError && (
          <p className="text-danger text-body-md mt-1">{nameError}</p>
        )}

        <p className="text-caption font-bold text-ink-6 tracking-widest uppercase mt-8 mb-3">Device Model</p>
        <div className="grid grid-cols-2 gap-3">
          {SIERRO_MODEL_LIST.map(spec => {
            const active = selectedModel === spec.model
            return (
              <button
                key={spec.model}
                onClick={() => setSelectedModel(spec.model)}
                className={`text-left rounded-l px-4 py-3 border active:scale-[0.98] transition-[border-color,background-color,transform]
                  ${active ? 'border-primary bg-primary/[0.10]' : 'border-white/[0.10] bg-ink-10'}`}
              >
                <div className={`text-body-lg font-semibold ${active ? 'text-primary' : 'text-white'}`}>{spec.model}</div>
                <div className="text-caption text-ink-6 mt-0.5">{spec.ratedPower}W · {(spec.ratedCapacityWh/1000).toFixed(1)}kWh</div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-6 pb-10 safe-area-bottom">
        <button
          onClick={onNext}
          disabled={!deviceNameInput.trim()}
          className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
            disabled:bg-primary-dark disabled:text-black/[0.4] transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export function ChooseIconScreen({
  selectedIcon, setSelectedIcon, onBack, onNext,
}: {
  selectedIcon: string
  setSelectedIcon: (id: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 safe-area-top">
        <button
          onClick={onBack}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-10 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
      </div>

      <div className="flex-1 px-6 pt-6">
        <h1 className="text-headline-lg font-bold text-white mb-2 text-center">Choose an Icon</h1>
        <p className="text-body-md text-ink-6 mb-8 text-center">
          Select an icon that best represents this device.
        </p>

        <div className="grid grid-cols-4 gap-3">
          {DEVICE_ICONS.map(({ id, Icon }) => {
            const active = selectedIcon === id
            return (
              <button
                key={id}
                onClick={() => setSelectedIcon(id)}
                className={`aspect-square rounded-l flex items-center justify-center transition-[transform,background-color,border-color] active:scale-95
                  ${active ? 'bg-primary text-ink-13' : 'bg-ink-10 text-ink-4'}`}
              >
                <Icon size={26} />
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-6 pb-10 safe-area-bottom">
        <button
          onClick={onNext}
          className="w-full h-14 rounded-full bg-primary text-black text-body-lg font-semibold
            disabled:bg-primary-dark disabled:text-black/[0.4] transition-colors"
        >
          Finish
        </button>
      </div>
    </div>
  )
}
