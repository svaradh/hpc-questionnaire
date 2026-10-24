/**
 * Glossary markup: `{term}` or `{shown text|id}` inside question text marks
 * a term that the form renders with a definition pop-up. These helpers
 * split text into plain and term segments, and strip the markup where only
 * plain text can be shown (dropdown options, aria-labels, messages).
 */

import type { GlossaryEntry } from '../types/schema'

const MARKUP = /\{([^{}|]+)(?:\|([^{}]+))?\}/g

export type Segment = { text: string; entry?: GlossaryEntry }

/** Index of glossary entries by id, term and aliases (lower-case). */
export function indexGlossary(entries: GlossaryEntry[] = []): Map<string, GlossaryEntry> {
  const index = new Map<string, GlossaryEntry>()
  for (const e of entries) {
    for (const key of [e.id, e.term, ...(e.aliases ?? [])]) index.set(key.toLowerCase(), e)
  }
  return index
}

/** Splits text into segments; marked terms carry their glossary entry (if found). */
export function segments(text: string, index: Map<string, GlossaryEntry>): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(MARKUP)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) })
    const shown = m[1]
    out.push({ text: shown, entry: index.get((m[2] ?? shown).trim().toLowerCase()) })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** Text with markup removed: `{wall time}` → `wall time`. */
export function plainText(text: string): string {
  return text.replace(MARKUP, '$1')
}
