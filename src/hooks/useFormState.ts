/**
 * useFormState — localStorage-backed form state hook.
 *
 * Draft answers are stored under 'hpc_questionnaire_v3_draft'.
 * After a successful submission, the submission is stored under
 * 'hpc_questionnaire_v3_submitted' so the user can return to edit it
 * on the same device.
 */

import { SUBMIT_DISABLED } from '../config/env'
import { useState, useCallback, useEffect } from 'react'

// Versioned keys: a v1/v2 draft on the same device is not loaded into the v3 form.
// Layout-only builds (submitting disabled) keep their own draft, so trying one
// does not mix answers with the real form served from the same site.
const KEY_SUFFIX    = SUBMIT_DISABLED ? '_layout' : ''
const DRAFT_KEY     = 'hpc_questionnaire_v3_draft' + KEY_SUFFIX
const SUBMITTED_KEY = 'hpc_questionnaire_v3_submitted' + KEY_SUFFIX

export interface SubmittedRecord {
  submissionId: string
  answers: Record<string, unknown>
  submittedAt: string
}

export interface FormStateHook {
  answers: Record<string, unknown>
  setAnswer: (questionId: string, value: unknown) => void
  clearAll: () => void
  lastSaved: Date | null
  /** Previous submission stored on this device, if any. */
  previousSubmission: SubmittedRecord | null
  /** Loads a previous submission into the form for editing. */
  loadForEditing: (record: SubmittedRecord) => void
  /** Saves a completed submission to localStorage. */
  saveSubmission: (submissionId: string, answers: Record<string, unknown>) => void
  /** Clears the stored submission (e.g. after window closes). */
  clearSubmission: () => void
}

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
}

function remove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function useFormState(): FormStateHook {
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    () => load<Record<string, unknown>>(DRAFT_KEY) ?? {}
  )
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [previousSubmission, setPreviousSubmission] = useState<SubmittedRecord | null>(
    () => load<SubmittedRecord>(SUBMITTED_KEY)
  )

  useEffect(() => {
    save(DRAFT_KEY, answers)
    setLastSaved(new Date())
  }, [answers])

  const setAnswer = useCallback((questionId: string, value: unknown) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }, [])

  const clearAll = useCallback(() => {
    setAnswers({})
    remove(DRAFT_KEY)
    setLastSaved(null)
  }, [])

  const saveSubmission = useCallback((submissionId: string, submittedAnswers: Record<string, unknown>) => {
    const record: SubmittedRecord = {
      submissionId,
      answers: submittedAnswers,
      submittedAt: new Date().toISOString(),
    }
    save(SUBMITTED_KEY, record)
    setPreviousSubmission(record)
  }, [])

  const loadForEditing = useCallback((record: SubmittedRecord) => {
    setAnswers(record.answers)
    save(DRAFT_KEY, record.answers)
    setLastSaved(new Date())
  }, [])

  const clearSubmission = useCallback(() => {
    remove(SUBMITTED_KEY)
    setPreviousSubmission(null)
  }, [])

  return { answers, setAnswer, clearAll, lastSaved, previousSubmission, loadForEditing, saveSubmission, clearSubmission }
}
