import { NavLink } from 'react-router-dom'
import { 
  Monitor, 
  Home, 
  Zap, 
  BarChart3, 
  User 
} from 'lucide-react'

const navItems = [
  { path: '/devices', label: 'DEVICES', icon: Monitor },
  { path: '/', label: 'HOME', icon: Home },
  { path: '/control', label: 'CONTROL', icon: Zap },
  { path: '/stats', label: 'STATS', icon: BarChart3 },
  { path: '/settings', label: 'SETTINGS', icon: User },
]

export default function BottomNavigation() {
  return (
    <nav 
      className="flex justify-around items-center py-2 pb-6 px-2 
                 bg-[#0A1220]/95 backdrop-blur-xl 
                 border-t border-[rgba(0,212,255,0.08)]
                 safe-area-bottom"
    >
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex flex-col items-center gap-1 
              px-4 py-1.5 rounded-[14px]
              transition-all duration-250 ease-out
              relative
              ${isActive 
                ? 'bg-[rgba(0,212,255,0.08)]' 
                : 'hover:bg-[rgba(255,255,255,0.02)]'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <Icon 
                  size={20} 
                  className={`transition-colors duration-250 ${isActive ? 'text-[#00D4FF]' : 'text-[#3D5A78]'}`}
                />
                <span 
                  className={`text-[10px] font-medium tracking-wide transition-colors duration-250 ${isActive ? 'text-[#00D4FF]' : 'text-[#3D5A78]'}`}
                >
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
                                w-1 h-1 rounded-full bg-[#00D4FF] 
                                shadow-[0_0_8px_#00D4FF]" />
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
