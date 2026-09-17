import { Gem } from 'lucide-react'
import BottomAction from '../../components/BottomAction'
import Icon from '../../components/Icon'

/**
 * A_2.2.1b — "You're a Founding Member".
 *
 * Sits between the name step and the add-device step, and only for an account
 * whose registered address is on the roster (src/data/foundingMembers.ts).
 * Everyone else goes straight from the name to the device, exactly as before.
 *
 * The badge is drawn rather than dropped in as a raster: the number under it
 * changes per member, so the pill has to be live text, and once the pill is
 * live the disc may as well be too — it stays crisp at any density, and it is a
 * gold ring, a gem and two sparkles. The colours are the locked `membership`
 * scale (#FFD700 and its darker #594B00), the same gold the Settings avatar
 * ring and the Founding Member tag already use, so the badge a member sees here
 * is the badge they keep.
 */
export default function FoundingMemberScreen({
  memberNumber,
  onBack,
  onContinue,
}: {
  memberNumber: number
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="h-full flex flex-col bg-ink-12">
      <div className="px-4 pb-5 safe-area-top-header flex items-center">
        <button
          onClick={onBack}
          aria-label="Back"
          className="relative w-10 h-10 rounded-full bg-ink-9 flex items-center justify-center before:absolute before:content-[''] before:-inset-1"
        >
          <Icon name="chevron-left" size={24} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-4">
        <h1 className="mt-4 text-headline-md font-semibold text-white text-center">
          You&apos;re a Founding Member
        </h1>
        <p className="mt-2 text-body-md text-ink-5 text-center">
          Thanks for supporting Sierro early on. You&apos;re Founding Member #{memberNumber},
          and your profile now carries an exclusive member ring.
        </p>

        {/* Centred in whatever the headline and the action bar leave, so the
            badge holds the middle of the frame on a short phone and a tall one
            alike rather than being pinned to one fixed offset. */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6">
          <FoundingMemberBadge />
          <span
            className="px-5 py-2 rounded-pill bg-membership text-membership-darker
              text-body-lg font-semibold whitespace-nowrap tnum"
            style={{ boxShadow: '0 0 20px 2px rgba(255, 215, 0, 0.35)' }}
          >
            Founding Member #{memberNumber}
          </span>
        </div>
      </div>

      <BottomAction label="Continue" onPress={onContinue} />
    </div>
  )
}

/**
 * The disc: a dark face inside a gold ring, lit from outside, with two sparkles
 * off the top-right corner. `overflow-visible` on the wrapper matters — the glow
 * and the sparkles both live outside the disc's own box.
 */
function FoundingMemberBadge({ size = 132 }: { size?: number }) {
  const ring = Math.max(3, Math.round(size * 0.035))
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="w-full h-full rounded-full flex items-center justify-center"
        style={{
          border: `${ring}px solid #FFD700`,
          background: 'radial-gradient(circle at 50% 30%, #3D3D3D 0%, #1C1C1C 100%)',
          boxShadow: '0 0 24px 4px rgba(255, 215, 0, 0.45)',
        }}
      >
        <Gem size={Math.round(size * 0.38)} className="text-membership" strokeWidth={1.75} />
      </div>

      {/* Four-point sparkles, the larger one nearer the disc — as drawn. */}
      <svg
        className="absolute pointer-events-none"
        style={{ left: size * 0.84, top: -size * 0.11, width: size * 0.38, height: size * 0.38 }}
        viewBox="0 0 44 44"
        fill="none"
      >
        <path
          d="M14 0c1.6 7.6 4.8 11.4 12.4 13-7.6 1.6-10.8 5.4-12.4 13-1.6-7.6-4.8-11.4-12.4-13C9.2 11.4 12.4 7.6 14 0Z"
          fill="#FFD700"
        />
        <path
          d="M32 22c1 4.8 3 7.2 7.8 8.2-4.8 1-6.8 3.4-7.8 8.2-1-4.8-3-7.2-7.8-8.2 4.8-1 6.8-3.4 7.8-8.2Z"
          fill="#FFD700"
          opacity="0.85"
        />
      </svg>
    </div>
  )
}
