/**
 * Device Info identifiers (v4.17.3, after-sales R15).
 *
 * Customers compared the app's "Serial Number" with the sticker on the unit and
 * found nothing alike: the app showed either a virtual serial it generated at
 * bind time ("SR1000-123456") or, in v4.17.1, the Bluetooth module's id. Marc
 * confirmed that id is an internal module identifier, not the product SN. So:
 *
 *  - **Serial Number** is only ever a serial the device itself reported (the
 *    record's `serialNumber` when `isVirtualSerialNumber` is not true and it is
 *    not in the generated `SR1000-######` form); otherwise "--".
 *  - **Bluetooth ID** is its own row: the DTU id read from the device's
 *    advertised name when it was added (`dtuDtuid` on the record, else the id
 *    saved on this phone at add time). Labelled for what it is, it can no longer
 *    be mistaken for the sticker.
 */

/** The form `generateSerial()` (src/data/deviceModels.ts) invents at bind time. */
const GENERATED_SERIAL = /^SR\d{4}-\d{6}$/i

function clean(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

/** The product serial the device reported, or "--" when only a virtual one exists. */
export function deviceSerialNumber(
  device: { serialNumber?: unknown; isVirtualSerialNumber?: unknown } | null | undefined,
): string {
  const sn = clean(device?.serialNumber)
  if (!sn || device?.isVirtualSerialNumber === true || GENERATED_SERIAL.test(sn)) return '--'
  return sn
}

/** The Bluetooth (DTU) id the device was added with, or "--". */
export function deviceBluetoothId(
  device: { dtuDtuid?: unknown } | null | undefined,
  rated: { bleId?: unknown } | null | undefined,
): string {
  return clean(device?.dtuDtuid) || clean(rated?.bleId) || '--'
}
