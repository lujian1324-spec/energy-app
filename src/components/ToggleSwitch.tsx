import { motion } from 'framer-motion'

interface ToggleSwitchProps {
  isOn: boolean
  onToggle: () => void
  size?: 'sm' | 'md'
}

export default function ToggleSwitch({ isOn, onToggle, size = 'md' }: ToggleSwitchProps) {
  const dimensions = size === 'sm' 
 ? { width: 40, height: 22, thumb: 16 }
 : { width: 48, height: 26, thumb: 20 }

  return (
 <button
 onClick={onToggle}
 className={`
 relative rounded-full transition-all duration-300 ease-out
 ${isOn 
 ? 'bg-[#01D6BE] (1,214,190,0.45)]' 
 : 'bg-[#39393D]'
 }
 `}
 style={{
 width: dimensions.width,
 height: dimensions.height,
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
