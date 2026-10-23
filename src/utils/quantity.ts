/**
 * Quantities with units — stored as { value, unit } and normalised to a
 * base unit (hours for time, GB for size) for comparisons. The Apps Script
 * applies the same factors on write (SheetWriter.gs: quantityToBase).
 */

import type { QuantityDimension } from '../types/schema'

/** Value stored for any numeric/quantity question answered "Don't know". */
export const UNKNOWN = 'dont_know'

export const UNIT_FACTORS: Record<QuantityDimension, Record<string, number>> = {
  time: { seconds: 1 / 3600, minutes: 1 / 60, hours: 1, days: 24, weeks: 168 },
  size: { MB: 1 / 1024, GB: 1, TB: 1024 },
}

export const DEFAULT_UNITS: Record<QuantityDimension, string[]> = {
  time: ['minutes', 'hours', 'days'],
  size: ['GB', 'TB'],
}

export interface QuantityValue {
  value: number | ''
  unit: string
}

export function isQuantityValue(v: unknown): v is QuantityValue {
  return v !== null && typeof v === 'object' && 'unit' in (v as object)
}

/**
 * Numeric value of an answer in base units: plain numbers as-is, quantities
 * converted (time → hours, size → GB). Unknown, blank or invalid → null.
 */
export function toBaseNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (!isQuantityValue(v) || v.value === '') return null
  for (const factors of Object.values(UNIT_FACTORS)) {
    if (v.unit in factors) return Number(v.value) * factors[v.unit]
  }
  return null
}
