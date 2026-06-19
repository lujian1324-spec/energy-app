import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { ArrowLeft, Battery, WifiOff, Trash2, BellOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore, type NotificationItem } from '../stores/notificationStore'

const dateOrder = ['Today', 'Yesterday', 'April', 'March', 'May']

function getIcon(type: string) {
  if (type === 'low_battery') return <Battery size={18} className="text-warning" />
  return <WifiOff size={18} className="text-danger" />
}

function getTitle(type: string) {
  return type === 'low_battery' ? 'Low Battery' : 'Power Outage Detected'
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
    <div className="relative overflow-hidden rounded-l">
      {/* 删除按钮（底层） */}
      <button
        onClick={onDelete}
        aria-label="Delete"
        className="absolute right-0 top-0 bottom-0 w-[76px] bg-danger flex items-center justify-center rounded-r-l"
      >
        <Trash2 size={20} className="text-ink-1" />
      </button>

      {/* 通知卡片（可拖拽层） */}
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: REVEAL, right: 0 }}
        dragElastic={0.06}
        onDragEnd={handleDragEnd}
        onClick={() => { if (open) { setOpen(false); animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 }) } }}
        className="relative bg-ink-10 rounded-l p-4 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-l bg-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
            {getIcon(item.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5 gap-2">
              <span className="text-body-md font-semibold text-ink-1 truncate">{getTitle(item.type)}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-tiny text-ink-6">{item.time}</span>
                {unread && <span className="w-2 h-2 rounded-full bg-danger" />}
              </div>
            </div>
            <div className="text-caption text-ink-6 truncate">{item.deviceName}</div>
            <div className="text-label text-ink-7 mt-1 line-clamp-2">{item.description}</div>
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
  const grouped = list.reduce<Record<string, NotificationItem[]>>((acc, n) => {
    (acc[n.date] ??= []).push(n)
    return acc
  }, {})

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 safe-area-top flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-ink-10 flex items-center justify-center text-ink-1"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-title-lg font-bold text-ink-1">Notifications</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {list.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="w-20 h-20 rounded-l bg-ink-10 flex items-center justify-center mb-4">
              <BellOff size={32} className="text-ink-7" />
            </div>
            <p className="text-body-md text-ink-6">No notifications</p>
          </motion.div>
        ) : (
          dateOrder.filter(d => grouped[d]).map(date => (
            <div key={date} className="mb-5">
              <div className="text-caption font-bold text-ink-6 tracking-widest uppercase mb-2 px-1">{date}</div>
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {grouped[date].map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <NotificationRow
                        item={item}
                        unread={wasUnread && date === 'Today'}
                        onDelete={() => deleteNotification(item.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
