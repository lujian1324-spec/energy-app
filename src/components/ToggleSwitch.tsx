import { motion } from 'framer-motion'
import { hapticLight } from '../utils/haptics'

interface ToggleSwitchProps {
  isOn: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
  ariaLabel?: string
  disabled?: boolean
}

// PRD v1.1 §9.2: Toggle 触控热区 52×32dp (Material 3 规范)
export default function ToggleSwitch({
  isOn,
  onToggle,
  size = 'md',
  ariaLabel,
  disabled = false,
}: ToggleSwitchProps) {
  const dimensions = size === 'sm'
    ? { width: 52, height: 30, thumb: 24 }
    : { width: 52, height: 32, thumb: 26 }

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
          : 'bg-[#39393D]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        minWidth: 52,
        minHeight: 32,
      }}
    >
      <motion.div
        className="absolute top-[3px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
        style={{
          width: dimensions.thumb,
          height: dimensions.thumb,
        }}
        animate={{
          left: isOn ? `calc(100% - ${dimensions.thumb + 3}px)` : '3px'
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </button>
  )
}
