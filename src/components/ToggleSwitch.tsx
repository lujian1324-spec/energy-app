import { motion } from 'framer-motion'
import { hapticLight } from '../utils/haptics'

interface ToggleSwitchProps {
  isOn: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  disabled?: boolean
  /** When false, skip the built-in light haptic (caller provides its own). */
  haptic?: boolean
}

// Figma / Device Card PowerToggle: track 50x28, thumb 24, 2px inset — On #01D6BE; Off #8C8C8C; Disabled 30%.
// Do not set minHeight larger than the track: that stretched the hit box and left the thumb optically high.
export default function ToggleSwitch({
  isOn,
  onToggle,
  size = 'md',
  ariaLabel,
  disabled = false,
  haptic = true,
}: ToggleSwitchProps) {
  const dimensions = size === 'sm'
    ? { width: 44, height: 26, thumb: 20 }
    : { width: 50, height: 28, thumb: 24 }
  const inset = 2

  return (
    <button
      onClick={() => { if (haptic) hapticLight(); onToggle() }}
      disabled={disabled}
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      className={`
        relative rounded-full transition-colors duration-300 ease-out flex-shrink-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink-12
        ${isOn
          ? 'bg-primary'
          : 'bg-ink-7'
        }
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        width: dimensions.width,
        height: dimensions.height,
      }}
    >
      <motion.div
        className="absolute rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
        style={{
          width: dimensions.thumb,
          height: dimensions.thumb,
          top: inset,
        }}
        animate={{
          left: isOn ? dimensions.width - dimensions.thumb - inset : inset,
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </button>
  )
}
