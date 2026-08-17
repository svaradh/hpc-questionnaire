/**
 * SectionRenderer — renders one section of the questionnaire.
 *
 * Responsibilities:
 * - Renders the section title and description callout.
 * - Maps questions to QuestionRenderer.
 * - Evaluates conditional visibility for each question.
 * - Handles the PI-is-respondent auto-fill for Section A:
 *   when A_pi_is_respondent = 'yes', mirrors PI details into the
 *   "completed by" fields and disables them.
 */

import type { Section, Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'

interface SectionRendererProps {
  section: Section
  answers: Record<string, unknown>
  onAnswer: (questionId: string, value: unknown) => void
}

function isQuestionVisible(question: Question, answers: Record<string, unknown>): boolean {
  if (!question.conditionalOn) return true
  const { questionId, values } = question.conditionalOn
  const currentValue = answers[questionId]

  if (Array.isArray(currentValue)) {
    return (currentValue as string[]).some(v => values.includes(v))
  }
  if (typeof currentValue === 'string') {
    return values.includes(currentValue)
  }
  return false
}

/** Derive the display name from PI salutation + name fields. */
function piFullName(answers: Record<string, unknown>, overrides?: Record<string, unknown>): string {
  const merged = { ...answers, ...overrides }
  const sal = (merged['A_pi_salutation'] as string) || ''
  const name = (merged['A_pi_name'] as string) || ''
  return [sal, name].filter(Boolean).join(' ')
}

export function SectionRenderer({ section, answers, onAnswer }: SectionRendererProps) {
  const piIsRespondent = answers['A_pi_is_respondent'] === 'yes'

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
    </div>
  )
}
