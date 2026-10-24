/**
 * config.ts — runtime configuration sourced from Vite environment variables.
 *
 * Set these in .env.local before running `npm run dev` or `npm run build`:
 *
 *   VITE_APPS_SCRIPT_URL    — Google Apps Script web app URL
 *   VITE_GOOGLE_CLIENT_ID   — OAuth 2.0 Client ID from Google Cloud Console
 *
 * See apps-script/DEPLOY.md for setup instructions.
 */

export const APPS_SCRIPT_URL =
  (import.meta.env.VITE_APPS_SCRIPT_URL as string) ?? ''

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ?? ''

/** When "true", the Submit button is disabled (layout-only preview builds). */
export const SUBMIT_DISABLED =
  (import.meta.env.VITE_SUBMIT_DISABLED as string | undefined) === 'true'
