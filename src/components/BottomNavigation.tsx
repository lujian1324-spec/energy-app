import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { hapticLight } from '../utils/haptics'

const navItems = [
  { path: '/devices', label: 'Devices', icon: 'home', tabId: 'nav-devices' },
  { path: '/insights', label: 'Insights', icon: 'insight', tabId: 'nav-insights' },
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
      {/* Handoff `Bottom` → `Tab_new`: 192x64 pill, primary-darker fill, 0.5px primary
          hairline, 4px padding, 8px gap, 56px slots, 48px selected circle in
          primary dark:hover (#018072), 24px glyphs. */}
      <nav
        className="flex items-center gap-2 p-1 rounded-full bg-primary-darker border-xs border-primary pointer-events-auto"
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
            className="flex items-center justify-center w-14 h-14 shrink-0 rounded-full"
          >
            {({ isActive }) => (
              isActive ? (
                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary-dark-hover transition-colors duration-200">
                  <Icon name={item.icon} size={24} alt={item.label} color="#B0F2EB" />
                </span>
              ) : (
                <Icon
                  name={item.icon}
                  size={24}
                  className="transition-colors duration-200"
                  alt={item.label}
                  color="#018072"
                />
              )
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
