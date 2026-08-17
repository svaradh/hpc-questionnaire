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
 *
 * The idPrefix prop allows sub-questions inside repeatable rows to
 * have unique DOM ids even though their question.id values are shared
 * across rows.
 */

import type { Question } from '../types/schema'
import { RepeatableGroup } from './RepeatableGroup'

interface QuestionRendererProps {
  question: Question
  value: unknown
  onChange: (value: unknown) => void
  idPrefix?: string
  /** When true, all inputs are rendered disabled with a visual indicator. */
  disabled?: boolean
}

export function QuestionRenderer({
  question,
  value,
  onChange,
  idPrefix = '',
  disabled = false,
}: QuestionRendererProps) {
  const fieldId = `${idPrefix}${question.id}`

  const renderLabel = () => (
    <label htmlFor={fieldId} className={`question-label ${question.type === 'radio' || question.type === 'checkbox' ? 'fieldset-legend' : ''}`}>
      {question.label}
      {question.required && <span className="required-mark" aria-label="required"> *</span>}
      {disabled && <span className="mirrored-badge" aria-label="auto-filled from PI details"> (auto-filled)</span>}
    </label>
  )

  const renderHelpText = () =>
    question.helpText ? (
      <span className="question-help">{question.helpText}</span>
    ) : null

  // -------------------------------------------------------------------------
  // info — styled callout box
  // -------------------------------------------------------------------------
  if (question.type === 'info') {
    return (
      <div className="question-block info-callout" role="note">
        {question.label && <strong className="info-callout-title">{question.label}</strong>}
        {question.helpText && <p className="info-callout-text">{question.helpText}</p>}
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
            {question.label}
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </span>
          {renderHelpText()}
        </div>
        <RepeatableGroup
          question={question}
          rows={rows}
          onChange={onChange}
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
            {question.label}
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </legend>
          {renderHelpText()}
          <div className="radio-group">
            {question.options?.map(opt => (
              <label key={opt.value} className={`radio-label${disabled ? ' input-disabled' : ''}`}>
                <input
                  type="radio"
                  name={fieldId}
                  value={opt.value}
                  checked={strVal === opt.value}
                  onChange={() => onChange(opt.value)}
                  disabled={disabled}
                />
                <span>{opt.label}</span>
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
            {question.label}
            {question.required && <span className="required-mark" aria-label="required"> *</span>}
          </legend>
          {renderHelpText()}
          <div className="checkbox-group">
            {question.options?.map(opt => (
              <label key={opt.value} className="checkbox-label">
                <input
                  type="checkbox"
                  value={opt.value}
                  checked={arrVal.includes(opt.value)}
                  onChange={e => handleCheckChange(opt.value, e.target.checked)}
                />
                <span>{opt.label}</span>
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
          {question.options?.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
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
  // number
  // -------------------------------------------------------------------------
  if (question.type === 'number') {
    const numVal = typeof value === 'number' ? value : ''
    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <div className="input-with-unit">
          <input
            id={fieldId}
            type="number"
            value={numVal === '' ? '' : numVal}
            onChange={e => {
              const v = e.target.value
              onChange(v === '' ? undefined : Number(v))
            }}
            placeholder={question.placeholder}
            className={`question-input${disabled ? ' input-disabled' : ''}`}
            required={question.required}
            min={question.min}
            max={question.max}
            disabled={disabled}
          />
          {question.unit && <span className="input-unit">{question.unit}</span>}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // duration — number input + unit dropdown, stored as { value, unit }
  // Normalised to hours by the Apps Script on write.
  // -------------------------------------------------------------------------
  if (question.type === 'duration') {
    const units = question.units ?? ['seconds', 'minutes', 'hours', 'days']
    const defaultUnit = question.defaultUnit ?? units[0]
    const durVal = (value != null && typeof value === 'object')
      ? (value as { value: number | ''; unit: string })
      : { value: '' as const, unit: defaultUnit }

    return (
      <div className="question-block">
        {renderLabel()}
        {renderHelpText()}
        <div className="duration-input">
          <input
            id={fieldId}
            type="number"
            value={durVal.value === '' ? '' : durVal.value}
            onChange={e => {
              const v = e.target.value
              onChange({ ...durVal, value: v === '' ? '' : Number(v) })
            }}
            min={0}
            step="any"
            placeholder="e.g. 30"
            className={`question-input duration-number${disabled ? ' input-disabled' : ''}`}
            disabled={disabled}
          />
          <select
            value={durVal.unit}
            onChange={e => onChange({ ...durVal, unit: e.target.value })}
            className={`question-select duration-unit${disabled ? ' input-disabled' : ''}`}
            disabled={disabled}
          >
            {units.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
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
