/**
 * Shared evaluation of schema conditions (conditionalOn / optionalWhen),
 * and section-level helpers built on them.
 */

import type { Condition, RowPredicate, Section } from '../types/schema'
import { configNumber } from '../config/clusterConfig'
import { toBaseNumber } from './quantity'

type Answers = Record<string, unknown>

/** True when the answer (string or string[]) includes one of `values`. */
function includesAny(val: unknown, values: string[]): boolean {
  if (Array.isArray(val)) return (val as string[]).some(v => values.includes(v))
  if (typeof val === 'string') return values.includes(val)
  return false
}

function matchesRow(pred: RowPredicate, row: Answers): boolean {
  if ('all' in pred) return pred.all.every(p => matchesRow(p, row))
  if ('any' in pred) return pred.any.some(p => matchesRow(p, row))
  if (pred.op === 'in') return includesAny(row[pred.field], pred.values)
  const lhs = toBaseNumber(row[pred.field])
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
 * pass the row object as `answers`, so row-local questionIds resolve.
 */
export function matchesCondition(cond: Condition, answers: Answers): boolean {
  if ('all' in cond) return cond.all.every(c => matchesCondition(c, answers))
  if ('any' in cond) return cond.any.some(c => matchesCondition(c, answers))
  if ('rowsOf' in cond) {
    const rows = answers[cond.rowsOf]
    return Array.isArray(rows) && rows.some(r => r && typeof r === 'object' && matchesRow(cond.where, r as Answers))
  }
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
 * Answers to submit: drops the question answers of any section where the
 * respondent ticked the "not aware" declaration (the declaration itself is
 * kept), so partially entered data the respondent chose to set aside is not
 * sent. A declaration left on a section that is no longer shown is also
 * dropped, so it is not reported. The local draft is left untouched so
 * unticking restores it.
 */
export function answersForSubmission(
  sections: Section[],
  answers: Answers
): Answers {
  const out = { ...answers }
  for (const section of sections) {
    if (!isSectionNotAware(section, answers)) continue
    if (!isSectionVisible(section, answers)) {
      delete out[section.notAwareOption!.questionId]
      continue
    }
    for (const q of section.questions) delete out[q.id]
  }
  return out
}
