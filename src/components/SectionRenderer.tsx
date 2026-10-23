/**
 * SectionRenderer — renders one section of the questionnaire.
 *
 * Responsibilities:
 * - Renders the section title and description callout.
 * - Maps questions to QuestionRenderer.
 * - Evaluates conditional visibility for each question.
 * - Renders the optional top-level "not aware" declaration; when ticked,
 *   the section's questions are hidden.
 * - Collapses sections whose optionalWhen condition holds behind a
 *   "this section is optional" notice until the respondent expands them.
 * - Handles the PI-is-respondent auto-fill for Section A:
 *   when A_pi_is_respondent = 'yes', mirrors PI details into the
 *   "completed by" fields and disables them.
 */

import { useState } from 'react'
import type { Section, Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'
import { matchesCondition, isSectionOptional, isSectionNotAware, sectionHasAnswers } from '../utils/conditions'

interface SectionRendererProps {
  section: Section
  answers: Record<string, unknown>
  onAnswer: (questionId: string, value: unknown) => void
}

function isQuestionVisible(question: Question, answers: Record<string, unknown>): boolean {
  return !question.conditionalOn || matchesCondition(question.conditionalOn, answers)
}

const NOT_AWARE_DEFAULT_HELP =
  "This is a valid answer and is not treated as a negative finding. The rest of this section will be skipped; " +
  "the committee may get in touch if a short conversation would help characterise your workload."

/** Derive the display name from PI salutation + name fields. */
function piFullName(answers: Record<string, unknown>, overrides?: Record<string, unknown>): string {
  const merged = { ...answers, ...overrides }
  const sal = (merged['A_pi_salutation'] as string) || ''
  const name = (merged['A_pi_name'] as string) || ''
  return [sal, name].filter(Boolean).join(' ')
}

export function SectionRenderer({ section, answers, onAnswer }: SectionRendererProps) {
  const piIsRespondent = answers['A_pi_is_respondent'] === 'yes'
  // Expansion of an optional (collapsed) section. Parent keys this component by
  // section id, so the state resets per section. Already-entered answers keep it open.
  const [expanded, setExpanded] = useState(false)
  const collapsed = isSectionOptional(section, answers) && !expanded && !sectionHasAnswers(section, answers)
  const notAware = isSectionNotAware(section, answers)

  /**
   * Intercepts answer changes to implement Section A auto-fill:
   * - When A_pi_is_respondent flips to 'yes': populate the three mirrored fields.
   * - When it flips back to 'no': clear them so the respondent can fill them in.
   * - When PI name/salutation/email changes while A_pi_is_respondent = 'yes': keep mirrored fields in sync.
   */
  const handleAnswer = (questionId: string, value: unknown) => {
    onAnswer(questionId, value)

    if (questionId === 'A_pi_is_respondent') {
      if (value === 'yes') {
        onAnswer('A_completed_by_name', piFullName(answers))
        onAnswer('A_completed_by_email', answers['A_pi_email'] ?? '')
        onAnswer('A_completed_by_role', 'pi')
      } else {
        onAnswer('A_completed_by_name', '')
        onAnswer('A_completed_by_email', '')
        onAnswer('A_completed_by_role', '')
      }
      return
    }

    if (piIsRespondent) {
      if (questionId === 'A_pi_salutation' || questionId === 'A_pi_name') {
        onAnswer('A_completed_by_name', piFullName(answers, { [questionId]: value }))
      }
      if (questionId === 'A_pi_email') {
        onAnswer('A_completed_by_email', value)
      }
    }
  }

  return (
    <div className="section-body">
      {section.description && (
        <div className="section-description">
          {section.description.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {collapsed && (
        <div className="optional-section-notice" role="note">
          <p>
            Based on your earlier answers, this section is optional. You can skip it,
            or add details if you have them readily available.
          </p>
          <button type="button" className="btn-add-row" onClick={() => setExpanded(true)}>
            Add details for this section
          </button>
        </div>
      )}

      {!collapsed && section.notAwareOption && (
        <div className="not-aware-declaration">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={notAware}
              onChange={e => onAnswer(section.notAwareOption!.questionId, e.target.checked)}
            />
            <span>{section.notAwareOption.label}</span>
          </label>
          <span className="question-help">{section.notAwareOption.helpText ?? NOT_AWARE_DEFAULT_HELP}</span>
        </div>
      )}

      {!collapsed && !notAware && (
      <div className="section-questions">
        {section.questions.map(question => {
          if (!isQuestionVisible(question, answers)) return null

          const isMirrored = question.mirrorFromPI && piIsRespondent

          return (
            <QuestionRenderer
              key={question.id}
              question={question}
              value={answers[question.id]}
              onChange={val => handleAnswer(question.id, val)}
              disabled={isMirrored}
            />
          )
        })}
      </div>
      )}
    </div>
  )
}
