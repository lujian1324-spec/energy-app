import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { hapticLight } from '../utils/haptics'

const navItems = [
  { path: '/devices', label: 'Devices', icon: 'home', tabId: 'nav-devices' },
  { path: '/insights', label: 'Stats', icon: 'insight', tabId: 'nav-insights' },
  { path: '/setting', label: 'Setting', icon: 'setting', tabId: 'nav-setting' },
]

export default function BottomNavigation() {
  return (
    <div
      className="relative z-10 flex justify-center items-end pt-2 bg-transparent pointer-events-none"
      // Sit just above the system gesture/nav bar. env() is a sibling in max() so a
      // SET --safe-area-inset-bottom of 0px cannot hide the iOS inset. +4px breathing room.
      style={{ paddingBottom: 'calc(max(8px, var(--safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)) + 4px)' }}
    >
      <nav
        className="flex items-center gap-1 px-2 py-2 rounded-full bg-ink-11 pointer-events-auto shadow-lg"
        role="navigation"
        aria-label="Main navigation"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            id={item.tabId}
            aria-label={item.label}
            onClick={() => hapticLight()}
            className={({ isActive }) =>
              `flex items-center justify-center w-12 h-12 shrink-0 rounded-full transition-colors duration-200
              ${isActive ? 'bg-primary' : 'bg-transparent hover:bg-white/10'}`
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
