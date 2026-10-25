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

/** Whether a question inside a repeatable row is shown (row-local conditions, plus { form: … }). */
export const questionVisible = (q: Question, scope: Answers, form: Answers = scope) =>
  !q.conditionalOn || matchesCondition(q.conditionalOn, scope, form)

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
 * Answers to submit. Drops everything belonging to sections that are not
 * shown (answers left over from an earlier trigger), and the question
 * answers of sections where the respondent ticked the "not aware"
 * declaration (the declaration itself is kept). The local draft is left
 * untouched, so re-showing a section or unticking restores the answers.
 */
export function answersForSubmission(
  sections: Section[],
  answers: Answers
): Answers {
  const out = { ...answers }
  for (const section of sections) {
    const visible = isSectionVisible(section, answers)
    if (!visible && section.notAwareOption) delete out[section.notAwareOption.questionId]
    if (!visible || isSectionNotAware(section, answers)) {
      for (const q of section.questions) delete out[q.id]
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
  // "Code 2 (VASP)": entry label of a repeatable, named by its first text answer.
  const entryName = (q: Question, row: Answers, i: number) => {
    const entry = q.entryLabel ? q.entryLabel[0].toUpperCase() + q.entryLabel.slice(1) : 'Entry'
    const name = (q.subQuestions ?? [])
      .filter(s => s.type === 'text' || s.type === 'workloadRef')
      .map(s => row?.[s.id]).find(v => typeof v === 'string' && v.trim() && v !== 'dont_know')
    return `${entry} ${i + 1}${name ? ` (${name})` : ''}`
  }
  // Required questions of one shown block in a row; none when its "don't know these details" box is ticked.
  const checkBlock = (sectionId: string, block: Question, row: Answers, where: string) => {
    if (block.notAwareOption && row[block.notAwareOption.questionId] === true) return
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
          for (const b of blocks) checkBlock(section.id, b, row, entryName(source, row, rowIndex))
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
            if (sq.type === 'block') checkBlock(section.id, sq, row, where)
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
