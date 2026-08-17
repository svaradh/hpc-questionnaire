/**
 * SubmissionConfirmation — shown after a successful submission.
 *
 * Replaces the entire form UI with a confirmation card that shows:
 *   - The submission ID (in a copyable monospace box)
 *   - Confirmation that an email has been sent
 *   - What happens next
 *   - Buttons to start a new submission or download a copy of the answers
 */

interface SubmissionConfirmationProps {
  submissionId: string
  piEmail: string
  groupName: string
  onReset: () => void
  onDownload: () => void
}

export function SubmissionConfirmation({
  submissionId,
  piEmail,
  groupName,
  onReset,
  onDownload,
}: SubmissionConfirmationProps) {
  return (
    <div className="submission-confirmation">
      <div className="confirmation-card">
        {/* Success icon */}
        <div className="confirmation-icon" aria-hidden="true">
          &#10003;
        </div>

        <h1 className="confirmation-heading">Submission received</h1>

        {groupName && (
          <p className="confirmation-subheading">
            Thank you, <strong>{groupName}</strong>.
          </p>
        )}

        {/* Submission ID */}
        <div className="submission-id-label">Your submission reference number:</div>
        <div className="submission-id-box" title="Submission ID">
          {submissionId}
        </div>
        <p className="confirmation-hint">
          Please save this reference number for your records.
        </p>

        {/* Email confirmation */}
        {piEmail && (
          <p className="confirmation-email-note">
            A confirmation email has been sent to{' '}
            <strong>{piEmail}</strong>.
          </p>
        )}

        <p className="confirmation-record-note">
          Your response has been saved to the IISER HPC Users' Committee records.
        </p>

        {/* What happens next */}
        <div className="confirmation-next">
          <h2 className="confirmation-next-heading">What happens next</h2>
          <ul className="confirmation-next-list">
            <li>
              The HPC Users' Committee will review your submission alongside
              those from all other research groups.
            </li>
            <li>
              If any information is incomplete or unclear, a committee member
              may contact you for a brief follow-up.
            </li>
            <li>
              The committee's Quality-of-Service recommendations will be
              communicated to the PI once the review process is complete.
            </li>
          </ul>
        </div>

        {/* Action buttons */}
        <div className="confirmation-actions">
          <button
            type="button"
            className="btn-confirmation btn-download"
            onClick={onDownload}
          >
            Download a copy
          </button>
          <button
            type="button"
            className="btn-confirmation btn-reset"
            onClick={onReset}
          >
            Submit another response
          </button>
        </div>
      </div>
    </div>
  )
}
