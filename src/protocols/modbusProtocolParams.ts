/** ParsedParam types + REG_DESC merge (split for MCP push size). */
import { REG_DESC_A } from './modbusProtocolParamsA'
import { REG_DESC_B } from './modbusProtocolParamsB'

export interface ParsedParam {
  addr: number
  name: string
  value: string  // formatted display
  unit: string
  raw: number
  group: string
}

export const REG_DESC = { ...REG_DESC_A, ...REG_DESC_B }
