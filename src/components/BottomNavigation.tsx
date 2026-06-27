import { NavLink } from 'react-router-dom'
import Icon from './Icon'

const navItems = [
  { path: '/devices', label: 'Devices', icon: 'home', tabId: 'nav-devices' },
  { path: '/insights', label: 'Stats', icon: 'insight', tabId: 'nav-insights' },
  { path: '/setting', label: 'Setting', icon: 'setting', tabId: 'nav-setting' },
]

export default function BottomNavigation() {
  return (
    <div
      className="flex justify-center items-end pt-2 bg-transparent pointer-events-none"
      // 不预留 iOS Home 指示条的安全区，直接贴近底端（仅留少量间距）
      style={{ paddingBottom: '4px' }}
    >
      <nav
        className="flex items-center gap-1 px-2 py-2 rounded-full bg-[#0E3F3A] pointer-events-auto shadow-lg"
        role="navigation"
        aria-label="Main navigation"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={item.tabId}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex items-center justify-center min-w-[48px] min-h-[48px] px-4 py-2 rounded-full transition-colors duration-200
              ${isActive ? 'bg-primary' : 'bg-transparent hover:bg-primary/15'}`
            }
          >
            {({ isActive }) => (
              <Icon
                name={item.icon}
                size={22}
                className={`transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-50'}`}
                alt={item.label}
              />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
