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

export function isSectionVisible(section: Section, answers: Answers): boolean {
  return matchesAny(section.conditionalOn, answers, true)
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

const questionVisible = (q: Question, scope: Answers, form: Answers = scope) =>
  !q.conditionalOn || matchesCondition(q.conditionalOn, scope, form)

/**
 * Required questions left unanswered, in form order. Skips hidden sections,
 * sections declared "not aware", and hidden questions. A required
 * repeatable needs at least one entry; required sub-questions are checked
 * in every entry (with row-local conditions).
 */
export function missingRequired(sections: Section[], answers: Answers): MissingAnswer[] {
  const out: MissingAnswer[] = []
  for (const section of sections) {
    if (!isSectionVisible(section, answers) || isSectionNotAware(section, answers)) continue
    for (const q of section.questions) {
      if (q.type === 'info' || q.type === 'heading' || !questionVisible(q, answers)) continue
      if (q.type === 'repeatable') {
        const rows = Array.isArray(answers[q.id]) ? (answers[q.id] as Answers[]) : []
        if (q.required && rows.length === 0) {
          out.push({ sectionId: section.id, label: `${plainText(q.label)}: add at least one ${q.entryLabel ?? 'entry'}` })
        }
        const entry = q.entryLabel ? q.entryLabel[0].toUpperCase() + q.entryLabel.slice(1) : 'Entry'
        rows.forEach((row, i) => {
          const name = (q.subQuestions ?? [])
            .filter(s => s.type === 'text' || s.type === 'workloadRef')
            .map(s => row?.[s.id]).find(v => typeof v === 'string' && v.trim())
          const where = `${entry} ${i + 1}${name ? ` (${name})` : ''}`
          for (const sq of q.subQuestions ?? []) {
            if (sq.required && questionVisible(sq, row ?? {}, answers) && !isAnswered(row?.[sq.id])) {
              out.push({ sectionId: section.id, label: `${where}: ${plainText(sq.label)}` })
            }
          }
        })
      } else if (q.required && !isAnswered(answers[q.id])) {
        out.push({ sectionId: section.id, label: plainText(q.label) })
      }
    }
  }
  return out
}
