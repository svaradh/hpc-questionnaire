/**
 * QuestionRenderer — renders a single question of any type.
 *
 * Supported types:
 *   text       → <input type="text">
 *   number     → <input type="number">
 *   textarea   → <textarea>
 *   radio      → <fieldset> with radio inputs
 *   checkbox   → <fieldset> with checkbox inputs
 *   select     → <select>
 *   info       → styled blue callout div
 *   repeatable → delegates to <RepeatableGroup>
 *   quantity / duration → number + unit dropdown, stored as { value, unit }
 *   workloadRef → dropdown of names from another repeatable (optionsFrom)
 *
 * number / quantity / duration validate inline (integer, min, max) and,
 * with allowUnknown, offer a "Don't know" tick-box stored as "dont_know".
 *
 * Text may carry glossary markup ({term}); see RichText. Options with a
 * conditionalOn are shown only when it holds for the whole form.
 *
 * The idPrefix prop allows sub-questions inside repeatable rows to
 * have unique DOM ids even though their question.id values are shared
 * across rows.
 */

import type { Question, QuestionOption } from '../types/schema'
import { RepeatableGroup } from './RepeatableGroup'
import { RichText } from './RichText'
import { plainText } from '../utils/glossary'
import { matchesCondition } from '../utils/conditions'
import { UNKNOWN, DEFAULT_UNITS, isQuantityValue, type QuantityValue } from '../utils/quantity'
import { queueOptions } from '../config/clusterConfig'

interface QuestionRendererProps {
  question: Question
  value: unknown
  onChange: (value: unknown) => void
  idPrefix?: string
  /** When true, all inputs are rendered disabled with a visual indicator. */
  disabled?: boolean
  /** Whole-form answers; needed by workloadRef questions (optionsFrom). */
  allAnswers?: Record<string, unknown>
}

/** Inline format check for numeric entries; returns a message or null. */
function numberError(question: Question, n: number | ''): string | null {
  if (n === '') return null
  if (!Number.isFinite(n)) return 'Please enter a number.'
  if (question.integer && !Number.isInteger(n)) return 'Please enter a whole number.'
  const min = question.min ?? (question.type === 'number' ? undefined : 0)
  if (min !== undefined && n < min) return `Please enter a value of at least ${min}.`
  if (question.max !== undefined && n > question.max) return `Please enter a value no greater than ${question.max}.`
  return null
}

