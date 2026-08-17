/**
 * submitForm — posts a completed questionnaire to the Apps Script backend.
 *
 * The payload is sent as Content-Type: text/plain to avoid a CORS preflight
 * request, which Apps Script does not handle for cross-origin POST requests.
 *
 * The backend verifies the Google ID token, writes data to Google Sheets,
 * and sends a confirmation email before returning the submissionId.
 */

import { APPS_SCRIPT_URL } from '../config'

export interface SubmitResult {
  success: boolean
  submissionId?: string
  error?: string
}

/**
 * @param answers              - flat Record<questionId, unknown> from the form
 * @param credential           - raw Google ID token JWT from GIS
 * @param questionnaireVersion - schema version string (default: "1.1.0")
 */
export async function submitForm(
  answers: Record<string, unknown>,
  credential: string,
  questionnaireVersion = '1.1.0'
): Promise<SubmitResult> {
  if (!APPS_SCRIPT_URL) {
    return {
      success: false,
      error:
        'Submission endpoint is not configured. ' +
        'Please set VITE_APPS_SCRIPT_URL in .env.local.',
    }
  }

  try {
    const payload = JSON.stringify({ credential, answers, questionnaireVersion })

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // Must be text/plain to avoid a CORS preflight that Apps Script cannot handle.
      headers: { 'Content-Type': 'text/plain' },
      body: payload,
    })

    if (!response.ok) {
      return {
        success: false,
        error: `Server returned HTTP ${response.status}. Please try again.`,
      }
    }

    const result = (await response.json()) as SubmitResult
    return result
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Network error. Please check your connection and try again.',
    }
  }
}
