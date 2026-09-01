/**
 * RepeatableGroup — renders a list of row-cards for repeatable questions.
 *
 * Each row contains the sub-questions defined in question.subQuestions.
 * Rows can be added and deleted. Values are stored as an array of
 * Record<subQuestionId, unknown> objects.
 *
 * NOTE: Google Forms does not support repeatable groups natively.
 * This component implements the "add another entry" pattern for the
 * React prototype. When exporting to Google Forms, repeatable groups
 * must be implemented as a separate linked Google Form or as fixed rows.
 */

import type { Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'

interface RepeatableGroupProps {
  question: Question
  rows: Record<string, unknown>[]
  onChange: (rows: Record<string, unknown>[]) => void
}

export function RepeatableGroup({ question, rows, onChange }: RepeatableGroupProps) {
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

  // Check conditional visibility of a sub-question within a row
  const isSubQuestionVisible = (rowIndex: number, subQ: Question): boolean => {
    if (!subQ.conditionalOn) return true
    const depVal = getRowValue(rowIndex, subQ.conditionalOn.questionId)
    const depStr =
      typeof depVal === 'string'
        ? depVal
        : Array.isArray(depVal)
          ? (depVal as string[]).join(',')
          : ''
    return subQ.conditionalOn.values.some(v =>
      depStr === v || (Array.isArray(depVal) && (depVal as string[]).includes(v))
    )
  }

  const renderSubQuestion = (rowIndex: number, subQ: Question) => {
    if (!isSubQuestionVisible(rowIndex, subQ)) return null
    const rowVal = getRowValue(rowIndex, subQ.id)
    return (
      <QuestionRenderer
        key={subQ.id}
        question={subQ}
        value={rowVal}
        onChange={val => handleRowChange(rowIndex, subQ.id, val)}
        idPrefix={`${question.id}_row${rowIndex}_`}
      />
    )
  }

  // Build a display label for each row card header
  const getRowLabel = (rowIndex: number): string => {
    // Try to find a meaningful value from the first sub-question
    const firstSub = subQuestions[0]
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
        <p className="repeatable-empty">No entries yet. Click &quot;Add entry&quot; below to begin.</p>
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

      <button
        type="button"
        className="btn-add-row"
        onClick={handleAddRow}
      >
        + Add {rows.length === 0 ? '' : 'another '}{question.entryLabel ?? 'entry'}
      </button>

      {question.googleFormsNote && (
        <p className="google-forms-note">
          <strong>Google Forms note:</strong> {question.googleFormsNote}
        </p>
      )}
    </div>
  )
}
