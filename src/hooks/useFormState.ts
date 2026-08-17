/**
 * useFormState — localStorage-backed form state hook.
 *
 * Stores all answers as a flat Record<questionId, unknown> under the
 * key 'hpc_questionnaire_draft' in localStorage.
 *
 * For repeatable questions the value is an array of row objects:
 *   Array<Record<subQuestionId, unknown>>
 *
 * The draft is auto-saved on every answer change.
 */

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'hpc_questionnaire_draft'

export interface FormStateHook {
  answers: Record<string, unknown>
  setAnswer: (questionId: string, value: unknown) => void
  clearAll: () => void
  lastSaved: Date | null
}

function loadFromStorage(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

function saveToStorage(answers: Record<string, unknown>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(answers))
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded, etc.)
    // Silently degrade — the in-memory state is still functional.
  }
}

export function useFormState(): FormStateHook {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => loadFromStorage())
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Persist to localStorage whenever answers change.
  useEffect(() => {
    saveToStorage(answers)
    setLastSaved(new Date())
  }, [answers])

  const setAnswer = useCallback((questionId: string, value: unknown) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }))
  }, [])

  const clearAll = useCallback(() => {
    setAnswers({})
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setLastSaved(null)
  }, [])

  return { answers, setAnswer, clearAll, lastSaved }
}
