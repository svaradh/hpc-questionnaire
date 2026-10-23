/**
 * Typed access to clusters.json — the single place where Gargi/Raman
 * hardware, queue policy and trigger thresholds live. Schema conditions
 * refer to thresholds by path (configRef), e.g. "thresholds.maxCoresPerJob",
 * so a policy change is an edit here, not in the questionnaire.
 */

import clusters from './clusters.json'

export const CLUSTER_CONFIG = clusters

/**
 * Resolves a dotted path (e.g. "thresholds.maxCoresPerJob") to a number.
 * Returns null for missing or non-numeric values; conditions treat null as
 * "threshold unknown" and evaluate to false.
 */
export function configNumber(ref: string): number | null {
  let cur: unknown = CLUSTER_CONFIG
  for (const key of ref.split('.')) {
    if (cur === null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[key]
  }
  return typeof cur === 'number' ? cur : null
}
