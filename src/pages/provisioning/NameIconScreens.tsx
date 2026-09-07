/**
 * Name + icon steps for BLE provisioning — `A_1.3.3_Device Name -v Default` and
 * `A_1.3.4_Display Icon -v Default`. Both frames share a head, measured off the
 * 4x exports at 402x874:
 *
 *   header     back button only, no title
 *   headline   headline_medium semibold, centred, cap on y155
 *   subtitle   body_medium ink-5, centred, one line
 *   action     full-width 44 button under a hairline, at the bottom edge
 *
 * A_1.3.3 then places the shared field at y229; A_1.3.4 places eight unlabelled
 * 60x61 tiles in a 4-column grid from y252, 16 apart across and 15 down.
 */
import Icon from '../../components/Icon'
import TextField from '../../components/TextField'
import { DEVICE_NAME_MAX } from '../../data/deviceModels'

/** The eight glyphs `A_1.3.4` offers, in the frame's order. */
export const DEVICE_ICONS: { id: string; pack: string; label: string }[] = [
  { id: 'power', pack: 'thunder', label: 'Power Station' },
  { id: 'fridge', pack: 'fridge', label: 'Refrigerator' },
  { id: 'server', pack: 'NAS', label: 'Server' },
  { id: 'lamp', pack: 'lamp', label: 'Lamp' },
  { id: 'fish', pack: 'fish tank', label: 'Aquarium' },
  { id: 'plug', pack: 'power strip', label: 'Power strip' },
  { id: 'router', pack: 'router', label: 'Router' },
  { id: 'cpap', pack: 'CPAP', label: 'CPAP' },
]

function StepHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="px-4 pb-5 safe-area-top-header flex items-center">
      <button
        onClick={onBack}
        aria-label="Back"
        className="w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center active:scale-95 transition-transform"
      >
        <Icon name="chevron-left" size={24} />
      </button>
    </div>
  )
}

function StepAction({
  label, onPress, disabled,
}: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <div
      className="border-t border-ink-9 px-4 pt-3"
      style={{ paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px)) + 16px)' }}
    >
      <button
        onClick={onPress}
        disabled={disabled}
        className="w-full h-11 rounded-m bg-primary text-primary-darker text-body-lg font-semibold
          disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-[transform,opacity]"
      >
        {label}
      </button>
    </div>
  )
}

export function NameDeviceScreen({
  deviceNameInput, setDeviceNameInput, nameError, setNameError, onBack, onNext,
}: {
  deviceNameInput: string
  setDeviceNameInput: (v: string) => void
  nameError: string
  setNameError: (v: string) => void
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-12 flex flex-col">
      <StepHeader onBack={onBack} />

      <div className="flex-1 min-h-0 px-4">
        <h1 className="mt-[15px] text-headline-md font-semibold text-white text-center">
          Name Your Device
        </h1>
        <p className="mt-2 text-body-md text-ink-5 text-center">
          Choose a name to help identify this device in the app.
        </p>

        <div className="mt-[26px]">
          <TextField
            ariaLabel="Device name"
            value={deviceNameInput}
            onChange={(next) => { setDeviceNameInput(next); setNameError('') }}
            onClear={() => setDeviceNameInput('')}
            onEnter={() => { if (deviceNameInput.trim()) onNext() }}
            placeholder="Enter device name"
            error={nameError || null}
            maxLength={DEVICE_NAME_MAX}
            autoFocus
          />
        </div>
      </div>

      <StepAction label="Next" onPress={onNext} disabled={!deviceNameInput.trim()} />
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
      <StepHeader onBack={onBack} />

      <div className="flex-1 min-h-0 overflow-y-auto">
        <h1 className="mt-[15px] px-4 text-headline-md font-semibold text-white text-center">
          Choose an Icon
        </h1>
        <p className="mt-2 px-4 text-body-md text-ink-5 text-center">
          Select an icon that best represents this device.
        </p>

        <div className="mt-[49px] grid grid-cols-4 gap-x-4 gap-y-[15px] px-[57px]">
          {DEVICE_ICONS.map(({ id, pack, label }) => {
            const active = selectedIcon === id
            return (
              <button
                key={id}
                aria-label={label}
                aria-pressed={active}
                onClick={() => setSelectedIcon(id)}
                className={`h-[61px] rounded-l flex items-center justify-center transition-colors active:scale-95
                  ${active ? 'bg-primary-darker' : 'bg-ink-9'}`}
              >
                <Icon name={pack} size={28} />
              </button>
            )
          })}
        </div>
      </div>

      <StepAction label="Finish" onPress={onNext} />
    </div>
  )
}
