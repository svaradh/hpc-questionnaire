/**
 * submitForm — posts a completed questionnaire to the Apps Script backend.
 * Content-Type: text/plain avoids a CORS preflight that Apps Script cannot handle.
 */

import { APPS_SCRIPT_URL } from '../config'

export interface SubmitResult {
  success: boolean
  submissionId?: string
  error?: string
  /** Set when the PI email already has a submission. */
  duplicate?: boolean
  existingSubmissionId?: string
  /** Set when the submission window is closed. */
  windowClosed?: boolean
  deadline?: string | null
}

export interface WindowStatus {
  windowOpen: boolean
  deadline: string | null
}

/** Checks whether the submission window is open (called on form load). */
export async function checkWindow(): Promise<WindowStatus> {
  if (!APPS_SCRIPT_URL) return { windowOpen: true, deadline: null }
  try {
    const res = await fetch(APPS_SCRIPT_URL, { method: 'GET' })
    const data = await res.json() as WindowStatus & { status: string }
    return { windowOpen: data.windowOpen ?? true, deadline: data.deadline ?? null }
  } catch {
    // If the check fails, allow submission — don't block on a network error
    return { windowOpen: true, deadline: null }
  }
}

export async function submitForm(
  answers: Record<string, unknown>,
  credential: string,
  questionnaireVersion = '1.1.0',
  editingSubmissionId?: string
): Promise<SubmitResult> {
  if (!APPS_SCRIPT_URL) {
    return { success: false, error: 'Submission endpoint not configured. Set VITE_APPS_SCRIPT_URL in .env.local.' }
  }
  try {
    const payload = JSON.stringify({ credential, answers, questionnaireVersion, editingSubmissionId })
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    })
    if (!response.ok) return { success: false, error: `Server returned HTTP ${response.status}. Please try again.` }
    return (await response.json()) as SubmitResult
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error. Please check your connection.' }
  }
}
