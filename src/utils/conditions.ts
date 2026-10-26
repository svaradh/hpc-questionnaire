/**
 * Shared evaluation of schema conditions (conditionalOn / optionalWhen),
 * and section-level helpers built on them.
 */

import type { Condition, Question, RowPredicate, Section } from '../types/schema'
import { configNumber } from '../config/clusterConfig'
import { isQuantityValue, toBaseNumber } from './quantity'
import { plainText } from './glossary'

type Answers = Record<string, unknown>

/** True when the answer (string or string[]) includes one of `values`. */
function includesAny(val: unknown, values: string[]): boolean {
  if (Array.isArray(val)) return (val as string[]).some(v => values.includes(v))
  if (typeof val === 'string') return values.includes(val)
  return false
}

/** Base-unit value of a row field, or the product of several; null if any is unknown. */
function rowNumber(row: Answers, field: string | string[]): number | null {
  let product = 1
  for (const f of Array.isArray(field) ? field : [field]) {
    const n = toBaseNumber(row[f])
    if (n === null) return null
    product *= n
  }
  return product
}

function matchesRow(pred: RowPredicate, row: Answers): boolean {
  if ('all' in pred) return pred.all.every(p => matchesRow(p, row))
  if ('any' in pred) return pred.any.some(p => matchesRow(p, row))
  if (pred.op === 'in') return includesAny(row[pred.field], pred.values)
  const lhs = rowNumber(row, pred.field)
  const rhs = pred.configRef !== undefined ? configNumber(pred.configRef) : pred.value ?? null
  if (lhs === null || rhs === null) return false
  switch (pred.op) {
    case 'gt':  return lhs > rhs
    case 'gte': return lhs >= rhs
    case 'lt':  return lhs < rhs
    case 'lte': return lhs <= rhs
  }
}

/**
 * Evaluates a condition against an answers object. Inside a repeatable row
 * pass the row object as `answers`, so row-local questionIds resolve, and
 * the whole form's answers as `form`, for `{ form: … }` conditions.
 */
export function matchesCondition(cond: Condition, answers: Answers, form: Answers = answers): boolean {
  if ('all' in cond) return cond.all.every(c => matchesCondition(c, answers, form))
  if ('any' in cond) return cond.any.some(c => matchesCondition(c, answers, form))
  if ('not' in cond) return !matchesCondition(cond.not, answers, form)
  if ('form' in cond) return matchesCondition(cond.form, form, form)
  if ('rowsOf' in cond) {
    const rows = answers[cond.rowsOf]
    return Array.isArray(rows) && rows.some(r => r && typeof r === 'object' && matchesRow(cond.where, r as Answers))
  }
  // After rowsOf (which also has `where`): a predicate on the scope itself.
  if ('where' in cond) return matchesRow(cond.where, answers)
  return includesAny(answers[cond.questionId], cond.values)
}

/** OR over one or more conditions. Undefined means "no condition" and returns `whenAbsent`. */
export function matchesAny(
  conds: Condition | Condition[] | undefined,
  answers: Answers,
  whenAbsent: boolean
): boolean {
  if (!conds) return whenAbsent
  return (Array.isArray(conds) ? conds : [conds]).some(c => matchesCondition(c, answers))
}

/** Rows of a top-level repeatable, as stored. */
export function rowsOf(answers: Answers, questionId: string): Answers[] {
  const v = answers[questionId]
  return Array.isArray(v) ? (v as Answers[]) : []
}

/** The triggers of a block that hold for this row (all of them name why it is shown). */
export const firedTriggers = (q: Question, scope: Answers, form: Answers = scope) =>
  (q.triggers ?? []).filter(t => matchesCondition(t.condition, scope, form))

/**
 * Whether a question inside a repeatable row is shown (row-local conditions,
 * plus { form: … }). A block with triggers is shown when any trigger holds.
 */
export const questionVisible = (q: Question, scope: Answers, form: Answers = scope) =>
  (!q.conditionalOn || matchesCondition(q.conditionalOn, scope, form))
  && (!q.triggers || firedTriggers(q, scope, form).length > 0)

