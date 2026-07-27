/**
 * 服务器端定时（云端 Sleep Mode 排程）配置
 *
 * Sleep Mode 到点切换充电功率,客户端 useSleepModeScheduler 只在 App 存活时生效。
 * 要「App 关闭也生效」,唯一可行做法是让一台常驻的 relay（server/,与推送同一台）
 * 到点呼叫设备控制 API 写充电功率——官方的 timed 自动化指令被厂商关闭
 * （instructionOpen off,详见 API_REFERENCE.md §40）,所以走自建 relay。
 *
 * 本功能由 relay 地址是否配置来开关：设了 VITE_RELAY_URL（指向你部署的 server/）
 * 就启用；没设则前端完全空跑,行为与从前一致（仅客户端调度）。客户端调度始终保留
 * 作即时反馈 + 兜底。
 */

/** 你部署的 relay 基址(server/)。空 = 关闭云端排程,前端 no-op。 */
export const RELAY_BASE_URL: string = (import.meta.env.VITE_RELAY_URL ?? '').replace(/\/+$/, '')

/** relay 上的 Sleep 排程端点。 */
export const SCHEDULE_PATH = '/schedule'

/** 是否已配置 relay（有基址才上报排程）。 */
export const isRelayConfigured = (): boolean => RELAY_BASE_URL.length > 0
