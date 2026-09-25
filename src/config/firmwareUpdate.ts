/**
 * Firmware Update (v4.20.0) — NOT RELEASED to consumer builds yet.
 *
 * On in Vite dev, QA builds (`VITE_ENABLE_DEV_TOOLS=true`) and builds made with
 * `VITE_ENABLE_FIRMWARE_UPDATE=true` (the E2E workflow). Off in the Pages root,
 * APK, iOS and release AAB: the request that starts an upgrade
 * (`/device/upgrade/create`) has not been captured yet, and a wrong flash can
 * leave a unit unusable. Release = flip this after that request is confirmed on a
 * test unit (docs/siseli-firmware-api.md §4).
 */
import { DEV_TOOLS_ENABLED } from './devTools'

export const FIRMWARE_UPDATE_ENABLED: boolean =
  DEV_TOOLS_ENABLED || import.meta.env.VITE_ENABLE_FIRMWARE_UPDATE === 'true'