/** An entry's title: its entryTitle answers (default: first text field) joined with " — ". */
export function entryTitle(repeatable: Question, row: Answers): string {
  const ids = repeatable.entryTitle
    ?? (repeatable.subQuestions ?? []).filter(s => s.type === 'text').slice(0, 1).map(s => s.id)
  return ids.map(id => row?.[id]).filter((v): v is string => typeof v === 'string' && v.trim() !== '' && v !== 'dont_know')
    .map(v => v.trim()).join(' — ')
}

/** "Code 2: Quantum ESPRESSO — AIMD" (or "Code 2" before a name is entered). */
export function entryHeading(repeatable: Question, row: Answers, rowIndex: number): string {
  const entry = repeatable.entryLabel ? repeatable.entryLabel[0].toUpperCase() + repeatable.entryLabel.slice(1) : 'Entry'
  const title = entryTitle(repeatable, row)
  return `${entry} ${rowIndex + 1}${title ? `: ${title}` : ''}`
}

const normCode = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/[^a-z0-9]/g, '') : '')

/**
 * For a block with sameAsOption: the earlier entry (index) of the same code
 * that opened the block with its own answers, offered as "Same answers as …";
 * null when there is none. The code is the repeatable's first entryTitle field.
 */
export function sameAsSource(block: Question, repeatable: Question, rows: Answers[], rowIndex: number, form: Answers): number | null {
  const opt = block.sameAsOption
  const codeId = repeatable.entryTitle?.[0]
  if (!opt || !codeId) return null
  const code = normCode(rows[rowIndex]?.[codeId])
  if (!code) return null
  for (let j = 0; j < rowIndex; j++) {
    const r = rows[j] ?? {}
    if (normCode(r[codeId]) === code && questionVisible(block, r, form) && r[opt.questionId] !== true) return j
  }
  return null
}

/** True when the block's "Same answers as …" box is ticked and still points to a valid earlier entry. */
export const usesSameAs = (block: Question, repeatable: Question, rows: Answers[], rowIndex: number, form: Answers) =>
  !!block.sameAsOption && rows[rowIndex]?.[block.sameAsOption.questionId] === true
  && sameAsSource(block, repeatable, rows, rowIndex, form) !== null

/** Whether a question must be answered: `required`, or `requiredWhen` holds. */
export const questionRequired = (q: Question, scope: Answers, form: Answers = scope) =>
  q.required || (!!q.requiredWhen && matchesCondition(q.requiredWhen, scope, form))

/** For a 'rowDetails' question: the entries that open at least one block, with those blocks. */
export function openRowDetails(q: Question, answers: Answers): { rowIndex: number; blocks: Question[] }[] {
  if (!q.rowsOf) return []
  return rowsOf(answers, q.rowsOf)
    .map((row, rowIndex) => ({
      rowIndex,
      blocks: (q.questions ?? []).filter(b => questionVisible(b, row ?? {}, answers)),
    }))
    .filter(r => r.blocks.length > 0)
}

const isLayoutOnly = (q: Question) => q.type === 'info' || q.type === 'heading'

export function isSectionVisible(section: Section, answers: Answers): boolean {
  if (!matchesAny(section.conditionalOn, answers, true)) return false
  // A section that only continues repeatable entries is hidden while no entry opens a block.
  const details = section.questions.filter(q => q.type === 'rowDetails')
  if (details.length > 0 && section.questions.every(q => q.type === 'rowDetails' || isLayoutOnly(q))) {
    return details.some(q => openRowDetails(q, answers).length > 0)
  }
  return true
}

export function isSectionOptional(section: Section, answers: Answers): boolean {
  return matchesAny(section.optionalWhen, answers, false)
}

export function isSectionNotAware(section: Section, answers: Answers): boolean {
  return !!section.notAwareOption && answers[section.notAwareOption.questionId] === true
}

