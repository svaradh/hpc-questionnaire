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
 * through `{ form: … }`. Blocks may instead live in a later 'rowDetails'
 * section; each entry then names the panels it opens there.
 *
 * NOTE: Google Forms does not support repeatable groups natively.
 * This component implements the "add another entry" pattern for the
 * React prototype. When exporting to Google Forms, repeatable groups
 * must be implemented as a separate linked Google Form or as fixed rows.
 */

import { useContext, type ReactNode } from 'react'
import type { Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'
import { BlockPanel } from './BlockPanel'
import { SectionsContext } from './SectionsContext'
import { entryTitle, entryHeading, matchesCondition, questionVisible, sameAsSource } from '../utils/conditions'
import { plainText } from '../utils/glossary'

interface RepeatableGroupProps {
  question: Question
  rows: Record<string, unknown>[]
  onChange: (rows: Record<string, unknown>[]) => void
  /** Whole-form answers, passed through for workloadRef sub-questions. */
  allAnswers?: Record<string, unknown>
}

export function RepeatableGroup({ question, rows, onChange, allAnswers }: RepeatableGroupProps) {
  const sections = useContext(SectionsContext)
  // Sections whose 'rowDetails' questions continue these entries, with their blocks.
  const detailSections = sections.flatMap(s =>
    s.questions.filter(q => q.type === 'rowDetails' && q.rowsOf === question.id)
      .map(q => ({ sectionId: s.id, blocks: q.questions ?? [] })))
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

  const blockDomId = (rowIndex: number, block: Question) => `${question.id}_row${rowIndex}_${block.id}`

  // Panels open in this row, listed at the top of the entry so they are not missed further down.
  const renderOpenBlocksNote = (rowIndex: number) => {
    const open = subQuestions.filter(q => q.type === 'block' && isSubQuestionVisible(rowIndex, q))
    if (open.length === 0) return null
    return (
      <p className="row-blocks-note" role="status">
        Extra questions for this code:{' '}
        {open.map((b, i) => (
          <span key={b.id}>
            {i > 0 && ', '}
            <button
              type="button"
              className="link-button"
              onClick={() => document.getElementById(blockDomId(rowIndex, b))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {b.label}
            </button>
          </span>
        ))}
        {' '}— further down this entry.
      </p>
    )
  }

  // Panels this row opens in a later section, named at the end of the entry.
  const renderLaterBlocksNote = (rowIndex: number) =>
    detailSections.map(({ sectionId, blocks }) => {
      const open = blocks.filter(b => questionVisible(b, rows[rowIndex] ?? {}, allAnswers ?? {}))
      if (open.length === 0) return null
      return (
        <p key={sectionId} className="row-blocks-note" role="status">
          Section {sectionId} will ask a few more questions about this code: {open.map(b => plainText(b.label)).join(', ')}.
        </p>
      )
    })

  const renderBlock = (rowIndex: number, block: Question) => (
    <BlockPanel
      key={block.id}
      block={block}
      row={rows[rowIndex] ?? {}}
      onRowChange={(subId, value) => handleRowChange(rowIndex, subId, value)}
      domId={blockDomId(rowIndex, block)}
      allAnswers={allAnswers ?? {}}
      sameAsHeading={(() => {
        const j = sameAsSource(block, question, rows, rowIndex, allAnswers ?? {})
        return j === null ? null : entryHeading(question, rows[j] ?? {}, j)
      })()}
    />
  )

  // Build a display label for each row card header
  const getRowLabel = (rowIndex: number): string => {
    // The entry title (entryTitle fields, else the first text answer), else the workload picked
    let val = entryTitle(question, rows[rowIndex] ?? {})
    if (!val) {
      const ref = subQuestions.find(q => q.type === 'workloadRef')
      const v = ref ? rows[rowIndex]?.[ref.id] : undefined
      val = typeof v === 'string' ? v.trim() : ''
    }
    if (val) return val.slice(0, 80) + (val.length > 80 ? '…' : '')
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
              {renderOpenBlocksNote(rowIndex)}
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
              {renderLaterBlocksNote(rowIndex)}
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
