import { NavLink } from 'react-router-dom'
import { 
  Home, 
  BarChart3, 
  Settings,
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'Devices', icon: Home },
  { path: '/stats', label: 'Stats', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
]

export default function BottomNavigation() {
  return (
    <nav 
      className="flex justify-around items-center py-2 pb-6 px-2 
      bg-[#000000]/95 backdrop-blur-xl 
      border-t border-[rgba(255,255,255,0.07)]
      safe-area-bottom"
    >
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `
              flex flex-col items-center gap-1 
              px-6 py-1.5 rounded-[14px]
              transition-all duration-250 ease-out
              relative
              ${isActive 
                ? 'bg-[rgba(13,148,136,0.1)]' 
                : 'hover:bg-[rgba(255,255,255,0.03)]'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <Icon 
                  size={22} 
                  className={`transition-colors duration-250 ${isActive ? 'text-[#0D9488]' : 'text-[#48484A]'}`}
                />
                <span className={`text-[10px] font-medium ${isActive ? 'text-[#0D9488]' : 'text-[#48484A]'}`}>
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
                    w-1 h-1 rounded-full bg-[#0D9488]" />
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
