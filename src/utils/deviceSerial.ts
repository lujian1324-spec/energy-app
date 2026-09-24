/**
 * Device Info's Serial Number is the device's Bluetooth ID — the DTU id the app
 * read from the device's advertised name ("SSL_" + base64) when it was added,
 * the same string the Add Device list showed under the device (v4.17.1).
 *
 * It used to show the record's `serialNumber`, which for most devices is a
 * virtual one the app generated from the model and id at bind time, and fell
 * back to a literal "SNXXXX".
 *
 * Source order:
 *  1. the device record's `dtuDtuid` — what the device was bound with, so it
 *     is right on any phone the account signs in on;
 *  2. the id saved on this phone when it was added (`RatedParams.bleId`), for a
 *     record that came back without it;
 *  3. "--": no Bluetooth ID is known, and a made-up serial is not shown.
 */
export function deviceSerialNumber(
  device: { dtuDtuid?: unknown } | null | undefined,
  rated: { bleId?: unknown } | null | undefined,
): string {
  for (const v of [device?.dtuDtuid, rated?.bleId]) {
    const s = v == null ? '' : String(v).trim()
    if (s) return s
  }
  return '--'
}