/** "Don't know" tick-box rendered beside numeric inputs when allowUnknown is set. */
function UnknownToggle({ checked, onToggle, disabled }: { checked: boolean; onToggle: (c: boolean) => void; disabled: boolean }) {
  return (
    <label className="unknown-toggle">
      <input type="checkbox" checked={checked} onChange={e => onToggle(e.target.checked)} disabled={disabled} />
      <span>Don&apos;t know</span>
    </label>
  )
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  idPrefix = '',
  disabled = false,
  allAnswers,
}: QuestionRendererProps) {
  const fieldId = `${idPrefix}${question.id}`
  const form = allAnswers ?? {}
  const visibleOptions: QuestionOption[] = (question.options ?? []).filter(
    o => !o.conditionalOn || matchesCondition(o.conditionalOn, form, form)
  )

  const renderLabel = () => (
    <label htmlFor={fieldId} className={`question-label ${question.type === 'radio' || question.type === 'checkbox' ? 'fieldset-legend' : ''}`}>
      <RichText text={question.label} />
      {question.required && <span className="required-mark" aria-label="required"> *</span>}
      {disabled && <span className="mirrored-badge" aria-label="auto-filled from PI details"> (auto-filled)</span>}
    </label>
  )

  const renderHelpText = () =>
    question.helpText ? (
      <span className="question-help"><RichText text={question.helpText} /></span>
    ) : null

  // -------------------------------------------------------------------------
  // heading — block heading with separator, used for conditional sub-sections
  // -------------------------------------------------------------------------
  if (question.type === 'heading') {
    return (
      <div className="question-block-heading">
        <h3 className="block-heading-text"><RichText text={question.label} /></h3>
        {question.helpText && <p className="block-heading-sub"><RichText text={question.helpText} /></p>}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // info — styled callout box
  // -------------------------------------------------------------------------
  if (question.type === 'info') {
    return (
      <div className="question-block info-callout" role="note">
        {question.label && <strong className="info-callout-title"><RichText text={question.label} /></strong>}
        {question.helpText && <p className="info-callout-text"><RichText text={question.helpText} /></p>}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // repeatable — delegate to RepeatableGroup
  // -------------------------------------------------------------------------
  if (question.type === 'repeatable') {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
    return (
      <div className="question-block">
        <div className="question-header">
          <span className="question-label">
            <RichText text={question.label} />
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </span>
          {renderHelpText()}
        </div>
        <RepeatableGroup
          question={question}
          rows={rows}
          onChange={onChange}
          allAnswers={allAnswers}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // radio
  // -------------------------------------------------------------------------
  if (question.type === 'radio') {
    const strVal = typeof value === 'string' ? value : ''
    return (
      <div className="question-block">
        <fieldset className="question-fieldset">
          <legend className="question-label">
            <RichText text={question.label} />
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </legend>
          {renderHelpText()}
          <div className="radio-group">
            {visibleOptions.map(opt => (
              <label key={opt.value} className={`radio-label${disabled ? ' input-disabled' : ''}`}>
                <input
                  type="radio"
                  name={fieldId}
                  value={opt.value}
                  checked={strVal === opt.value}
                  onChange={() => onChange(opt.value)}
                  disabled={disabled}
                />
                <span><RichText text={opt.label} /></span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // checkbox
  // -------------------------------------------------------------------------
  if (question.type === 'checkbox') {
    const arrVal = Array.isArray(value) ? (value as string[]) : []

    const handleCheckChange = (optValue: string, checked: boolean) => {
      const option = question.options?.find(o => o.value === optValue)
      if (option?.exclusive) {
        // Exclusive option: selecting it clears all others
        onChange(checked ? [optValue] : [])
        return
      }
      // Non-exclusive: remove any exclusive options that are currently selected
      const withoutExclusive = arrVal.filter(v => {
        const o = question.options?.find(op => op.value === v)
        return !o?.exclusive
      })
      if (checked) {
        onChange([...withoutExclusive, optValue])
      } else {
        onChange(withoutExclusive.filter(v => v !== optValue))
      }
    }

    return (
      <div className="question-block">
        <fieldset className="question-fieldset">
          <legend className="question-label">
            <RichText text={question.label} />
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </legend>
          {renderHelpText()}
          <div className={`checkbox-group${visibleOptions.length > 7 ? ' checkbox-group-wide' : ''}`}>
            {visibleOptions.map(opt => (
              <label key={opt.value} className="checkbox-label">
                <input
                  type="checkbox"
                  value={opt.value}
                  checked={arrVal.includes(opt.value)}
                  onChange={e => handleCheckChange(opt.value, e.target.checked)}
                />
                <span><RichText text={opt.label} /></span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // select (dropdown)
  // -------------------------------------------------------------------------
  if (question.type === 'select') {
    const strVal = typeof value === 'string' ? value : ''
    const options = [...(question.configOptions === 'queues' ? queueOptions() : []), ...visibleOptions]
    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <select
          id={fieldId}
          value={strVal}
          onChange={e => onChange(e.target.value)}
          className={`question-select${disabled ? ' input-disabled' : ''}`}
          required={question.required}
          disabled={disabled}
        >
          <option value="">— Select —</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {plainText(opt.label)}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // textarea
  // -------------------------------------------------------------------------
  if (question.type === 'textarea') {
    const strVal = typeof value === 'string' ? value : ''
    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <textarea
          id={fieldId}
          value={strVal}
          onChange={e => onChange(e.target.value)}
          placeholder={question.placeholder}
          className={`question-textarea${disabled ? ' input-disabled' : ''}`}
          required={question.required}
          rows={4}
          disabled={disabled}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // number — validated numeric input, optional unit label and Don't-know
  // -------------------------------------------------------------------------
  if (question.type === 'number') {
    const unknown = value === UNKNOWN
    const numVal: number | '' = typeof value === 'number' ? value : ''
    const error = numberError(question, numVal)
    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <div className="input-with-unit">
          <input
            id={fieldId}
            type="number"
            inputMode={question.integer ? 'numeric' : 'decimal'}
            step={question.integer ? 1 : 'any'}
            value={numVal}
            onChange={e => {
              const v = e.target.value
              onChange(v === '' ? undefined : Number(v))
            }}
            placeholder={question.placeholder}
            className={`question-input${disabled || unknown ? ' input-disabled' : ''}${error ? ' input-invalid' : ''}`}
            required={question.required}
            min={question.min}
            max={question.max}
            disabled={disabled || unknown}
            aria-invalid={!!error}
          />
          {question.unit && <span className="input-unit">{question.unit}</span>}
          {question.allowUnknown && (
            <UnknownToggle checked={unknown} onToggle={c => onChange(c ? UNKNOWN : undefined)} disabled={disabled} />
          )}
        </div>
        {error && <span className="question-error" role="alert">{error}</span>}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // quantity / duration — number + unit dropdown, stored as { value, unit }.
  // Normalised to base units (hours, GB) by the Apps Script on write.
  // -------------------------------------------------------------------------
  if (question.type === 'quantity' || question.type === 'duration') {
    const dimension = question.dimension ?? 'time'
    const units = question.units ?? (question.type === 'duration'
      ? ['seconds', 'minutes', 'hours', 'days']
      : DEFAULT_UNITS[dimension])
    const defaultUnit = question.defaultUnit ?? units[0]
    const unknown = value === UNKNOWN
    const qVal: QuantityValue = isQuantityValue(value) ? value : { value: '', unit: defaultUnit }
    const error = numberError(question, qVal.value)

    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <div className="duration-input">
          <input
            id={fieldId}
            type="number"
            inputMode="decimal"
            value={qVal.value}
            onChange={e => {
              const v = e.target.value
              onChange({ ...qVal, value: v === '' ? '' : Number(v) })
            }}
            min={question.min ?? 0}
            max={question.max}
            step="any"
            placeholder={question.placeholder ?? 'e.g. 30'}
            className={`question-input duration-number${disabled || unknown ? ' input-disabled' : ''}${error ? ' input-invalid' : ''}`}
            disabled={disabled || unknown}
            aria-invalid={!!error}
          />
          <select
            value={qVal.unit}
            onChange={e => onChange({ ...qVal, unit: e.target.value })}
            className={`question-select duration-unit${disabled || unknown ? ' input-disabled' : ''}`}
            disabled={disabled || unknown}
            aria-label={`${plainText(question.label)} — unit`}
          >
            {units.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          {question.allowUnknown && (
            <UnknownToggle checked={unknown} onToggle={c => onChange(c ? UNKNOWN : undefined)} disabled={disabled} />
          )}
        </div>
        {error && <span className="question-error" role="alert">{error}</span>}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // workloadRef — pick one of the names entered in another repeatable
  // -------------------------------------------------------------------------
  if (question.type === 'workloadRef') {
    const src = question.optionsFrom
    const rows = src && Array.isArray(allAnswers?.[src.questionId])
      ? (allAnswers![src.questionId] as Record<string, unknown>[])
      : []
    const names = rows
      .map(r => (typeof r[src!.labelField] === 'string' ? (r[src!.labelField] as string).trim() : ''))
      .filter(Boolean)
    const strVal = typeof value === 'string' ? value : ''
    const stale = strVal !== '' && !names.includes(strVal)
    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <select
          id={fieldId}
          value={strVal}
          onChange={e => onChange(e.target.value)}
          className={`question-select${disabled || names.length === 0 ? ' input-disabled' : ''}`}
          disabled={disabled || (names.length === 0 && !stale)}
        >
          <option value="">{names.length === 0 ? '— No codes entered in Section C yet —' : '— Select —'}</option>
          {names.map(n => <option key={n} value={n}>{n}</option>)}
          {stale && <option value={strVal}>{strVal} (no longer in the workload table)</option>}
        </select>
        {names.length === 0 && !question.helpText && (
          <span className="question-help">The codes you list in Section C (Your Workloads) appear here.</span>
        )}
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // text (default)
  // -------------------------------------------------------------------------
  const strVal = typeof value === 'string' ? value : ''
  return (
    <div className="question-block">
      {renderLabel()}
      {renderHelpText()}
      <input
        id={fieldId}
        type="text"
        value={strVal}
        onChange={e => onChange(e.target.value)}
        placeholder={question.placeholder}
        className={`question-input${disabled ? ' input-disabled' : ''}`}
        required={question.required}
        disabled={disabled}
      />
    </div>
  )
}
