/**
 * AnswersPrintout — a printable copy of a submission, in the form's own wording.
 *
 * Shown after submitting (and from the "previous submission" banner). It walks the
 * questionnaire with the same visibility rules as the form, so it lists exactly the
 * questions the respondent saw and answered: sections, repeatable entries (codes),
 * their panels, "don't know these details" and "same answers as" choices. The browser's
 * print dialog saves it as a PDF; nothing is generated on or sent to a server.
 */

import { useEffect } from 'react'
import type { Question, QuestionnaireSchema, Section } from '../types/schema'
import { plainText } from '../utils/glossary'
import {
  entryHeading, isSectionNotAware, isSectionVisible, openRowDetails,
  questionVisible, rowsOf, sameAsSource, usesSameAs,
} from '../utils/conditions'
import { UNKNOWN, isQuantityValue } from '../utils/quantity'
import { queueOptions } from '../config/clusterConfig'

type Answers = Record<string, unknown>

const DONT_KNOW = "Don't know"
const SKIP: Question['type'][] = ['info', 'heading', 'addButton']

/** The answer as the respondent would recognise it, or null when there is none. */
export function formatAnswer(q: Question, v: unknown): string | null {
  if (v === undefined || v === null || v === '' || v === false) return null
  if (v === UNKNOWN) return DONT_KNOW
  const optionLabel = (value: string) => {
    const opts = [...(q.configOptions === 'queues' ? queueOptions() : []), ...(q.options ?? [])]
    const o = opts.find(o => o.value === value)
    return o ? plainText(o.label) : value === UNKNOWN ? DONT_KNOW : value.replace(/_/g, ' ')
  }
  switch (q.type) {
    case 'radio':
    case 'select':
      return optionLabel(String(v))
    case 'checkbox': {
      const vs = (Array.isArray(v) ? v : [v]).map(String)
      if (vs.length === 0) return null
      // Keep the form's option order.
      const order = (q.options ?? []).map(o => o.value)
      vs.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999))
      return vs.map(optionLabel).join('; ')
    }
    case 'number':
      return `${String(v)}${q.unit ? ' ' + q.unit : ''}`
    case 'duration':
    case 'quantity':
      if (isQuantityValue(v)) {
        if (v.value === '' || v.value === null || v.value === undefined) return null
        return `${v.value} ${v.unit}`
      }
      return String(v)
    default:
      if (typeof v === 'object') return null
      return String(v)
  }
}

function Item({ q, value }: { q: Question; value: unknown }) {
  const text = formatAnswer(q, value)
  if (text === null) return null
  return (
    <div className="printout-item">
      <dt>{plainText(q.label)}</dt>
      <dd>{text}</dd>
    </div>
  )
}

/** The visible, answered simple questions of one scope (the form, or one entry's row). */
const answeredItems = (questions: Question[], scope: Answers, form: Answers) =>
  questions.filter(q => !SKIP.includes(q.type) && q.type !== 'block' && q.type !== 'repeatable'
    && q.type !== 'rowDetails' && questionVisible(q, scope, form) && formatAnswer(q, scope[q.id]) !== null)

const NoAnswers = () => <p className="printout-note">No answers given here.</p>

function Items({ questions, scope, form }: { questions: Question[]; scope: Answers; form: Answers }) {
  const answered = answeredItems(questions, scope, form)
  return answered.length
    ? <dl className="printout-list">{answered.map(q => <Item key={q.id} q={q} value={scope[q.id]} />)}</dl>
    : null
}

function Block({ block, repeatable, rows, rowIndex, form }: {
  block: Question; repeatable: Question; rows: Answers[]; rowIndex: number; form: Answers
}) {
  const row = rows[rowIndex] ?? {}
  let body
  if (usesSameAs(block, repeatable, rows, rowIndex, form)) {
    const j = sameAsSource(block, repeatable, rows, rowIndex, form)!
    body = <p className="printout-note">Same answers as {entryHeading(repeatable, rows[j] ?? {}, j)}.</p>
  } else if (block.notAwareOption && row[block.notAwareOption.questionId] === true) {
    body = <p className="printout-note">{plainText(block.notAwareOption.label)}</p>
  } else if (answeredItems(block.questions ?? [], row, form).length) {
    body = <Items questions={block.questions ?? []} scope={row} form={form} />
  } else {
    body = <NoAnswers />
  }
  return (
    <div className="printout-block">
      <h4>{plainText(block.label)}</h4>
      {body}
    </div>
  )
}

function Repeatable({ q, form }: { q: Question; form: Answers }) {
  const rows = rowsOf(form, q.id)
  if (rows.length === 0) return null
  const subs = q.subQuestions ?? []
  return (
    <div className="printout-repeatable">
      <h3>{plainText(q.label)}</h3>
      {rows.map((row, i) => (
        <div key={i} className="printout-entry">
          <h4 className="printout-entry-title">{entryHeading(q, row ?? {}, i)}</h4>
          <Items questions={subs} scope={row ?? {}} form={form} />
          {subs.filter(s => s.type === 'block')
            .filter(b => questionVisible(b, row ?? {}, form))
            .map(b => <Block key={b.id} block={b} repeatable={q} rows={rows} rowIndex={i} form={form} />)}
        </div>
      ))}
    </div>
  )
}

