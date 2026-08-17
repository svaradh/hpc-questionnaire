/**
 * FormShell — outer wrapper for the questionnaire UI.
 *
 * Responsibilities:
 * - Displays the form title, core philosophy notice, and progress.
 * - Renders the section navigation sidebar (desktop) / tab bar (mobile).
 * - Evaluates section-level conditional visibility.
 * - Controls current section state and Prev/Next navigation.
 * - Shows the auto-save status.
 * - Manages Google Sign-In and form submission.
 * - Shows a post-submit confirmation screen.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import type { QuestionnaireSchema } from '../types/schema'
import { SectionRenderer } from './SectionRenderer'
import { GoogleSignIn } from './GoogleSignIn'
import { SubmissionConfirmation } from './SubmissionConfirmation'
import { useGoogleAuth } from '../hooks/useGoogleAuth'
import { submitForm } from '../utils/submitForm'

interface FormShellProps {
  schema: QuestionnaireSchema
  answers: Record<string, unknown>
  onAnswer: (questionId: string, value: unknown) => void
  onClearAll: () => void
  lastSaved: Date | null
}

/**
 * Determine whether a section's conditionalOn predicate is satisfied.
 * If a section has no conditionalOn, it is always visible.
 */
function isSectionVisible(
  section: QuestionnaireSchema['sections'][number],
  answers: Record<string, unknown>
): boolean {
  if (!section.conditionalOn) return true
  const { questionId, values } = section.conditionalOn
  const val = answers[questionId]
  if (Array.isArray(val)) {
    return (val as string[]).some(v => values.includes(v))
  }
  if (typeof val === 'string') {
    return values.includes(val)
  }
  return false
}

/**
 * Count how many required questions in a section have been answered.
 */
