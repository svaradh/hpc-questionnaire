/**
 * Code.gs — HPC Questionnaire Backend
 *
 * Script Properties (Project Settings → Script Properties):
 *   SPREADSHEET_ID      — ID of the Google Sheet
 *   COMMITTEE_FOLDER_ID — ID of the Drive folder for committee reports
 *   SUBMISSION_DEADLINE — ISO 8601 date-time string for submission window close
 *                         e.g. "2026-10-01T23:59:59+05:30"
 *                         Leave blank or absent to keep submissions open indefinitely.
 *
 * Admin: to close the submission window, set SUBMISSION_DEADLINE to a past date.
 * To reopen, set it to a future date or delete the property.
 */

var SPREADSHEET_ID      = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
var COMMITTEE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('COMMITTEE_FOLDER_ID');
var ALLOWED_DOMAIN      = 'iiserb.ac.in';
// The form's Google sign-in client ID (public: it is in the form's page). Sign-ins issued
// for any other app are refused. Must match VITE_GOOGLE_CLIENT_ID.
var GOOGLE_CLIENT_ID    = '310271046836-gfpnna8k72orhppi4ip7p7tcp0p9061m.apps.googleusercontent.com';

// ---------------------------------------------------------------------------
// Submission window helpers
// ---------------------------------------------------------------------------

function isSubmissionWindowOpen() {
  var deadline = PropertiesService.getScriptProperties().getProperty('SUBMISSION_DEADLINE');
  if (!deadline) return true;
  return new Date() < new Date(deadline);
}

function getSubmissionDeadline() {
  return PropertiesService.getScriptProperties().getProperty('SUBMISSION_DEADLINE') || null;
}

// ---------------------------------------------------------------------------
// Duplicate check
// ---------------------------------------------------------------------------

/**
 * Returns the existing submission ID for a PI email, or null if none found.
 */
function findExistingSubmissionByPiEmail(piEmail) {
  if (!piEmail) return null;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Submissions');
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var piEmailCol = headers.indexOf('pi_email');
  var submissionIdCol = headers.indexOf('submission_id');
  if (piEmailCol === -1 || submissionIdCol === -1) return null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][piEmailCol]).toLowerCase() === String(piEmail).toLowerCase()) {
      return String(data[i][submissionIdCol]);
    }
  }
  return null;
}

/**
 * Returns { submitterEmail, piEmail } of a submission (lower case), or null if
 * there is no such submission.
 */
function findSubmission(submissionId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Submissions');
  if (!sheet || sheet.getLastRow() < 2) return null;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('submission_id');
  var submitterCol = headers.indexOf('submitter_email');
  var piEmailCol = headers.indexOf('pi_email');
  if (idCol === -1) return null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(submissionId)) {
      return {
        submitterEmail: String(data[i][submitterCol] || '').toLowerCase(),
        piEmail:        String(data[i][piEmailCol] || '').toLowerCase()
      };
    }
  }
  return null;
}

/** Only the person who submitted, or the PI named in the submission, may replace it. */
function mayEdit(original, email) {
  var e = String(email || '').toLowerCase();
  return !!e && (e === original.submitterEmail || e === original.piEmail);
}

// ---------------------------------------------------------------------------
// Update support — delete existing rows and rewrite
// ---------------------------------------------------------------------------

function deleteRowsForSubmission(sheet, submissionId) {
  if (!sheet || sheet.getLastRow() < 2) return;
  var data = sheet.getDataRange().getValues();
  // Iterate bottom-up to avoid index shifting when deleting
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(submissionId)) {
      sheet.deleteRow(i + 1);
    }
  }
}

function deleteAllRowsForSubmission(submissionId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // Delete from all data sheets EXCEPT CommitteeAssessment (preserve committee notes)
  var sheetNames = dataSheetNames();
  sheetNames.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) deleteRowsForSubmission(sheet, submissionId);
  });
}

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------

