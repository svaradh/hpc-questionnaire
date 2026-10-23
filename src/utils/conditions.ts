/**
 * Shared evaluation of schema conditions (conditionalOn / optionalWhen),
 * and section-level helpers built on them.
 */

import type { Condition, Section } from '../types/schema'

/** True when the referenced answer (string or string[]) includes one of the condition's values. */
export function matchesCondition(cond: Condition, answers: Record<string, unknown>): boolean {
  const val = answers[cond.questionId]
  if (Array.isArray(val)) return (val as string[]).some(v => cond.values.includes(v))
  if (typeof val === 'string') return cond.values.includes(val)
  return false
}

/** OR over one or more conditions. Undefined means "no condition" and returns `whenAbsent`. */
export function matchesAny(
  conds: Condition | Condition[] | undefined,
  answers: Record<string, unknown>,
  whenAbsent: boolean
): boolean {
  if (!conds) return whenAbsent
  return (Array.isArray(conds) ? conds : [conds]).some(c => matchesCondition(c, answers))
}

export function isSectionVisible(section: Section, answers: Record<string, unknown>): boolean {
  return matchesAny(section.conditionalOn, answers, true)
}

export function isSectionOptional(section: Section, answers: Record<string, unknown>): boolean {
  return matchesAny(section.optionalWhen, answers, false)
}

export function isSectionNotAware(section: Section, answers: Record<string, unknown>): boolean {
  return !!section.notAwareOption && answers[section.notAwareOption.questionId] === true
}

/** True when any top-level question in the section has a non-empty answer. */
export function sectionHasAnswers(section: Section, answers: Record<string, unknown>): boolean {
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
  answers: Record<string, unknown>
): Record<string, unknown> {
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
