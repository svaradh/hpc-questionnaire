/**
 * GoogleSignIn — displays the Google Sign-In button or the signed-in user state.
 *
 * When the user is not signed in, this component renders a container <div>
 * whose ref is passed to Google Identity Services so GIS can inject the
 * styled sign-in button into the DOM.
 *
 * When the user is signed in, it shows their name/email and a sign-out button.
 */

import type { RefObject } from 'react'
import type { GoogleUser } from '../hooks/useGoogleAuth'

interface GoogleSignInProps {
  user: GoogleUser | null
  error: string | null
  isReady: boolean
  onSignOut: () => void
  buttonContainerRef: RefObject<HTMLDivElement>
}

export function GoogleSignIn({
  user,
  error,
  isReady,
  onSignOut,
  buttonContainerRef,
}: GoogleSignInProps) {
  // GIS script still loading — render nothing to avoid layout shift
  if (!isReady && !user) return null

  if (user) {
    return (
      <div className="google-signin-area">
        <span className="google-user-info">
          Signed in as <strong>{user.name}</strong> ({user.email})
        </span>
        <button
          type="button"
          className="btn-sign-out"
          onClick={onSignOut}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="google-signin-area">
      <div>
        {/* GIS renders the button into this div */}
        <div ref={buttonContainerRef} />
        <p className="google-signin-hint">
          Sign in with your @iiserb.ac.in account to submit
        </p>
        {error && (
          <p className="google-signin-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
