import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { ChevronLeft, BatteryLow, Sun, ZapOff, Trash2, BellOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, type NotificationItem } from '../stores/notificationStore'

function getIcon(type: string) {
  switch (type) {
    case 'low_battery':        return <BatteryLow size={20} className="text-white" />
    case 'solar_connected':    return <Sun size={20} className="text-white" />
    case 'solar_disconnected': return <Sun size={20} className="text-white" />
    case 'power_outage':       return <ZapOff size={20} className="text-white" />
    default:                   return <ZapOff size={20} className="text-white" />
  }
}

function getTitle(type: string) {
  switch (type) {
    case 'low_battery':        return 'Low Battery'
    case 'solar_connected':    return 'Solar Connected'
    case 'solar_disconnected': return 'Solar Disconnected'
    case 'power_outage':       return 'Power Outage Detected'
    default:                   return 'Notification'
  }
}

// ── 单条通知（支持左滑删除） ──
function NotificationRow({ item, unread, onDelete }: {
  item: NotificationItem
  unread: boolean
  onDelete: () => void
}) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const REVEAL = -76 // 露出删除按钮的位移

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const shouldOpen = info.offset.x < -38 || info.velocity.x < -300
    const target = shouldOpen ? REVEAL : 0
    setOpen(shouldOpen)
    animate(x, target, { type: 'spring', stiffness: 500, damping: 40 })
  }

  return (
    <div className="relative overflow-hidden">
      {/* 删除按钮（底层） */}
      <button
        onClick={onDelete}
        aria-label="Delete"
        className="absolute right-0 top-0 bottom-0 w-[76px] bg-danger flex items-center justify-center"
      >
        <Trash2 size={20} className="text-white" />
      </button>

      {/* 通知行（可拖拽层），底部分隔线 */}
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: REVEAL, right: 0 }}
        dragElastic={0.06}
        onDragEnd={handleDragEnd}
        onClick={() => { if (open) { setOpen(false); animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 }) } }}
        className="relative bg-ink-12 px-5 py-4 cursor-grab active:cursor-grabbing
          border-b border-[rgba(255,255,255,0.08)]"
      >
        <div className="flex items-start gap-3.5">
          {/* 纯白报警图标 + 深色圆形底 */}
          <div className="w-10 h-10 rounded-full bg-[#2C2C2E] flex items-center justify-center flex-shrink-0">
            {getIcon(item.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="text-body-lg font-semibold text-white">{getTitle(item.type)}</span>
              <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                <span className="text-caption text-ink-7">{item.time}</span>
                {unread && <span className="w-2.5 h-2.5 rounded-full bg-danger" />}
              </div>
            </div>
            <div className="text-body-md text-ink-7 leading-snug">
              <span className="text-ink-6">{item.deviceName}</span>
              <span className="text-ink-7"> • {item.description}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { items, markAllRead, deleteNotification, unreadCount } = useNotificationStore()

  // 进入页面即视为查看最新通知 → 红点消失
  const wasUnread = unreadCount() > 0
  useEffect(() => { markAllRead() }, [markAllRead])

  const list = items()

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header — 返回按钮 + 居中标题 */}
      <div className="relative px-5 pt-4 pb-4 safe-area-top flex items-center justify-center">
        <button
          onClick={() => navigate(-1)}
          className="absolute left-5 w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center text-white active:scale-95 transition-transform"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-title-lg font-bold text-white">Notifications</h2>
      </div>

      {/* Content — 分隔线列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {list.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-20 h-20 rounded-full bg-[#2C2C2E] flex items-center justify-center mb-4">
              <BellOff size={32} className="text-ink-7" />
            </div>
            <p className="text-body-md text-ink-6">No notifications</p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {list.map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
              >
                <NotificationRow
                  item={item}
                  unread={wasUnread && idx === 0}
                  onDelete={() => deleteNotification(item.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