/**
 * doPost — receives a questionnaire submission.
 *
 * Request body (JSON string):
 *   {
 *     credential:            string,   // Google ID token JWT
 *     answers:               object,   // flat answers from the React form
 *     questionnaireVersion:  string,
 *     editingSubmissionId?:  string    // present when editing an existing submission
 *   }
 *
 * Returns:
 *   { success: true, submissionId: string }
 *   { success: false, error: string }
 *   { success: false, duplicate: true, error: string }
 *   { success: false, windowClosed: true, deadline: string|null }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var credential           = body.credential;
    var answers              = body.answers || {};
    var questionnaireVersion = body.questionnaireVersion || '2.0.0';
    var editingSubmissionId  = body.editingSubmissionId || null;

    // --- Check submission window ---
    if (!isSubmissionWindowOpen()) {
      return jsonResponse({
        success: false,
        windowClosed: true,
        deadline: getSubmissionDeadline(),
        error: 'The submission window has closed. Please contact the HPC admin.'
      });
    }

    // --- Verify Google ID token ---
    var invalidCredential = { success: false, error: 'Invalid Google credential. Please sign in again and resubmit.' };
    if (!credential) return jsonResponse(invalidCredential);
    var tokenResponse = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential),
      { muteHttpExceptions: true }
    );
    if (tokenResponse.getResponseCode() !== 200) return jsonResponse(invalidCredential);

    var tokenInfo = JSON.parse(tokenResponse.getContentText());
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) return jsonResponse(invalidCredential);
    if (tokenInfo.hd !== ALLOWED_DOMAIN || String(tokenInfo.email_verified) !== 'true') {
      return jsonResponse({
        success: false,
        error: 'Access restricted to @' + ALLOWED_DOMAIN + ' accounts.'
      });
    }

    var submitterEmail = tokenInfo.email;
    var submitterName  = tokenInfo.name || submitterEmail;
    var piEmail        = answers['A_pi_email'] || '';

    // One submission at a time, so two cannot pass the duplicate check together
    // and an edit's delete-and-rewrite is not interleaved with another write.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return jsonResponse({ success: false, error: 'The server is busy. Please try again in a minute.' });
    }
    var submissionId;
    try {
      // --- Edit: only the submitter or the PI may replace a submission ---
      if (editingSubmissionId) {
        var original = findSubmission(editingSubmissionId);
        if (!original) {
          return jsonResponse({ success: false, error: 'Submission ' + editingSubmissionId + ' was not found. Please contact the HPC Users\' Committee.' });
        }
        if (!mayEdit(original, submitterEmail)) {
          return jsonResponse({
            success: false,
            error: 'A submission can be updated only by the person who submitted it or by its PI. ' +
                   'Please sign in with that account, or contact the HPC Users\' Committee.'
          });
        }
      }

      // --- Duplicate check (the existing ID is not returned: only its submitter or PI may edit it) ---
      var existingId = findExistingSubmissionByPiEmail(piEmail);
      if (existingId && existingId !== editingSubmissionId) {
        return jsonResponse({
          success: false,
          duplicate: true,
          error: 'A submission for this PI (' + piEmail + ') has already been received. To change it, use ' +
                 '"Edit your response" on the device it was submitted from, or ask the PI or the person who ' +
                 'submitted it. The confirmation email has the submission ID.'
        });
      }

      // --- Determine submission ID ---
      if (editingSubmissionId) {
        // Edit mode: delete existing rows and rewrite under the same ID
        submissionId = editingSubmissionId;
        deleteAllRowsForSubmission(submissionId);
      } else {
        var year = new Date().getFullYear();
        var uid  = Utilities.getUuid().substring(0, 8).toUpperCase();
        submissionId = 'HPC-' + year + '-' + uid;
      }

      // --- Write to sheets ---
      writeToSheets(submissionId, submitterEmail, submitterName, answers, questionnaireVersion);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // --- Send confirmation email (the submission is saved even if this fails) ---
    try {
      sendConfirmationEmail(submissionId, submitterEmail, submitterName, answers, !!editingSubmissionId);
    } catch (mailErr) {
      Logger.log('Confirmation email failed for ' + submissionId + ': ' + mailErr.message);
    }

    return jsonResponse({ success: true, submissionId: submissionId });

  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return jsonResponse({ success: false, error: err.message });
  }
}

/**
 * doGet — returns current window status and health check.
 * Called by the React form on load to check if submissions are open.
 */
function doGet(e) {
  return jsonResponse({
    status: 'ok',
    windowOpen: isSubmissionWindowOpen(),
    deadline: getSubmissionDeadline()
  });
}

