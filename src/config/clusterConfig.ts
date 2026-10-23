/**
 * Typed access to clusters.json — the single place where Gargi/Raman
 * hardware, queue policy and trigger thresholds live. Schema conditions
 * refer to thresholds by path (configRef), e.g. "thresholds.maxCoresPerJob",
 * so a policy change is an edit here, not in the questionnaire.
 */

import clusters from './clusters.json'

export const CLUSTER_CONFIG = clusters

function formatHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)} min` : `${h} h`
}

/** Every queue as a select option, e.g. { value: "gargi.medium", label: "Gargi · medium (1–3 nodes, 72 h)" }. */
export function queueOptions(): Array<{ value: string; label: string }> {
  return CLUSTER_CONFIG.clusters.flatMap(c =>
    c.queues.map(q => {
      const nodes = q.minNodes === q.maxNodes ? `${q.maxNodes} node` : `${q.minNodes}–${q.maxNodes} nodes`
      return { value: `${c.id}.${q.id}`, label: `${c.name} · ${q.id} (${nodes}, ${formatHours(q.walltimeHours)})` }
    })
  )
}

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
