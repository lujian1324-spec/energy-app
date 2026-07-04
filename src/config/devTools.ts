/**
 * 开发/调试工具可见性开关。
 *
 * 消费者发布版默认隐藏 Modbus 透传台、Debug Params、BLE Debug 等页面与入口
 * （原始寄存器 + 直接透传控制，普通用户误入可能误操作设备）。
 *
 * 可见条件：
 *  - Vite dev（import.meta.env.DEV）始终可见，或
 *  - 构建时显式设 VITE_ENABLE_DEV_TOOLS=true（用于 QA / TestFlight 内测包）。
 */
export const DEV_TOOLS_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true'