// ---------------------------------------------------------------------------
// Custom menu
// ---------------------------------------------------------------------------
// This project is standalone (not bound to the response sheet), so it cannot add a
// menu to the sheet itself. The HPC Committee menu comes from a small script bound
// to the sheet that uses this project as a library: see apps-script/sheet-menu/.

// ---------------------------------------------------------------------------
// Email functions
// ---------------------------------------------------------------------------

function sendConfirmationEmail(submissionId, email, name, answers, isEdit) {
  var piEmail   = answers['A_pi_email']   || '';
  var piName    = answers['A_pi_name']    || 'Principal Investigator';
  var groupName = answers['A_group_name'] || 'your research group';
  var action    = isEdit ? 'updated' : 'received';
  var subject   = 'HPC Questionnaire — Submission ' + (isEdit ? 'Updated' : 'Received') + ' [' + submissionId + ']';

  var body = [
    'Dear ' + name + ',',
    '',
    'Thank you for ' + (isEdit ? 'updating' : 'completing') + ' the IISER HPC Workload Characterisation Questionnaire.',
    'Your submission has been ' + action + ' and recorded.',
    '',
    'Submission details:',
    '  Submission ID : ' + submissionId,
    '  Research group: ' + groupName,
    '  ' + (isEdit ? 'Updated' : 'Submitted') + ' at  : ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    '',
    'The HPC Users\' Committee will review your submission and may contact you',
    'if clarification is needed.',
    '',
    'This is an automated message. Please do not reply directly to this email.',
    '',
    'IISER HPC Users\' Committee',
    'Indian Institute of Science Education and Research Bhopal'
  ].join('\n');

  GmailApp.sendEmail(email, subject, body);

  if (piEmail && piEmail !== email) {
    var piBody = [
      'Dear ' + piName + ',',
      '',
      'A member of your research group (' + name + ', ' + email + ') has ' +
        (isEdit ? 'updated' : 'submitted') + ' the IISER HPC Workload Characterisation',
      'Questionnaire on behalf of ' + groupName + '.',
      '',
      'Submission ID : ' + submissionId,
      (isEdit ? 'Updated' : 'Submitted') + ' at  : ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      '',
      'The HPC Users\' Committee will review the submission and contact you',
      'if further information is needed.',
      '',
      'This is an automated message.',
      '',
      'IISER HPC Users\' Committee',
      'Indian Institute of Science Education and Research Bhopal'
    ].join('\n');
    GmailApp.sendEmail(piEmail, subject, piBody);
  }
}

function sendFollowUpEmail() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  if (sheet.getName() !== 'Submissions') {
    SpreadsheetApp.getUi().alert('Please select a row in the Submissions sheet first.');
    return;
  }
  var row = sheet.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('Please select a data row (not the header).'); return; }

  var headers        = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowData        = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var field          = function(name) { var c = headers.indexOf(name); return c === -1 ? '' : rowData[c]; };
  var submissionId   = field('submission_id');
  var submitterEmail = field('submitter_email');
  var submitterName  = field('submitter_name');
  var groupName      = field('group_name') || 'your research group';

  if (!submitterEmail) { SpreadsheetApp.getUi().alert('No submitter email found.'); return; }

  var ui     = SpreadsheetApp.getUi();
  var result = ui.prompt('Send Follow-up', 'Optional note to add:', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;

  var note    = result.getResponseText().trim();
  var subject = 'HPC Questionnaire Follow-up — ' + submissionId + ' — ' + groupName;
  var lines   = [
    'Dear ' + submitterName + ',',
    '',
    'Thank you for submitting the IISER HPC Workload Characterisation Questionnaire',
    '(Submission ID: ' + submissionId + ').',
    '',
    'The HPC Users\' Committee is reviewing your submission and would like to',
    'request some additional information or clarification.'
  ];
  if (note) { lines.push('', 'Note from the committee:', note); }
  lines = lines.concat(['', 'Please reply to this email at your earliest convenience.', '',
    'IISER HPC Users\' Committee', 'Indian Institute of Science Education and Research Bhopal']);

  GmailApp.sendEmail(submitterEmail, subject, lines.join('\n'));
  ui.alert('Follow-up email sent to ' + submitterEmail);
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
