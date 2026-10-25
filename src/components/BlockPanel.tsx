/**
 * BlockPanel — one titled panel of further questions ('block') for one
 * repeatable entry, e.g. "Long runs" for a code. Used inline in an entry
 * (RepeatableGroup) and in a 'rowDetails' section (RowDetails).
 *
 * The block's questions store their answers flat in the entry's row, and
 * their conditions see that row (and the whole form through `{ form: … }`).
 * An optional "don't know these details" tick-box hides the questions.
 */

import type { Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'
import { RichText } from './RichText'
import { questionVisible } from '../utils/conditions'

interface BlockPanelProps {
  block: Question
  row: Record<string, unknown>
  onRowChange: (subId: string, value: unknown) => void
  /** DOM id of the panel; its questions' ids are prefixed with it. */
  domId: string
  allAnswers: Record<string, unknown>
}

export function BlockPanel({ block, row, onRowChange, domId, allAnswers }: BlockPanelProps) {
  const na = block.notAwareOption
  const notAware = !!na && row[na.questionId] === true
  const visible = (block.questions ?? []).filter(q => questionVisible(q, row, allAnswers))
  const core = visible.filter(q => !q.advanced)
  const advanced = visible.filter(q => q.advanced)
  const render = (q: Question) => (
    <QuestionRenderer
      key={q.id}
      question={q}
      value={row[q.id]}
      onChange={val => onRowChange(q.id, val)}
      idPrefix={`${domId}_`}
      allAnswers={allAnswers}
    />
  )
  return (
    <section id={domId} className="row-block" aria-label={block.label}>
      <h4 className="row-block-title"><RichText text={block.label} /></h4>
      {block.helpText && <p className="row-block-why"><RichText text={block.helpText} /></p>}
      {na && (
        <label className="checkbox-label row-block-not-aware">
          <input
            type="checkbox"
            checked={notAware}
            onChange={e => onRowChange(na.questionId, e.target.checked)}
          />
          <span>{na.label}</span>
        </label>
      )}
      {!notAware && core.map(render)}
      {!notAware && advanced.length > 0 && (
        <details className="repeatable-row-advanced">
          <summary>+ Show {advanced.length} more optional field{advanced.length > 1 ? 's' : ''}</summary>
          <div className="repeatable-row-advanced-body">{advanced.map(render)}</div>
        </details>
      )}
    </section>
  )
}