/** A 'rowDetails' question: for each entry that opens its panels, the entry's name and those panels. */
function RowDetailsPrint({ q, source, form }: { q: Question; source: Question; form: Answers }) {
  const rows = rowsOf(form, source.id)
  const open = openRowDetails(q, form)
  if (open.length === 0) return null
  return (
    <div className="printout-repeatable">
      {open.map(({ rowIndex, blocks }) => (
        <div key={rowIndex} className="printout-entry">
          <h4 className="printout-entry-title">{entryHeading(source, rows[rowIndex] ?? {}, rowIndex)}</h4>
          {blocks.map(b => <Block key={b.id} block={b} repeatable={source} rows={rows} rowIndex={rowIndex} form={form} />)}
        </div>
      ))}
    </div>
  )
}

/** Whether a visible section has anything to print: answers, entries or opened panels. */
function sectionHasContent(section: Section, form: Answers): boolean {
  if (answeredItems(section.questions, form, form).length) return true
  return section.questions.some(q =>
    (q.type === 'repeatable' && questionVisible(q, form) && rowsOf(form, q.id).length > 0)
    || (q.type === 'rowDetails' && openRowDetails(q, form).length > 0))
}

function SectionPrint({ section, form, byId }: { section: Section; form: Answers; byId: Map<string, Question> }) {
  if (!isSectionVisible(section, form)) return null
  let body
  if (isSectionNotAware(section, form)) {
    body = <p className="printout-note">{plainText(section.notAwareOption!.label)}</p>
  } else if (!sectionHasContent(section, form)) {
    body = <NoAnswers />
  } else {
    body = (
      <>
        <Items questions={section.questions} scope={form} form={form} />
        {section.questions
          .filter(q => q.type === 'repeatable' && questionVisible(q, form))
          .map(q => <Repeatable key={q.id} q={q} form={form} />)}
        {section.questions
          .filter(q => q.type === 'rowDetails' && q.rowsOf && byId.get(q.rowsOf))
          .map(q => <RowDetailsPrint key={q.id} q={q} source={byId.get(q.rowsOf!)!} form={form} />)}
      </>
    )
  }
  return (
    <section className="printout-section">
      <h2>{plainText(section.title)}</h2>
      {body}
    </section>
  )
}

interface AnswersPrintoutProps {
  schema: QuestionnaireSchema
  answers: Answers
  submissionId: string
  submittedAt?: string
  onClose: () => void
  /** Open the print dialog once when shown. */
  autoPrint?: boolean
}

export function AnswersPrintout({ schema, answers, submissionId, submittedAt, onClose, autoPrint = true }: AnswersPrintoutProps) {
  const group = String(answers['A_group_name'] ?? '')
  // The default file name of "Save as PDF" is the page title.
  useEffect(() => {
    const before = document.title
    document.title = `HPC questionnaire - ${group || 'answers'} - ${submissionId}`
    let t: number | undefined
    if (autoPrint) t = window.setTimeout(() => window.print(), 300)
    return () => { document.title = before; if (t) window.clearTimeout(t) }
  }, [group, submissionId, autoPrint])

  const byId = new Map(schema.sections.flatMap(s => s.questions).map(q => [q.id, q] as [string, Question]))
  const pi = [answers['A_pi_salutation'], answers['A_pi_name']].filter(Boolean).join(' ')
  const piLine = [pi, String(answers['A_pi_email'] ?? '')].filter(Boolean).join(', ')
  const when = submittedAt ? new Date(submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''

  return (
    <div className="printout">
      <div className="printout-toolbar">
        <button type="button" className="btn-confirmation" onClick={() => window.print()}>Print or save as PDF</button>
        <button type="button" className="btn-confirmation btn-reset" onClick={onClose}>Back</button>
        <span className="printout-hint">In the print dialog, choose "Save as PDF" as the destination to keep a copy.</span>
      </div>
      <header className="printout-header">
        <h1>{plainText(schema.title)}</h1>
        <p className="printout-subtitle">Your answers, as submitted</p>
        <dl className="printout-list printout-meta">
          <div className="printout-item"><dt>Submission ID</dt><dd>{submissionId}</dd></div>
          {group && <div className="printout-item"><dt>Research group</dt><dd>{group}</dd></div>}
          {piLine && <div className="printout-item"><dt>PI</dt><dd>{piLine}</dd></div>}
          {when && <div className="printout-item"><dt>Submitted</dt><dd>{when}</dd></div>}
          <div className="printout-item"><dt>Form version</dt><dd>{schema.version}</dd></div>
        </dl>
        <p className="printout-note">
          A copy for your records. "Don't know" is a valid answer. To change an answer, open the form in the
          browser used to submit and choose "Edit your response".
        </p>
      </header>
      {schema.sections.map(s => <SectionPrint key={s.id} section={s} form={answers} byId={byId} />)}
    </div>
  )
}
