import { motion } from 'framer-motion'
import { hapticLight } from '../utils/haptics'

interface ToggleSwitchProps {
  isOn: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  disabled?: boolean
}

// Figma: track ~50x28 (outer hot-zone 54x32), thumb 24; On #01D6BE; Off #8C8C8C; Disabled 30%
export default function ToggleSwitch({
  isOn,
  onToggle,
  size = 'md',
  ariaLabel,
  disabled = false,
}: ToggleSwitchProps) {
  const dimensions = size === 'sm'
    ? { width: 44, height: 26, thumb: 20 }
    : { width: 50, height: 28, thumb: 24 }

  return (
    <button
      onClick={() => { hapticLight(); onToggle() }}
      disabled={disabled}
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      className={`
        relative rounded-full transition-colors duration-300 ease-out
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
        minWidth: 54,
        minHeight: 32,
      }}
    >
      <motion.div
        className="absolute top-[2px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
        style={{
          width: dimensions.thumb,
          height: dimensions.thumb,
        }}
        animate={{
          left: isOn ? `calc(100% - ${dimensions.thumb + 2}px)` : '2px'
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </button>
  )
}
