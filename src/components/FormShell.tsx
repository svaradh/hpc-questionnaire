/**
 * FormShell — outer wrapper for the questionnaire UI.
 *
 * Handles:
 * - Section navigation and progress tracking
 * - Google Sign-In
 * - Submission window check (on mount via doGet)
 * - Required-field validation before submit (all visible sections, incl. repeatable entries)
 * - Duplicate submission detection (PI email)
 * - Same-device edit mode (loads previous submission from localStorage)
 * - Post-submit confirmation screen with "Edit your response"
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { QuestionnaireSchema } from '../types/schema'
import { SectionRenderer } from './SectionRenderer'
import { GlossaryContext, GlossaryList } from './RichText'
import { indexGlossary } from '../utils/glossary'
import { SUBMIT_DISABLED } from '../config/env'
import { isSectionVisible, isSectionNotAware, answersForSubmission, isAnswered, missingRequired } from '../utils/conditions'
import type { MissingAnswer } from '../utils/conditions'
import { GoogleSignIn } from './GoogleSignIn'
import { SubmissionConfirmation } from './SubmissionConfirmation'
import { useGoogleAuth } from '../hooks/useGoogleAuth'
import { submitForm, checkWindow } from '../utils/submitForm'
import type { SubmittedRecord } from '../hooks/useFormState'

interface FormShellProps {
  schema: QuestionnaireSchema
  answers: Record<string, unknown>
  onAnswer: (questionId: string, value: unknown) => void
  onClearAll: () => void
  lastSaved: Date | null
  previousSubmission: SubmittedRecord | null
  onLoadForEditing: (record: SubmittedRecord) => void
  onSaveSubmission: (submissionId: string, answers: Record<string, unknown>) => void
}

function sectionProgress(
  section: QuestionnaireSchema['sections'][number],
  answers: Record<string, unknown>
): { answered: number; total: number } {
  const required = section.questions.filter(q => q.required && q.type !== 'info')
  // A "not aware" declaration answers the whole section.
  if (isSectionNotAware(section, answers)) return { answered: required.length, total: required.length }
  const answered = required.filter(q => isAnswered(answers[q.id]))
  return { answered: answered.length, total: required.length }
}


export function FormShell({
  schema,
  answers,
  onAnswer,
  onClearAll,
  lastSaved,
  previousSubmission,
  onLoadForEditing,
  onSaveSubmission,
}: FormShellProps) {
  const { user, isReady, error: authError, signOut } = useGoogleAuth()
  const buttonContainerRef = useRef<HTMLDivElement>(null)

  // Submission state
  const [isSubmitting, setIsSubmitting]     = useState(false)
  const [submissionResult, setSubmissionResult] = useState<{ submissionId: string; isEdit: boolean } | null>(null)
  const [submitError, setSubmitError]       = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<MissingAnswer[]>([])

  // Edit mode — set when user chooses to edit a previous submission
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null)

  // Window status
  const [windowOpen, setWindowOpen]   = useState(true)
  const [windowDeadline, setWindowDeadline] = useState<string | null>(null)

  const glossaryIndex = useMemo(() => indexGlossary(schema.glossary), [schema.glossary])
  const [showGlossary, setShowGlossary] = useState(false)

  // Section navigation
  const visibleSections = useMemo(
    () => schema.sections.filter(s => isSectionVisible(s, answers)),
    [schema.sections, answers]
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const safeIndex = Math.min(currentIndex, visibleSections.length - 1)
  const currentSection = visibleSections[safeIndex]

  const totalRequired = useMemo(
    () => visibleSections.reduce((sum, s) => sum + sectionProgress(s, answers).total, 0),
    [visibleSections, answers]
  )
  const totalAnswered = useMemo(
    () => visibleSections.reduce((sum, s) => sum + sectionProgress(s, answers).answered, 0),
    [visibleSections, answers]
  )
  const overallPct = totalRequired > 0 ? Math.round((totalAnswered / totalRequired) * 100) : 0

  // Check submission window on mount
  useEffect(() => {
    checkWindow().then(status => {
      setWindowOpen(status.windowOpen)
      setWindowDeadline(status.deadline)
    })
  }, [])

  // Render GIS button when ready
  useEffect(() => {
    if (isReady && !user && buttonContainerRef.current) {
      window.google?.accounts.id.renderButton(buttonContainerRef.current, {
        theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular',
      })
    }
  }, [isReady, user])

  const handleNav = (index: number) => {
    setCurrentIndex(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const formatSaved = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Load previous submission for editing
  const handleEditPrevious = useCallback(() => {
    if (!previousSubmission) return
    onLoadForEditing(previousSubmission)
    setEditingSubmissionId(previousSubmission.submissionId)
    setSubmissionResult(null)
    setCurrentIndex(0)
  }, [previousSubmission, onLoadForEditing])

  // Submit / update
  const handleSubmit = async () => {
    if (!user) return

    // Validate required fields
    const missing = missingRequired(schema.sections, answers)
    if (missing.length > 0) {
      setValidationErrors(missing)
      // Jump to the first section with a missing answer
      const firstIndex = visibleSections.findIndex(s => s.id === missing[0].sectionId)
      if (firstIndex >= 0) handleNav(firstIndex)
      return
    }
    setValidationErrors([])

    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitForm(
      answersForSubmission(schema.sections, answers),
      user.credential,
      schema.version,
      editingSubmissionId ?? undefined
    )
    setIsSubmitting(false)

    if (result.success && result.submissionId) {
      const isEdit = !!editingSubmissionId
      onSaveSubmission(result.submissionId, answers)
      setEditingSubmissionId(result.submissionId)
      setSubmissionResult({ submissionId: result.submissionId, isEdit })
      onClearAll()
    } else if (result.duplicate && result.existingSubmissionId) {
      setSubmitError(
        `A submission already exists for this PI (${String(answers['A_pi_email'] ?? '')}).` +
        ` Existing submission ID: ${result.existingSubmissionId}.` +
        ` If you want to update it, use the "Edit your response" option.`
      )
    } else if (result.windowClosed) {
      setWindowOpen(false)
      setWindowDeadline(result.deadline ?? null)
    } else {
      setSubmitError(result.error ?? 'Submission failed. Please try again.')
    }
  }

  const handleDownload = () => {
    const snapshot = submissionResult ? answers : answers
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hpc-submission-${submissionResult?.submissionId ?? 'draft'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Post-submission confirmation ──────────────────────────────────────────
  if (submissionResult) {
    return (
      <SubmissionConfirmation
        submissionId={submissionResult.submissionId}
        piEmail={String(answers['A_pi_email'] ?? '')}
        groupName={String(answers['A_group_name'] ?? '')}
        isEdit={submissionResult.isEdit}
        onEdit={handleEditPrevious}
        onDownload={handleDownload}
      />
    )
  }

  // ── Main form UI ──────────────────────────────────────────────────────────
  return (
    <GlossaryContext.Provider value={glossaryIndex}>
    <div className="form-shell">
      {/* Header */}
      <header className="form-header">
        <div className="form-header-inner">
          <h1 className="form-title">{schema.title}</h1>
          <p className="form-subtitle">IISER HPC Users' Committee — QoS Workload Characterisation</p>
          <GoogleSignIn
            user={user}
            error={authError}
            isReady={isReady}
            onSignOut={signOut}
            buttonContainerRef={buttonContainerRef}
          />
        </div>
      </header>

      {/* Core notice */}
      <div className="core-notice" role="note">
        <strong>Core principle: </strong>{schema.coreNotice}
        {(schema.glossary?.length ?? 0) > 0 && (
          <p className="glossary-hint">
            Underlined terms show a short definition when you point at or tap them.{' '}
            <button type="button" className="link-button" onClick={() => setShowGlossary(v => !v)} aria-expanded={showGlossary}>
              {showGlossary ? 'Hide the list of terms' : 'See all terms used in this form'}
            </button>
          </p>
        )}
        {showGlossary && schema.glossary && <GlossaryList entries={schema.glossary} />}
      </div>

      {SUBMIT_DISABLED && (
        <div className="window-closed-banner" role="note">
          <strong>Layout preview.</strong> This copy of the form is for checking how it looks; submitting is turned off.
        </div>
      )}

      {/* Submission window closed banner */}
      {!windowOpen && (
        <div className="window-closed-banner" role="alert">
          <strong>Submissions are closed.</strong>
          {windowDeadline && (
            <> The submission window closed on {new Date(windowDeadline).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.</>
          )}
          {' '}Please contact the HPC administrator if you believe this is an error.
        </div>
      )}

      {/* Edit-mode banner — previous submission found on this device */}
      {previousSubmission && !editingSubmissionId && windowOpen && (
        <div className="edit-banner" role="note">
          <span>
            A previous submission was found on this device —{' '}
            <strong>{previousSubmission.submissionId}</strong>
            {' '}(submitted {new Date(previousSubmission.submittedAt).toLocaleDateString('en-IN')}).
          </span>
          <button type="button" className="btn-edit-previous" onClick={handleEditPrevious}>
            Edit your response
          </button>
        </div>
      )}

      {/* Edit-mode indicator */}
      {editingSubmissionId && (
        <div className="edit-mode-indicator" role="note">
          Editing submission <strong>{editingSubmissionId}</strong> — your changes will replace the previous response when you submit.
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="validation-banner" role="alert">
          <strong>Please answer the following before submitting. Ticking "Don't know" counts as an answer.</strong>
          <ul className="validation-list">
            {validationErrors.map((e, i) => (
              <li key={i}>
                <button type="button" className="link-button" onClick={() => {
                  const idx = visibleSections.findIndex(s => s.id === e.sectionId)
                  if (idx >= 0) handleNav(idx)
                }}>Section {e.sectionId}</button>: {e.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Progress bar */}
      <div className="progress-bar-container">
        <div className="progress-bar-track">
          <div
            className="progress-bar-fill"
            style={{ width: `${overallPct}%` }}
            role="progressbar"
            aria-valuenow={overallPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <span className="progress-label">
          {totalAnswered} / {totalRequired} required fields answered ({overallPct}%)
        </span>
        {lastSaved && (
          <span className="autosave-label">Draft auto-saved at {formatSaved(lastSaved)}</span>
        )}
      </div>

      {/* Main content */}
      <div className="form-content">
        <nav className="section-nav" aria-label="Questionnaire sections">
          <ul className="section-nav-list">
            {visibleSections.map((section, index) => {
              const prog = sectionProgress(section, answers)
              const isActive   = index === safeIndex
              const isComplete = prog.total > 0 && prog.answered === prog.total
              return (
                <li key={section.id} className="section-nav-item">
                  <button
                    type="button"
                    className={['section-nav-btn', isActive ? 'active' : '', isComplete ? 'complete' : ''].filter(Boolean).join(' ')}
                    onClick={() => handleNav(index)}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <span className="nav-section-id">{section.id}</span>
                    <span className="nav-section-title">{section.title.replace(/^[A-Z]\d*\.\s*/, '')}</span>
                    {prog.total > 0 && (
                      <span className="nav-section-progress">{prog.answered}/{prog.total}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <main className="section-panel" role="main">
          {currentSection && (
            <>
              <div className="section-heading">
                <h2 className="section-title">{currentSection.title}</h2>
                <span className="section-counter">Section {safeIndex + 1} of {visibleSections.length}</span>
              </div>

              <SectionRenderer key={currentSection.id} section={currentSection} answers={answers} onAnswer={onAnswer} />

              <div className="section-nav-buttons">
                <button type="button" className="btn-nav btn-prev" onClick={() => safeIndex > 0 && handleNav(safeIndex - 1)} disabled={safeIndex === 0}>
                  &larr; Previous
                </button>
                <span className="section-position">{safeIndex + 1} / {visibleSections.length}</span>
                {safeIndex < visibleSections.length - 1 ? (
                  <button type="button" className="btn-nav btn-next" onClick={() => handleNav(safeIndex + 1)}>
                    Next &rarr;
                  </button>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="btn-nav btn-submit"
                      onClick={handleSubmit}
                      disabled={SUBMIT_DISABLED || !user || isSubmitting || !windowOpen}
                      title={
                        !windowOpen ? 'Submissions are closed' :
                        !user ? 'Sign in with your @iiserb.ac.in account to submit' : undefined
                      }
                    >
                      {isSubmitting ? 'Submitting…' : !user ? 'Sign in to submit' : !windowOpen ? 'Submissions closed' : editingSubmissionId ? 'Update submission' : 'Submit'}
                    </button>
                    {submitError && <p className="submit-error" role="alert">{submitError}</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="form-footer">
        <div className="form-footer-inner">
          <span>IISER HPC Workload Questionnaire v{schema.version}</span>
          <button
            type="button"
            className="btn-clear"
            onClick={() => {
              if (window.confirm('Clear all answers and start over? This cannot be undone.')) {
                onClearAll()
                setEditingSubmissionId(null)
                setCurrentIndex(0)
                setValidationErrors([])
              }
            }}
          >
            Clear all answers
          </button>
        </div>
      </footer>
    </div>
    </GlossaryContext.Provider>
  )
}
