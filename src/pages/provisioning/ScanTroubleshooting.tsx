export default function ScanTroubleshooting({ failures, onScanQr }: { failures: number; onScanQr: () => void }) {
  if (failures < 2) return null
  return (
    <section aria-label="Device discovery troubleshooting" className="mt-4 mb-4 w-full shrink-0 rounded-l bg-ink-10 p-4 text-left">
      <h3 className="text-body-md font-semibold text-ink-2">Still can't find your device?</h3>
      <ol className="mt-2 list-decimal pl-5 space-y-2 text-label text-ink-4">
        <li>Power on the device. If needed, power it off, wait 10 seconds, then power it on again.</li>
        <li>Make sure the device's LED shows pairing mode.</li>
        <li>Turn on Bluetooth and allow Nearby devices permission. On older Android phones, also turn on Location.</li>
        <li>Move your phone closer to the device, then tap Search Again.</li>
        <li>If your device has a QR code, scan it to continue.</li>
      </ol>
      <button onClick={onScanQr} className="mt-2 min-h-10 text-primary text-label font-semibold active:scale-[0.96] transition-transform">
        Scan QR Code
      </button>
    </section>
  )
}
