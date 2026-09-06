import EmptyState from '../../components/EmptyState'

/**
 * Device list empty state (Handoff `A_1.1.1_Homepage -v Empty State`).
 *
 * Illustration is 4.7.52's `ds-device-empty.svg` (JPEG-in-SVG, which is what
 * renders correctly on iOS). Geometry lives in `components/EmptyState` so
 * Home / Insights / Notifications stay in step.
 */
export default function DeviceEmptyState({
  error,
  onRetry,
  onAddDevice,
}: {
  error: string | null
  onRetry: () => void
  onAddDevice: () => void
}) {
  const art = `${import.meta.env.BASE_URL}ds-device-empty.svg`
  if (error) {
    return (
      <EmptyState
        art={art}
        title="Something went wrong"
        subtitle="Check your network connection and try again."
        action={{ label: 'Retry', onClick: onRetry }}
      />
    )
  }
  return (
    <EmptyState
      art={art}
      title="Ready to get started?"
      subtitle="Add your first Sierro device to protect essential devices and stay prepared for outages."
      action={{ label: 'Add Device', icon: 'add', onClick: onAddDevice }}
    />
  )
}
