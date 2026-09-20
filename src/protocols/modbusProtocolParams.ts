/** ParsedParam types + REG_DESC merge (split for MCP push size). */
import { REG_DESC_A } from './modbusProtocolParamsA'
import { REG_DESC_B } from './modbusProtocolParamsB'

/** Shape of one register description row; shared by REG_DESC part A and B. */
export type RegDesc = {
  name: string
  group: string
  scale?: number          // raw × scale = display value
  unit?: string
  signed?: boolean        // Int16
  fmt?: (raw: number) => string   // overrides scale/unit
}

export interface ParsedParam {
  addr: number
  name: string
  value: string  // formatted display
  unit: string
  raw: number
  group: string
}

export const REG_DESC: Record<number, RegDesc> = { ...REG_DESC_A, ...REG_DESC_B }