function sectionProgress(
  section: QuestionnaireSchema['sections'][number],
  answers: Record<string, unknown>
): { answered: number; total: number } {
  const required = section.questions.filter(
    q => q.required && q.type !== 'info'
  )
  const answered = required.filter(q => {
    const v = answers[q.id]
    if (v === undefined || v === null || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
  return { answered: answered.length, total: required.length }
}

export function FormShell({
  schema,
  answers,
  onAnswer,
  onClearAll,
  lastSaved,
}: FormShellProps) {
  // --- Auth ---
  const { user, isReady, error: authError, signOut } = useGoogleAuth()

  // --- Submission state ---
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<{ submissionId: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Ref passed to GIS so it can inject the sign-in button
  const buttonContainerRef = useRef<HTMLDivElement>(null)

  // --- Section navigation ---
  const visibleSections = useMemo(
    () => schema.sections.filter(s => isSectionVisible(s, answers)),
    [schema.sections, answers]
  )

  const [currentIndex, setCurrentIndex] = useState(0)

  // Clamp current index when sections change (conditional visibility)
  const safeIndex = Math.min(currentIndex, visibleSections.length - 1)
  const currentSection = visibleSections[safeIndex]

  const totalRequired = useMemo(
    () =>
      visibleSections.reduce(
        (sum, s) => sum + sectionProgress(s, answers).total,
        0
      ),
    [visibleSections, answers]
  )
  const totalAnswered = useMemo(
    () =>
      visibleSections.reduce(
        (sum, s) => sum + sectionProgress(s, answers).answered,
        0
      ),
    [visibleSections, answers]
  )

  const overallPct =
    totalRequired > 0 ? Math.round((totalAnswered / totalRequired) * 100) : 0

  // --- Render the GIS button when library is ready and user is not signed in ---
  useEffect(() => {
    if (isReady && !user && buttonContainerRef.current) {
      window.google?.accounts.id.renderButton(buttonContainerRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
      })
    }
  }, [isReady, user])

  // --- Navigation handlers ---
  const handleNav = (index: number) => {
    setCurrentIndex(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handlePrev = () => {
    if (safeIndex > 0) handleNav(safeIndex - 1)
  }

  const handleNext = () => {
    if (safeIndex < visibleSections.length - 1) handleNav(safeIndex + 1)
  }

  const formatSaved = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // --- Submit handler ---
  const handleSubmit = async () => {
    if (!user) return
    setIsSubmitting(true)
    setSubmitError(null)

    const result = await submitForm(answers, user.credential)
    setIsSubmitting(false)

    if (result.success && result.submissionId) {
      setSubmissionResult({ submissionId: result.submissionId })
      // Clear the localStorage draft after a successful submission
      onClearAll()
    } else {
      setSubmitError(result.error ?? 'Submission failed. Please try again.')
    }
  }

  // --- Download handler ---
  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(answers, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hpc-submission-${submissionResult?.submissionId ?? 'draft'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- Reset handler (after submission) ---
  const handleReset = () => {
    setSubmissionResult(null)
    setSubmitError(null)
    setCurrentIndex(0)
  }

  // -------------------------------------------------------------------------
  // Post-submission confirmation screen
  // -------------------------------------------------------------------------
  if (submissionResult) {
    return (
      <SubmissionConfirmation
        submissionId={submissionResult.submissionId}
        piEmail={String(answers['A_pi_email'] ?? '')}
        groupName={String(answers['A_group_name'] ?? '')}
        onReset={handleReset}
        onDownload={handleDownload}
      />
    )
  }

  // -------------------------------------------------------------------------
  // Main form UI
  // -------------------------------------------------------------------------
  return (
    <div className="form-shell">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <header className="form-header">
        <div className="form-header-inner">
          <h1 className="form-title">{schema.title}</h1>
          <p className="form-subtitle">IISER HPC Users' Committee — QoS Workload Characterisation</p>

          {/* Google Sign-In area sits in the header */}
          <GoogleSignIn
            user={user}
            error={authError}
            isReady={isReady}
            onSignOut={signOut}
            buttonContainerRef={buttonContainerRef}
          />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Core notice banner                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="core-notice" role="note">
        <strong>Core principle: </strong>
        {schema.coreNotice}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Progress bar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="progress-bar-container" aria-label={`Form progress: ${overallPct}% of required questions answered`}>
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
          <span className="autosave-label">
            Draft auto-saved at {formatSaved(lastSaved)}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main content: sidebar nav + section                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="form-content">
        {/* Section navigation */}
        <nav className="section-nav" aria-label="Questionnaire sections">
          <ul className="section-nav-list">
            {visibleSections.map((section, index) => {
              const prog = sectionProgress(section, answers)
              const isActive = index === safeIndex
              const isComplete = prog.total > 0 && prog.answered === prog.total

              return (
                <li key={section.id} className="section-nav-item">
                  <button
                    type="button"
                    className={[
                      'section-nav-btn',
                      isActive ? 'active' : '',
                      isComplete ? 'complete' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleNav(index)}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <span className="nav-section-id">{section.id}</span>
                    <span className="nav-section-title">{section.title.replace(/^[A-N]\.\s*/, '')}</span>
                    {prog.total > 0 && (
                      <span className="nav-section-progress">
                        {prog.answered}/{prog.total}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Section panel */}
        <main className="section-panel" role="main">
          {currentSection && (
            <>
              <div className="section-heading">
                <h2 className="section-title">{currentSection.title}</h2>
                <span className="section-counter">
                  Section {safeIndex + 1} of {visibleSections.length}
                </span>
              </div>

              <SectionRenderer
                section={currentSection}
                answers={answers}
                onAnswer={onAnswer}
              />

              {/* Section navigation buttons */}
              <div className="section-nav-buttons">
                <button
                  type="button"
                  className="btn-nav btn-prev"
                  onClick={handlePrev}
                  disabled={safeIndex === 0}
                >
                  &larr; Previous
                </button>

                <span className="section-position">
                  {safeIndex + 1} / {visibleSections.length}
                </span>

                {safeIndex < visibleSections.length - 1 ? (
                  <button
                    type="button"
                    className="btn-nav btn-next"
                    onClick={handleNext}
                  >
                    Next &rarr;
                  </button>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="btn-nav btn-submit"
                      onClick={handleSubmit}
                      disabled={!user || isSubmitting}
                      title={!user ? 'Sign in with your @iiserb.ac.in account to submit' : undefined}
                    >
                      {isSubmitting
                        ? 'Submitting…'
                        : !user
                          ? 'Sign in to submit'
                          : 'Submit'}
                    </button>

                    {submitError && (
                      <p className="submit-error" role="alert">
                        {submitError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                               */}
      {/* ------------------------------------------------------------------ */}
      <footer className="form-footer">
        <div className="form-footer-inner">
          <span>IISER HPC Workload Questionnaire v{schema.version}</span>
          <button
            type="button"
            className="btn-clear"
            onClick={() => {
              if (window.confirm('Clear all answers and start over? This cannot be undone.')) {
                onClearAll()
                setCurrentIndex(0)
              }
            }}
          >
            Clear all answers
          </button>
        </div>
      </footer>
    </div>
  )
}
