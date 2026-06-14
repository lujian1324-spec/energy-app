import { NavLink } from 'react-router-dom'
import {
  Home,
  BarChart3,
  Settings,
} from 'lucide-react'

// PRD v1.1: 导航标签大写, 路径使用新路由
const navItems = [
  { path: '/devices', label: 'Devices', icon: Home, tabId: 'nav-devices' },
  { path: '/insights', label: 'Stats', icon: BarChart3, tabId: 'nav-insights' },
  { path: '/setting', label: 'Setting', icon: Settings, tabId: 'nav-setting' },
]

export default function BottomNavigation() {
  return (
    <div className="flex justify-center items-end pb-6 pt-2 bg-transparent pointer-events-none safe-area-bottom">
      <nav
        className="flex items-center gap-1 px-2 py-2 rounded-full bg-[#0E3F3A] pointer-events-auto shadow-lg"
        role="navigation"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              id={item.tabId}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex items-center justify-center min-w-[48px] min-h-[48px] px-4 py-2 rounded-full transition-all duration-200
                ${isActive ? 'bg-[#01D6BE]' : 'bg-transparent hover:bg-[#01D6BE]/15'}`
              }
            >
              {({ isActive }) => (
                <span
                  className={`flex items-center gap-2 transition-colors duration-200 ${
                    isActive ? 'text-[#FFFFFF]' : 'text-[#01D6BE]/70'
                  }`}
                >
                  <Icon size={22} aria-hidden="true" />
                  {isActive && (
                    <span className="text-label font-bold tracking-wider uppercase">
                      {item.label}
                    </span>
                  )}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
