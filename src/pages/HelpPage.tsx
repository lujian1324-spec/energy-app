import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { SecondaryHeader } from '../components/PageHeader'
import Icon from '../components/Icon'
import { useDeviceStore } from '../stores/deviceStore'

/**
 * SW-07 — minimal Help / 功能说明.
 *
 * Reached from Settings → Support (next to Feedback); a secondary page, so no
 * bottom nav and back goes to wherever it was opened from (Settings).
 *
 * COPY GATE (AC-07-7 / AC-07-8): every *new* user-visible string on this page is
 * the literal `PENDING_COPY` placeholder. Only titles that already ship
 * elsewhere in the app ("Sleep Mode", "Smart Schedule") are real text. Do not
 * write Help / 功能说明 prose here — Jason owns the EN/ZH wording, and the
 * `data-help-section` hooks below are what the structure is checked against.
 */
const PENDING_COPY = '[PENDING_JASON]'

/** What each placeholder body has to end up saying, for whoever fills them in:
 *  - bind:  how to add/bind a device — the Add Device flow on the devices list.
 *  - sleep: where Sleep Mode lives — a device's Device Info page.
 *  - smart: what Smart Schedule does and where to set it up.
 */
type HelpSectionId = 'bind' | 'sleep' | 'smart'

function HelpSection({
  id,
  icon,
  title,
  body,
  action,
  delay,
}: {
  id: HelpSectionId
  icon: string
  title: string
  body: string
  action?: { label: string; onClick: () => void }
  delay: number
}) {
  return (
    <motion.section
      data-help-section={id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-ink-10 rounded-l p-4 mb-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-ink-9 flex items-center justify-center flex-shrink-0">
          <Icon name={icon} size={24} />
        </div>
        <h2 className="text-body-lg font-semibold text-ink-2 min-w-0">{title}</h2>
      </div>
      <p className="text-body-md text-ink-4 mt-3">{body}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 min-h-12 w-full rounded-m bg-ink-9 px-4 text-body-md font-semibold text-primary active:scale-[0.99] transition-transform"
        >
          {action.label}
        </button>
      )}
    </motion.section>
  )
}

export default function HelpPage() {
  const navigate = useNavigate()
  const devices = useDeviceStore(s => s.devices)

  // Sleep Mode has no route of its own — it lives on a device's Device Info
  // page, so the deep link needs a device. With no devices there is nothing to
  // link to; the section drops its button and stays readable (AC-07-5).
  const firstDeviceId = devices.length > 0 ? String(devices[0].id) : null

  return (
    <div className="h-full flex flex-col bg-ink-12 overflow-hidden">
      <SecondaryHeader title={PENDING_COPY} onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-24">
        {/* Bind / add a device — the add flow is a modal on DevicePage, not a
            route of its own, so the deep link can only go as far as /devices. */}
        <HelpSection
          id="bind"
          icon="add"
          title={PENDING_COPY}
          body={PENDING_COPY}
          action={{ label: PENDING_COPY, onClick: () => navigate('/devices') }}
          delay={0.05}
        />

        <HelpSection
          id="sleep"
          icon="moon"
          title="Sleep Mode"
          body={PENDING_COPY}
          action={
            firstDeviceId
              ? {
                  label: PENDING_COPY,
                  onClick: () => navigate(`/device/${firstDeviceId}/settings`),
                }
              : undefined
          }
          delay={0.1}
        />

        <HelpSection
          id="smart"
          icon="thunder"
          title="Smart Schedule"
          body={PENDING_COPY}
          action={{ label: PENDING_COPY, onClick: () => navigate('/smart-schedule') }}
          delay={0.15}
        />
      </div>
    </div>
  )
}
