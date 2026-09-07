import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from './Icon'
import { hapticLight } from '../utils/haptics'

const navItems = [
  { path: '/devices', label: 'Devices', icon: 'home', tabId: 'nav-devices' },
  { path: '/insights', label: 'Insights', icon: 'insight', tabId: 'nav-insights' },
  { path: '/setting', label: 'Setting', icon: 'setting', tabId: 'nav-setting' },
]

export default function BottomNavigation() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLElement>(null)

  // `A_1.1.1 -v Toast` rests the toast 16 above this bar. Publish where its bottom
  // edge goes while the bar is on screen; the toast falls back to the screen edge
  // when the variable is gone.
  useEffect(() => {
    const wrap = wrapRef.current
    const pill = pillRef.current
    if (!wrap || !pill) return
    const publish = () => {
      const top = pill.getBoundingClientRect().top
      document.documentElement.style.setProperty('--toast-bottom', `${Math.round(window.innerHeight - top + 16)}px`)
    }
    publish()
    // The wrapper's padding carries the safe-area inset, so watch it rather than the
    // pill: a change to the inset moves the bar without resizing the pill itself. It
    // has to be the border box — a padding change leaves the content box alone.
    const ro = new ResizeObserver(publish)
    ro.observe(wrap, { box: 'border-box' })
    window.addEventListener('resize', publish)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
      document.documentElement.style.removeProperty('--toast-bottom')
    }
  }, [])

  return (
    <div
      ref={wrapRef}
      className="relative z-10 flex justify-center items-end pt-2 bg-transparent pointer-events-none"
      // Sit just above the system gesture/nav bar. env() is a sibling in max() so a
      // SET --safe-area-inset-bottom of 0px cannot hide the iOS inset. +4px breathing room.
      style={{ paddingBottom: 'calc(max(8px, var(--safe-area-inset-bottom, 0px), env(safe-area-inset-bottom, 0px)) + 4px)' }}
    >
      {/* 0907 deck, 底部導覽列 新樣式 1: bar ink-10 with an ink-9 hairline, 4px
          padding, 8px gap, 56px slots, a 48px selected disc in primary with the
          glyph knocked out in primary-darker, and ink-7 for the rest. */}
      <nav
        ref={pillRef}
        className="flex items-center gap-2 p-1 rounded-full bg-ink-10 border-xs border-ink-9 pointer-events-auto"
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
                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-primary transition-colors duration-200">
                  <Icon name={item.icon} size={24} alt={item.label} color="#004B43" />
                </span>
              ) : (
                <Icon
                  name={item.icon}
                  size={24}
                  className="transition-colors duration-200"
                  alt={item.label}
                  color="#8C8C8C"
                />
              )
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
