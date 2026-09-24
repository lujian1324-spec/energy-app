import { DEV_TOOLS_ENABLED } from './devTools'

/**
 * Manual Fan Speed (v4.15.0) is not released to users.
 *
 * It writes Modbus 0x0081 directly and has not been verified on hardware — what
 * the fan does at 0 %, and whether the firmware hands control back — so it is
 * held to the same builds as the other direct-register tools: Vite dev, and QA /
 * internal builds made with VITE_ENABLE_DEV_TOOLS=true (deploy-qa.yml). Consumer
 * builds (Pages root, APK, iOS, release AAB) render no Fan Speed card; the value
 * is a build-time constant, so the card is dropped from their bundle entirely.
 *
 * `FanSpeedCard` and `api/fanControl.ts` stay wired: releasing it later is this
 * one line.
 */
export const FAN_CONTROL_ENABLED: boolean = DEV_TOOLS_ENABLED
