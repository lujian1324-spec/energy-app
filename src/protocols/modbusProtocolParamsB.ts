/** REG_DESC part B (split for MCP push size). */
export const REG_DESC_B = {
  // ── Current / temperature 0x120-0x125 ───────
  0x0120: { name: 'Cell Current',             group: 'Temp/Current', scale: 0.01, unit: 'A', signed: true },
  0x0121: { name: 'MPPT Heatsink Temp',       group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0122: { name: 'DCDC Heatsink Temp',       group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0123: { name: 'Cell 1 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0124: { name: 'Cell 2 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  0x0125: { name: 'Cell 3 Temp',            group: 'Temp/Current', scale: 0.1,  unit: '℃', signed: true },
  // ── Run state / faults 0x126-0x134 ──────────
  0x0126: {
    name: 'Run State', group: 'Run State',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const flags: string[] = []
      if (lo & 0x01) flags.push('PV Charging')
      if (lo & 0x02) flags.push('AC Charging')
      if (lo & 0x04) flags.push('AC Output')
      if (lo & 0x08) flags.push('Bypass')
      if (lo & 0x10) flags.push('Inverting')
      if (lo & 0x20) flags.push('Countdown Off')
      if (lo & 0x40) flags.push('DC Running')
      if (lo & 0x80) flags.push('LCD Backlight Off')
      if (hi & 0x01) flags.push('Fan Running')
      return flags.length ? flags.join(' | ') : 'Standby'
    },
  },
  0x0127: {
    name: 'Alarm Code 1', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('Cell 3 Temp Low')
      if (hi & 0x40) w.push('Cell 2 Temp Low')
      if (hi & 0x20) w.push('Cell 1 Temp Low')
      if (hi & 0x10) w.push('Cell 3 Temp High')
      if (hi & 0x08) w.push('Cell 2 Temp High')
      if (hi & 0x04) w.push('Cell 1 Temp High')
      if (hi & 0x02) w.push('DCDC Overtemp')
      if (hi & 0x01) w.push('MPPT Overtemp')
      if (lo & 0x80) w.push('PV Input Overvoltage')
      if (lo & 0x40) w.push('Grid Undervoltage')
      if (lo & 0x20) w.push('Grid Overvoltage')
      if (lo & 0x10) w.push('BUS Overvoltage')
      if (lo & 0x08) w.push('BUS Undervoltage')
      if (lo & 0x04) w.push('Cell <3.0V')
      if (lo & 0x02) w.push('Cell Fuse Open')
      if (lo & 0x01) w.push('Busbar Loose')
      return w.length ? w.join(' | ') : 'No Alarm'
    },
  },
  0x0128: {
    name: 'Alarm Code 2', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x04) w.push('Temp Sampling Fault')
      if (lo & 0x02) w.push('Main Relay Fault')
      if (lo & 0x01) w.push('Output Short')
      return w.length ? w.join(' | ') : 'No Alarm'
    },
  },
  0x0129: {
    name: 'Grid Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('Charge HW Overcurrent')
      if (hi & 0x40) w.push('LLC Charge Overcurrent')
      if (hi & 0x20) w.push('Grid Relay Fault')
      if (hi & 0x10) w.push('Grid Overload')
      if (hi & 0x08) w.push('PLL Fault')
      if (hi & 0x04) w.push('Islanding Fault')
      if (hi & 0x02) w.push('Grid Outage Fast Detect')
      if (hi & 0x01) w.push('Bypass Underfreq')
      if (lo & 0x80) w.push('Grid Underfreq')
      if (lo & 0x40) w.push('Bypass Underfreq 2')
      if (lo & 0x20) w.push('Grid Overfreq')
      if (lo & 0x10) w.push('Bypass Undervoltage')
      if (lo & 0x08) w.push('Grid Undervoltage 2')
      if (lo & 0x04) w.push('Bypass Overvoltage')
      if (lo & 0x02) w.push('Grid Overvoltage')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012A: {
    name: 'Inverter Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x04) w.push('Software Lockout')
      if (hi & 0x02) w.push('Software Lockout 2')
      if (hi & 0x01) w.push('DC Overload')
      if (lo & 0x80) w.push('DC SW Overcurrent')
      if (lo & 0x40) w.push('DC HW Overcurrent')
      if (lo & 0x20) w.push('System Overtemp')
      if (lo & 0x10) w.push('Bus Soft Start')
      if (lo & 0x08) w.push('Bus Undervoltage')
      if (lo & 0x04) w.push('Bus Overvoltage')
      if (lo & 0x02) w.push('Bus Overvoltage Fast Detect')
      if (lo & 0x01) w.push('System Fault')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012B: {
    name: 'Off-Grid Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x80) w.push('Half-Wave Overload')
      if (lo & 0x40) w.push('Output Undervoltage')
      if (lo & 0x20) w.push('SW Overcurrent')
      if (lo & 0x10) w.push('HW Overcurrent')
      if (lo & 0x08) w.push('SW Overcurrent Fast Detect')
      if (lo & 0x04) w.push('Output Overload')
      if (lo & 0x02) w.push('Output Short')
      if (lo & 0x01) w.push('Off-Grid Inverter Fault')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
  0x012C: { name: 'Cell Count',             group: 'Run State', scale: 1, unit: 'cells' },
  0x012D: { name: 'Temp Sensor Count',       group: 'Run State', scale: 1, unit: 'pcs' },
  0x012E: { name: 'Charge Total Time',         group: 'Run State', scale: 1, unit: 'h' },
  0x012F: { name: 'Discharge Total Time',         group: 'Run State', scale: 1, unit: 'h' },
  0x0130: {
    name: 'Battery State', group: 'Run State',
    fmt: (raw) => {
      const lo = raw & 0xff
      const w: string[] = []
      if (lo & 0x08) w.push('Battery Severe Overvoltage')
      if (lo & 0x04) w.push('Battery Undervoltage')
      if (lo & 0x02) w.push('Battery Disconnected')
      if (lo & 0x01) w.push('Battery Overvoltage')
      return w.length ? w.join(' | ') : 'Normal'
    },
  },
  0x0133: {
    name: 'System State Machine', group: 'Run State',
    fmt: (raw) => {
      const states: Record<number, string> = {
        0: 'System Init', 1: 'Power-Up', 2: 'Standby',
        3: 'Grid Relay Closing Wait', 4: 'Grid Relay Closed', 5: 'Grid LLC Soft Start',
        6: 'Charging', 7: 'Discharge LLC Soft Start', 8: 'Discharging',
        9: 'Fault', 10: 'Shutdown', 11: 'Online Upgrade',
      }
      // 状态机是数值枚举（0..11），不是位掩码 —— 直接查表
      return states[raw] ?? `State 0x${raw.toString(16).toUpperCase()}`
    },
  },
  0x0134: {
    name: 'PV Fault', group: 'Alarm/Fault',
    fmt: (raw) => {
      const lo = raw & 0xff
      const hi = (raw >> 8) & 0xff
      const w: string[] = []
      if (hi & 0x80) w.push('PV Reverse Overcurrent')
      if (hi & 0x40) w.push('PV Bus Overvoltage Fast Detect')
      if (hi & 0x20) w.push('PV Overvoltage Fast Detect')
      if (hi & 0x10) w.push('PV Overtemp')
      if (hi & 0x08) w.push('PV Bus Overvoltage')
      if (hi & 0x04) w.push('PV Short Fast Detect')
      if (lo & 0x80) w.push('PV Disconnected')
      if (lo & 0x40) w.push('PV Short')
      if (lo & 0x20) w.push('PV Overcurrent')
      if (lo & 0x10) w.push('PV Output Undervoltage')
      if (lo & 0x08) w.push('PV Output Overvoltage')
      return w.length ? w.join(' | ') : 'No Fault'
    },
  },
}
