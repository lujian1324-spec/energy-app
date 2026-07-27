/**
 * 服务器端定时（云端 Sleep Mode 排程）配置
 *
 * Sleep Mode 目前靠客户端 useSleepModeScheduler 到点切换充电功率——只有 App 存活
 * 时才生效。理想做法是把排程登记成官方后端的「自动化指令（timed auto-instruction，
 * /instruction/*）」，由 siseli 后端在服务器端到点执行，App 关闭也生效
 * （见 src/api/instructionApi.ts）。
 *
 * ⚠️ 默认关闭。实测（2026-07）发现官方 timed auto-instruction 已被【厂商关闭】
 * （instructionOpen off，创建返回 code 70247）。在 siseli 重新开启该开关、且我们
 * 在真机上确认了 timed 窗口指令的实际语义（startTime 触发后是否在 endTime 自动
 * 恢复）之前，绝不能打开此开关——否则可能在错误时间对真实设备写错功率。
 *
 * 打开条件（两者都满足后，构建时设 VITE_CLOUD_SLEEP_SCHEDULE=true）：
 *   1) 厂商已开启 timed instructionOpen；
 *   2) 已用 add→read-back→真机触发 验证过窗口语义并据此校正
 *      buildSleepWindowInstruction。
 *
 * 关闭时：DeviceDetailPage 完全走现有客户端调度（零行为变化）。
 */
export const CLOUD_SLEEP_SCHEDULE_ENABLED: boolean =
  import.meta.env.VITE_CLOUD_SLEEP_SCHEDULE === 'true'
