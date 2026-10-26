/**
 * RowDetails — renders a 'rowDetails' question: for each entry of the
 * repeatable named by `rowsOf` that opens at least one of the question's
 * blocks, a card headed by the entry's name with those blocks (BlockPanel).
 * Answers are written back into that entry's row, so the data is the same
 * as for blocks shown inline in the entry.
 */

import type { Question } from '../types/schema'
import { BlockPanel } from './BlockPanel'
import { entryHeading, openRowDetails, rowsOf, sameAsSource } from '../utils/conditions'

interface RowDetailsProps {
  question: Question
  /** The repeatable whose entries are continued (for naming the entries). */
  source: Question
  answers: Record<string, unknown>
  /** Receives the updated rows of the source repeatable. */
  onRowsChange: (rows: Record<string, unknown>[]) => void
}

export function RowDetails({ question, source, answers, onRowsChange }: RowDetailsProps) {
  const rows = rowsOf(answers, source.id)
  const open = openRowDetails(question, answers)

  const handleChange = (rowIndex: number, subId: string, value: unknown) =>
    onRowsChange(rows.map((r, i) => (i === rowIndex ? { ...r, [subId]: value } : r)))

  return (
    <div className="repeatable-group">
      {open.map(({ rowIndex, blocks }) => {
        const row = rows[rowIndex] ?? {}
        return (
          <div key={rowIndex} className="repeatable-row">
            <div className="repeatable-row-header">
              <span className="repeatable-row-label">{entryHeading(source, row, rowIndex)}</span>
            </div>
            <div className="repeatable-row-body">
              {blocks.map(b => {
                const j = sameAsSource(b, source, rows, rowIndex, answers)
                return (
                <BlockPanel
                  key={b.id}
                  block={b}
                  row={row}
                  onRowChange={(subId, value) => handleChange(rowIndex, subId, value)}
                  domId={`${question.id}_row${rowIndex}_${b.id}`}
                  allAnswers={answers}
                  sameAsHeading={j === null ? null : entryHeading(source, rows[j] ?? {}, j)}
                />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
