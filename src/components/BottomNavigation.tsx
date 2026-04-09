import { NavLink } from 'react-router-dom'
import { 
  Monitor, 
  Home, 
  BarChart3, 
  User 
} from 'lucide-react'

const navItems = [
  { path: '/devices', label: 'DEVICES', icon: Monitor },
  { path: '/', label: 'HOME', icon: Home },
  { path: '/stats', label: 'STATS', icon: BarChart3 },
  { path: '/settings', label: 'SETTINGS', icon: User },
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
 className={({ isActive }) => `
 flex flex-col items-center gap-1 
 px-4 py-1.5 rounded-[14px]
 transition-all duration-250 ease-out
 relative
 ${isActive 
 ? 'bg-[rgba(1,214,190,0.1)]' 
 : 'hover:bg-[rgba(255,255,255,0.03)]'
 }
 `}
 >
 {({ isActive }) => (
 <>
                <Icon 
                  size={22} 
                  className={`transition-colors duration-250 ${isActive ? 'text-[#01D6BE]' : 'text-[#48484A]'}`}
                />
                {isActive && (
 <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 
 w-1 h-1 rounded-full bg-[#01D6BE] 
 #01D6BE]" />
 )}
 </>
 )}
 </NavLink>
 )
 })}
 </nav>
  )
}
