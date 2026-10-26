/**
 * BlockPanel — one titled panel of further questions ('block') for one
 * repeatable entry, e.g. "Long runs" for a code. Used inline in an entry
 * (RepeatableGroup) and in a 'rowDetails' section (RowDetails).
 *
 * The block's questions store their answers flat in the entry's row, and
 * their conditions see that row (and the whole form through `{ form: … }`).
 * An optional "don't know these details" tick-box hides the questions, as
 * does a "Same answers as <earlier entry>" tick-box when one is offered.
 * A block with triggers says which of them opened it.
 */

import type { Question } from '../types/schema'
import { QuestionRenderer } from './QuestionRenderer'
import { RichText } from './RichText'
import { firedTriggers, questionVisible } from '../utils/conditions'

/** "a and b", "a; b; and c" (labels may contain commas) */
const listing = (xs: string[]) =>
  xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join('; ')}; and ${xs[xs.length - 1]}`

interface BlockPanelProps {
  block: Question
  row: Record<string, unknown>
  onRowChange: (subId: string, value: unknown) => void
  /** DOM id of the panel; its questions' ids are prefixed with it. */
  domId: string
  allAnswers: Record<string, unknown>
  /** Heading of the earlier entry this block may copy ("Code 1: QE — AIMD"), or null when not offered. */
  sameAsHeading?: string | null
}

export function BlockPanel({ block, row, onRowChange, domId, allAnswers, sameAsHeading = null }: BlockPanelProps) {
  const na = block.notAwareOption
  const same = block.sameAsOption && sameAsHeading ? block.sameAsOption : null
  const sameTicked = !!same && row[same.questionId] === true
  const notAware = (!!na && row[na.questionId] === true) || sameTicked
  const reasons = firedTriggers(block, row, allAnswers).map(t => t.label)
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
      {reasons.length > 0 && <p className="row-block-why"><RichText text={`Shown because ${listing(reasons)}.`} /></p>}
      {block.helpText && <p className="row-block-why"><RichText text={block.helpText} /></p>}
      {same && (
        <label className="checkbox-label row-block-not-aware">
          <input
            type="checkbox"
            checked={sameTicked}
            onChange={e => onRowChange(same.questionId, e.target.checked)}
          />
          <span>Same answers as {sameAsHeading}</span>
        </label>
      )}
      {na && !sameTicked && (
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
