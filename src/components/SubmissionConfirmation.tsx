/**
 * SubmissionConfirmation — shown after a successful submission or update.
 * Replaces the form with a confirmation card.
 */

interface SubmissionConfirmationProps {
  submissionId: string
  piEmail: string
  groupName: string
  isEdit: boolean
  onEdit: () => void
  /** Opens the printable copy of the answers; absent when the copy is not available. */
  onPrint?: () => void
}

export function SubmissionConfirmation({
  submissionId,
  piEmail,
  groupName,
  isEdit,
  onEdit,
  onPrint,
}: SubmissionConfirmationProps) {
  return (
    <div className="submission-confirmation">
      <div className="confirmation-card">
        <div className="confirmation-icon" aria-hidden="true">&#10003;</div>

        <h1 className="confirmation-heading">
          {isEdit ? 'Submission updated' : 'Submission received'}
        </h1>

        {groupName && (
          <p className="confirmation-subheading">
            Thank you, <strong>{groupName}</strong>.
          </p>
        )}

        <div className="submission-id-label">Your submission reference number:</div>
        <div className="submission-id-box" title="Submission ID">{submissionId}</div>
        <p className="confirmation-hint">Please save this reference number for your records.</p>

        <p className="confirmation-email-note">
          A confirmation email with a summary of the answers has been sent to you
          {piEmail ? <> and to the PI (<strong>{piEmail}</strong>)</> : null}.
        </p>

        <p className="confirmation-record-note">
          Your response has been saved to the IISER HPC Users' Committee records.
        </p>

        <div className="confirmation-next">
          <h2 className="confirmation-next-heading">What happens next</h2>
          <ul className="confirmation-next-list">
            <li>The HPC Users' Committee will review your submission alongside those from all other research groups.</li>
            <li>If any information is incomplete or unclear, a committee member may contact you for a brief follow-up.</li>
            <li>The committee's Quality-of-Service recommendations will be communicated to the PI once the review process is complete.</li>
          </ul>
        </div>

        <div className="confirmation-actions">
          {onPrint && (
            <button type="button" className="btn-confirmation btn-download" onClick={onPrint}>
              Save or print your answers (PDF)
            </button>
          )}
          <button type="button" className="btn-confirmation btn-reset" onClick={onEdit}>
            Edit your response
          </button>
        </div>
      </div>
    </div>
  )
}