/** True when any top-level question in the section has a non-empty answer. */
export function sectionHasAnswers(section: Section, answers: Answers): boolean {
  return section.questions.some(q => {
    const v = answers[q.id]
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
}

/**
 * Answers to submit: only what the respondent can see. Drops answers of
 * hidden sections and hidden questions (left over from an earlier choice),
 * and the question answers of sections or panels where the respondent ticked
 * the "not aware" declaration (the declaration itself is kept). Each entry of
 * a repeatable with panels gets `_panels`: the ids of the blocks it opened
 * (inline or in a 'rowDetails' section), so the sheet writer can fill one
 * follow-up row per entry and panel, and `_triggers`: for each of those
 * blocks, the ids of the triggers that opened it. A block answered "Same
 * answers as" an earlier entry keeps only that entry's number under its
 * sameAsOption id. The local draft is left untouched, so
 * re-showing a question or unticking restores the answers.
 */
export function answersForSubmission(
  sections: Section[],
  answers: Answers
): Answers {
  const out = { ...answers }
  // Blocks continuing each repeatable from 'rowDetails' questions, by repeatable id.
  const laterBlocks: Record<string, Question[]> = {}
  for (const q of sections.flatMap(s => s.questions)) {
    if (q.type === 'rowDetails' && q.rowsOf) (laterBlocks[q.rowsOf] ??= []).push(...(q.questions ?? []))
  }
  const keep = (from: Answers, to: Answers, q: Question, scope: Answers) => {
    if (questionVisible(q, scope, answers) && from[q.id] !== undefined) to[q.id] = from[q.id]
  }
  const cleanRow = (q: Question, rows: Answers[], i: number): Answers => {
    const row = rows[i] ?? {}
    const r: Answers = {}
    const subs = q.subQuestions ?? []
    for (const sq of subs) if (sq.type !== 'block') keep(row, r, sq, row)
    const blocks = [...subs.filter(sq => sq.type === 'block'), ...(laterBlocks[q.id] ?? [])]
    if (blocks.length === 0) return r
    const panels: string[] = []
    const triggers: Record<string, string[]> = {}
    for (const b of blocks) {
      if (!questionVisible(b, row, answers)) continue
      panels.push(b.id)
      if (b.triggers) triggers[b.id] = firedTriggers(b, row, answers).map(t => t.id)
      if (usesSameAs(b, q, rows, i, answers)) {
        // The earlier entry's number (1-based, as entry_index in the sheet)
        r[b.sameAsOption!.questionId] = sameAsSource(b, q, rows, i, answers)! + 1
        continue
      }
      const na = b.notAwareOption?.questionId
      if (na && row[na] === true) { r[na] = true; continue }
      for (const bq of b.questions ?? []) keep(row, r, bq, row)
    }
    r._panels = panels
    r._triggers = triggers
    return r
  }
  for (const section of sections) {
    const visible = isSectionVisible(section, answers)
    if (!visible && section.notAwareOption) delete out[section.notAwareOption.questionId]
    if (!visible || isSectionNotAware(section, answers)) {
      for (const q of section.questions) delete out[q.id]
      continue
    }
    for (const q of section.questions) {
      if (q.type === 'rowDetails') continue
      if (!questionVisible(q, answers)) delete out[q.id]
      else if (q.type === 'repeatable') {
        const rows = rowsOf(answers, q.id)
        out[q.id] = rows.map((_, i) => cleanRow(q, rows, i))
      }
    }
  }
  return out
}

/**
 * True when a stored answer counts as given. "Don't know" counts; an empty
 * string, empty list, or a quantity with no number does not.
 */
export function isAnswered(v: unknown): boolean {
  if (v === undefined || v === null || v === '' || v === false) return false
  if (Array.isArray(v)) return v.length > 0
  if (isQuantityValue(v)) return v.value !== ''
  return true
}

export interface MissingAnswer {
  sectionId: string
  /** Human-readable location and question, e.g. "Code 2 (VASP): Wall time". */
  label: string
}

/**
 * Required questions left unanswered, in form order. Skips hidden sections,
 * sections declared "not aware", and hidden questions. A required
 * repeatable needs at least one entry; required sub-questions are checked
 * in every entry (with row-local conditions), as are the questions of every
 * block an entry opens (inline or in a 'rowDetails' section), unless the
 * block's "don't know these details" box is ticked. Sub-questions with
 * `coverage` add a check across entries.
 */
export function missingRequired(sections: Section[], answers: Answers): MissingAnswer[] {
  const out: MissingAnswer[] = []
  // "Code 2: VASP — relaxations": entry heading of a repeatable; "Entry 1: <workload>" for others.
  const entryName = (q: Question, row: Answers, i: number) => {
    if (q.entryTitle || (q.subQuestions ?? []).some(s => s.type === 'text')) return entryHeading(q, row, i)
    const ref = (q.subQuestions ?? []).filter(s => s.type === 'workloadRef')
      .map(s => row?.[s.id]).find(v => typeof v === 'string' && v.trim())
    return `${q.entryLabel ? q.entryLabel[0].toUpperCase() + q.entryLabel.slice(1) : 'Entry'} ${i + 1}${ref ? `: ${ref}` : ''}`
  }
  // Required questions of one shown block in a row; none when its "don't know these details"
  // or "Same answers as" box is ticked.
  const checkBlock = (sectionId: string, block: Question, source: Question, rows: Answers[], i: number, where: string) => {
    const row = rows[i] ?? {}
    if (block.notAwareOption && row[block.notAwareOption.questionId] === true) return
    if (usesSameAs(block, source, rows, i, answers)) return
    for (const bq of block.questions ?? []) {
      if (questionVisible(bq, row, answers) && questionRequired(bq, row, answers) && !isAnswered(row[bq.id])) {
        out.push({ sectionId, label: `${where}, ${plainText(block.label)}: ${plainText(bq.label)}` })
      }
    }
  }
  for (const section of sections) {
    if (!isSectionVisible(section, answers) || isSectionNotAware(section, answers)) continue
    for (const q of section.questions) {
      if (isLayoutOnly(q) || !questionVisible(q, answers)) continue
      if (q.type === 'rowDetails') {
        const source = sections.flatMap(s => s.questions).find(s => s.id === q.rowsOf)
        if (!source) continue
        const rows = rowsOf(answers, source.id)
        for (const { rowIndex, blocks } of openRowDetails(q, answers)) {
          const row = rows[rowIndex] ?? {}
          for (const b of blocks) checkBlock(section.id, b, source, rows, rowIndex, entryName(source, row, rowIndex))
        }
      } else if (q.type === 'repeatable') {
        const rows = rowsOf(answers, q.id)
        if (questionRequired(q, answers) && rows.length === 0) {
          out.push({ sectionId: section.id, label: `${plainText(q.label)}: add at least one ${q.entryLabel ?? 'entry'}` })
        }
        rows.forEach((r, i) => {
          const row = r ?? {}
          const where = entryName(q, row, i)
          for (const sq of q.subQuestions ?? []) {
            if (!questionVisible(sq, row, answers)) continue
            if (sq.type === 'block') checkBlock(section.id, sq, q, rows, i, where)
            else if (questionRequired(sq, row, answers) && !isAnswered(row[sq.id])) {
              out.push({ sectionId: section.id, label: `${where}: ${plainText(sq.label)}` })
            }
          }
        })
        for (const sq of q.subQuestions ?? []) {
          for (const opt of uncovered(sq, rows, answers)) {
            out.push({
              sectionId: section.id,
              label: `"${plainText(opt.label)}" (reported in Section B) is not ticked for any ${q.entryLabel ?? 'entry'}: tick it where it applies under "${plainText(sq.label)}", or tick Don't know`,
            })
          }
        }
      } else if (questionRequired(q, answers) && !isAnswered(answers[q.id])) {
        out.push({ sectionId: section.id, label: plainText(q.label) })
      }
    }
  }
  return out
}

/**
 * For a sub-question with `coverage`: its options selected in the form-level
 * question but in no entry where the sub-question is shown. Empty when an
 * entry selected one of `unlessValues`, or when no entry shows the question.
 */
function uncovered(sq: Question, rows: Answers[], form: Answers) {
  const cov = sq.coverage
  if (!cov) return []
  const shown = rows.filter(r => questionVisible(sq, r ?? {}, form))
  if (shown.length === 0) return []
  const picked = shown.flatMap(r => (Array.isArray(r?.[sq.id]) ? (r[sq.id] as string[]) : []))
  if (cov.unlessValues?.some(v => picked.includes(v))) return []
  return (sq.options ?? []).filter(o =>
    !o.exclusive && includesAny(form[cov.questionId], [o.value]) && !picked.includes(o.value))
}
