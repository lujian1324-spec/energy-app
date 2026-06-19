import { motion } from 'framer-motion'
import { ArrowLeft, Battery, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { demoNotifications, type DemoNotification } from '../data/demoData'

type NotificationItem = DemoNotification

const notifications: NotificationItem[] = demoNotifications

export default function NotificationsPage() {
  const navigate = useNavigate()

  // Group by date
  const grouped = notifications.reduce<Record<string, NotificationItem[]>>((acc, n) => {
    if (!acc[n.date]) acc[n.date] = []
    acc[n.date].push(n)
    return acc
  }, {})

  const dateOrder = ['Today', 'Yesterday', 'April', 'March', 'May']

  const getIcon = (type: string) => {
    if (type === 'low_battery') return <Battery size={18} className="text-[#FF9500]" />
    return <WifiOff size={18} className="text-[#FF3B30]" />
  }

  const getTitle = (type: string) => {
    if (type === 'low_battery') return 'Low Battery'
    return 'Power Outage Detected'
  }

  return (
    <div className="h-full flex flex-col bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-[#262626] flex items-center justify-center text-[#FFFFFF]"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-[#FFFFFF]">Notifications</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {dateOrder.filter(d => grouped[d]).map(date => (
          <div key={date} className="mb-5">
            <div className="text-[11px] font-bold text-[#BFBFBF] tracking-widest uppercase mb-2 px-1">
              {date}
            </div>
            <div className="flex flex-col gap-2">
              {grouped[date].map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="bg-[#262626] rounded-l p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-l bg-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                      {getIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-body-md font-semibold text-[#FFFFFF]">
                          {getTitle(item.type)}
                        </span>
                        <span className="text-[10px] text-[#BFBFBF] flex-shrink-0 ml-2">{item.time}</span>
                      </div>
                      <div className="text-[11px] text-[#BFBFBF]">{item.deviceName}</div>
                      <div className="text-[12px] text-[#8C8C8C] mt-1">{item.description}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
