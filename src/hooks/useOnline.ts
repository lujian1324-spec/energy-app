import { useEffect, useRef, useState } from 'react'
import { readClientOnline } from '../utils/deviceConnectivity'

/**
 * Whether the phone has a network right now (APP-20260923-002).
 *
 * With Bluetooth, Wi-Fi and mobile data all off the Device pages kept saying
 * "Connected" and let the user flip the AC switch into a request that could
 * never leave the phone. This is the phone's side only: no network here says
 * nothing about the device, which may be online in the cloud all along — the
 * pages show "No internet" and lock their controls, they do not mark the device
 * offline.
 *
 * `onReconnect` fires when the network comes back, so a page can re-read the
 * device instead of showing whatever it last had.
 */
export function useOnline(onReconnect?: () => void): boolean {
  const [online, setOnline] = useState(readClientOnline)
  const reconnectRef = useRef(onReconnect)
  reconnectRef.current = onReconnect

  useEffect(() => {
    const up = () => { setOnline(true); reconnectRef.current?.() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    // The state may have changed between the first render and this effect.
    setOnline(readClientOnline())
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
