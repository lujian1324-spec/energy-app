/**
 * A real place for the power station the app creates.
 *
 * The vendor's own add-device form makes address, timezone, city, area, address
 * detail and install time required, and it picks the coordinates off a map. This
 * app has no address step, and was creating stations at latitude 0, longitude 0
 * with no city, area or address at all — which is the difference between an
 * account that can add a device and one that cannot. An account whose station
 * was created by the vendor's app can then add devices here perfectly well.
 *
 * So the station is placed from the one piece of location the device will tell
 * us without a permission prompt: its IANA time zone. That is not the user's
 * street, and it is not meant to be — it is a real, plausible, editable
 * location, which is what the backend wants and what 0,0 is not. Station
 * details can be corrected later through /station/update.
 */

export interface StationPlace {
  country: string
  city: string
  area: string
  address: string
  latitude: number
  longitude: number
  timezone: string
}

/** City centres for the zones this app is actually used in. */
const ZONES: Record<string, { country: string; city: string; lat: number; lng: number }> = {
  'Asia/Shanghai':        { country: 'CN', city: 'Shanghai',      lat: 31.2304, lng: 121.4737 },
  'Asia/Chongqing':       { country: 'CN', city: 'Chongqing',     lat: 29.5630, lng: 106.5516 },
  'Asia/Hong_Kong':       { country: 'HK', city: 'Hong Kong',     lat: 22.3193, lng: 114.1694 },
  'Asia/Taipei':          { country: 'TW', city: 'Taipei',        lat: 25.0330, lng: 121.5654 },
  'Asia/Singapore':       { country: 'SG', city: 'Singapore',     lat: 1.3521,  lng: 103.8198 },
  'Asia/Tokyo':           { country: 'JP', city: 'Tokyo',         lat: 35.6762, lng: 139.6503 },
  'Asia/Seoul':           { country: 'KR', city: 'Seoul',         lat: 37.5665, lng: 126.9780 },
  'Australia/Sydney':     { country: 'AU', city: 'Sydney',        lat: -33.8688, lng: 151.2093 },
  'Europe/London':        { country: 'GB', city: 'London',        lat: 51.5074, lng: -0.1278 },
  'Europe/Berlin':        { country: 'DE', city: 'Berlin',        lat: 52.5200, lng: 13.4050 },
  'Europe/Paris':         { country: 'FR', city: 'Paris',         lat: 48.8566, lng: 2.3522 },
  'Europe/Madrid':        { country: 'ES', city: 'Madrid',        lat: 40.4168, lng: -3.7038 },
  'Europe/Amsterdam':     { country: 'NL', city: 'Amsterdam',     lat: 52.3676, lng: 4.9041 },
  'America/New_York':     { country: 'US', city: 'New York',      lat: 40.7128, lng: -74.0060 },
  'America/Chicago':      { country: 'US', city: 'Chicago',       lat: 41.8781, lng: -87.6298 },
  'America/Denver':       { country: 'US', city: 'Denver',        lat: 39.7392, lng: -104.9903 },
  'America/Phoenix':      { country: 'US', city: 'Phoenix',       lat: 33.4484, lng: -112.0740 },
  'America/Los_Angeles':  { country: 'US', city: 'Los Angeles',   lat: 34.0522, lng: -118.2437 },
  'America/Toronto':      { country: 'CA', city: 'Toronto',       lat: 43.6532, lng: -79.3832 },
  'America/Sao_Paulo':    { country: 'BR', city: 'Sao Paulo',     lat: -23.5505, lng: -46.6333 },
  'Africa/Johannesburg':  { country: 'ZA', city: 'Johannesburg',  lat: -26.2041, lng: 28.0473 },
  'Asia/Kolkata':         { country: 'IN', city: 'Mumbai',        lat: 19.0760, lng: 72.8777 },
  'Asia/Dubai':           { country: 'AE', city: 'Dubai',         lat: 25.2048, lng: 55.2708 },
}

/** The device's IANA zone, or UTC when it will not say. */
export function deviceTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
}

/**
 * Longitude from the zone's own UTC offset — 15° per hour — for a zone that is
 * not in the table. Latitude stays off the equator on purpose: 0,0 is the
 * value that reads as "unset", and it is what this is here to avoid.
 */
function fromOffset(timezone: string): { country: string; city: string; lat: number; lng: number } {
  let offsetHours = 0
  try {
    const now = new Date()
    const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
    offsetHours = Math.round((local.getTime() - utc.getTime()) / 3_600_000)
  } catch { /* leave 0 */ }
  const lng = Math.max(-180, Math.min(180, offsetHours * 15))
  const city = timezone.includes('/') ? timezone.split('/').pop()!.replace(/_/g, ' ') : timezone
  return { country: 'US', city, lat: 34.0522, lng: lng || -118.2437 }
}

/** Where to place a station created on this device. */
export function stationPlace(): StationPlace {
  const timezone = deviceTimezone()
  const z = ZONES[timezone] ?? fromOffset(timezone)
  return {
    country: z.country,
    city: z.city,
    area: z.city,
    address: z.city,
    latitude: z.lat,
    longitude: z.lng,
    timezone,
  }
}

/**
 * The country's English NAME, which is what /station/add's own request example
 * carries — `"country": "China"`, not `"CN"`. This app was sending the ISO code,
 * and a code where a name is expected is an illegal argument.
 */
export function countryName(code: string): string {
  // The table first, on purpose. Intl.DisplayNames is the platform's opinion,
  // not the backend's: on iOS it answers "China mainland" for CN, where the
  // endpoint's own example says "China" — and a name the server does not know
  // is an illegal argument like any other.
  const known = COUNTRY_NAMES[code]
  if (known) return known
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'region' }).of(code)
    if (n && n !== code) return n
  } catch { /* fall through */ }
  return code
}

/** Names as the backend writes them — "China", not "China mainland". */
const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', HK: 'Hong Kong', TW: 'Taiwan', SG: 'Singapore', JP: 'Japan',
  KR: 'South Korea', AU: 'Australia', GB: 'United Kingdom', DE: 'Germany',
  FR: 'France', ES: 'Spain', NL: 'Netherlands', US: 'United States',
  CA: 'Canada', BR: 'Brazil', ZA: 'South Africa', IN: 'India',
  AE: 'United Arab Emirates',
}

/** The currency that goes with a country, falling back to USD. */
const CURRENCY: Record<string, string> = {
  CN: 'CNY', HK: 'HKD', TW: 'TWD', SG: 'SGD', JP: 'JPY', KR: 'KRW',
  AU: 'AUD', GB: 'GBP', DE: 'EUR', FR: 'EUR', ES: 'EUR', NL: 'EUR',
  US: 'USD', CA: 'CAD', BR: 'BRL', ZA: 'ZAR', IN: 'INR', AE: 'AED',
}

export function currencyFor(country: string): string {
  return CURRENCY[country] ?? 'USD'
}
