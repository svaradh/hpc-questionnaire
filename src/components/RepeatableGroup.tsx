/**
 * RepeatableGroup — renders a list of row-cards for repeatable questions.
 *
 * Each row contains the sub-questions defined in question.subQuestions.
 * Rows can be added and deleted. Values are stored as an array of
 * Record<subQuestionId, unknown> objects.
 *
 * A sub-question of type 'block' renders as a titled panel of further
 * questions (e.g. "Long runs") that appears when its condition holds for
 * the row. Conditions see the row's answers, and the whole form's answers
 * through `{ form: … }`.
 *
 * NOTE: Google Forms does not support repeatable groups natively.
 * This component implements the "add another entry" pattern for the
 * React prototype. When exporting to Google Forms, repeatable groups
 * must be implemented as a separate linked Google Form or as fixed rows.
 */

import type { ReactNode } from 'react'
import type { Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'
import { RichText } from './RichText'
import { matchesCondition } from '../utils/conditions'

interface RepeatableGroupProps {
  question: Question
  rows: Record<string, unknown>[]
  onChange: (rows: Record<string, unknown>[]) => void
  /** Whole-form answers, passed through for workloadRef sub-questions. */
  allAnswers?: Record<string, unknown>
}

export function RepeatableGroup({ question, rows, onChange, allAnswers }: RepeatableGroupProps) {
  const atCap = question.maxEntries !== undefined && rows.length >= question.maxEntries
  const subQuestions = question.subQuestions ?? []
  const coreSubQuestions = subQuestions.filter(q => !q.advanced)
  const advancedSubQuestions = subQuestions.filter(q => q.advanced)

  const handleAddRow = () => {
    onChange([...rows, {}])
  }

  const handleDeleteRow = (index: number) => {
    const updated = rows.filter((_, i) => i !== index)
    onChange(updated)
  }

  const handleRowChange = (index: number, subId: string, value: unknown) => {
    const updated = rows.map((row, i) =>
      i === index ? { ...row, [subId]: value } : row
    )
    onChange(updated)
  }

  const getRowValue = (rowIndex: number, subId: string): unknown => {
    return rows[rowIndex]?.[subId] ?? undefined
  }

  // Sub-question conditions are evaluated against the row's own answers
  // (and the whole form's, for { form: … } conditions)
  const isSubQuestionVisible = (rowIndex: number, subQ: Question): boolean =>
    !subQ.conditionalOn || matchesCondition(subQ.conditionalOn, rows[rowIndex] ?? {}, allAnswers ?? {})

  const renderSubQuestion = (rowIndex: number, subQ: Question): ReactNode => {
    if (!isSubQuestionVisible(rowIndex, subQ)) return null
    if (subQ.type === 'block') return renderBlock(rowIndex, subQ)
    const rowVal = getRowValue(rowIndex, subQ.id)
    return (
      <QuestionRenderer
        key={subQ.id}
        question={subQ}
        value={rowVal}
        onChange={val => handleRowChange(rowIndex, subQ.id, val)}
        idPrefix={`${question.id}_row${rowIndex}_`}
        allAnswers={allAnswers}
      />
    )
  }

  const renderBlock = (rowIndex: number, block: Question) => {
    const children = block.questions ?? []
    const na = block.notAwareOption
    const notAware = !!na && rows[rowIndex]?.[na.questionId] === true
    const core = children.filter(q => !q.advanced)
    const advanced = children.filter(q => q.advanced && isSubQuestionVisible(rowIndex, q))
    return (
      <section key={block.id} className="row-block" aria-label={block.label}>
        <h4 className="row-block-title"><RichText text={block.label} /></h4>
        {block.helpText && <p className="row-block-why"><RichText text={block.helpText} /></p>}
        {na && (
          <label className="checkbox-label row-block-not-aware">
            <input
              type="checkbox"
              checked={notAware}
              onChange={e => handleRowChange(rowIndex, na.questionId, e.target.checked)}
            />
            <span>{na.label}</span>
          </label>
        )}
        {!notAware && core.map(q => renderSubQuestion(rowIndex, q))}
        {!notAware && advanced.length > 0 && (
          <details className="repeatable-row-advanced">
            <summary>+ Show {advanced.length} more optional field{advanced.length > 1 ? 's' : ''}</summary>
            <div className="repeatable-row-advanced-body">
              {advanced.map(q => renderSubQuestion(rowIndex, q))}
            </div>
          </details>
        )}
      </section>
    )
  }

  // Build a display label for each row card header
  const getRowLabel = (rowIndex: number): string => {
    // Use the first text or workload-picker answer as the card title
    const firstSub = subQuestions.find(q => q.type === 'text' || q.type === 'workloadRef')
    if (firstSub) {
      const val = rows[rowIndex]?.[firstSub.id]
      if (typeof val === 'string' && val.trim()) {
        return val.trim().slice(0, 60) + (val.length > 60 ? '…' : '')
      }
    }
    return `Entry ${rowIndex + 1}`
  }

  return (
    <div className="repeatable-group">
      {rows.length === 0 && (
        <p className="repeatable-empty">No entries yet. Click &quot;Add {question.entryLabel ?? 'entry'}&quot; below to begin.</p>
      )}

      {rows.map((_, rowIndex) => {
        const visibleAdvanced = advancedSubQuestions.filter(subQ => isSubQuestionVisible(rowIndex, subQ))

        return (
          <div key={rowIndex} className="repeatable-row">
            <div className="repeatable-row-header">
              <span className="repeatable-row-label">{getRowLabel(rowIndex)}</span>
              <button
                type="button"
                className="btn-delete-row"
                onClick={() => handleDeleteRow(rowIndex)}
                aria-label={`Remove entry ${rowIndex + 1}`}
              >
                Remove
              </button>
            </div>

            <div className="repeatable-row-body">
              {coreSubQuestions.map(subQ => renderSubQuestion(rowIndex, subQ))}

              {visibleAdvanced.length > 0 && (
                <details className="repeatable-row-advanced">
                  <summary>
                    + Show {visibleAdvanced.length} more optional field{visibleAdvanced.length > 1 ? 's' : ''}
                  </summary>
                  <div className="repeatable-row-advanced-body">
                    {visibleAdvanced.map(subQ => renderSubQuestion(rowIndex, subQ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )
      })}

      {atCap ? (
        <p className="repeatable-cap-note">
          Maximum of {question.maxEntries} {question.entryLabel ?? 'entrie'}s reached.
        </p>
      ) : (
        <button
          type="button"
          className="btn-add-row"
          onClick={handleAddRow}
        >
          + Add {rows.length === 0 ? '' : 'another '}{question.entryLabel ?? 'entry'}
        </button>
      )}

      {question.googleFormsNote && (
        <p className="google-forms-note">
          <strong>Google Forms note:</strong> {question.googleFormsNote}
        </p>
      )}
    </div>
  )
}
