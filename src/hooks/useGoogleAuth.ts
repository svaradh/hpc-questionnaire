/**
 * useGoogleAuth — React hook for Google Identity Services (GIS) sign-in.
 *
 * Loads the GIS library (injected via <script> in index.html), initialises
 * it with the configured client_id, and exposes sign-in state.
 *
 * The hook verifies that the signed-in account belongs to @iiserb.ac.in
 * by inspecting the `hd` (hosted domain) claim in the JWT payload.
 * Server-side re-verification is performed in the Apps Script backend.
 */

import { useState, useEffect, useCallback } from 'react'
import { GOOGLE_CLIENT_ID } from '../config'

// ---------------------------------------------------------------------------
// Global type augmentation for the GIS library
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void
          renderButton: (element: HTMLElement, config: object) => void
          prompt: () => void
          disableAutoSelect: () => void
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleUser {
  email: string
  name: string
  /** Raw JWT credential from Google Identity Services. */
  credential: string
}

export interface GoogleAuthHook {
  user: GoogleUser | null
  isLoading: boolean
  isReady: boolean
  error: string | null
  signOut: () => void
}

// ---------------------------------------------------------------------------
// JWT payload decoder (client-side, for UX only)
// Full verification is performed server-side in Apps Script.
// ---------------------------------------------------------------------------

interface JwtPayload {
  email?: string
  name?: string
  hd?: string
  [key: string]: unknown
}

function decodeJwtPayload(jwt: string): JwtPayload | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    // Base64url → Base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const ALLOWED_DOMAIN = 'iiserb.ac.in'
const GIS_POLL_INTERVAL_MS = 200
const GIS_POLL_TIMEOUT_MS = 10_000

export function useGoogleAuth(): GoogleAuthHook {
  const [user, setUser] = useState<GoogleUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCredentialResponse = useCallback(
    (response: { credential: string }) => {
      const payload = decodeJwtPayload(response.credential)
      if (!payload) {
        setError('Unable to decode Google credential. Please try again.')
        return
      }

      if (payload.hd !== ALLOWED_DOMAIN) {
        setError(
          `Please sign in with your @${ALLOWED_DOMAIN} Google account. ` +
          `You signed in with ${payload.email ?? 'an unknown account'}.`
        )
        return
      }

      setError(null)
      setUser({
        email: payload.email ?? '',
        name: payload.name ?? payload.email ?? '',
        credential: response.credential,
      })
    },
    []
  )

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setIsLoading(false)
      setError('Google Client ID is not configured. See .env.local and DEPLOY.md.')
      return
    }

    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += GIS_POLL_INTERVAL_MS

      if (window.google?.accounts?.id) {
        clearInterval(timer)
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: false,
        })
        setIsReady(true)
        setIsLoading(false)
        return
      }

      if (elapsed >= GIS_POLL_TIMEOUT_MS) {
        clearInterval(timer)
        setIsLoading(false)
        setError(
          'Google Sign-In could not be loaded. ' +
          'Check your internet connection and reload the page.'
        )
      }
    }, GIS_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [handleCredentialResponse])

  const signOut = useCallback(() => {
    window.google?.accounts.id.disableAutoSelect()
    setUser(null)
    setError(null)
  }, [])

  return { user, isLoading, isReady, error, signOut }
}
