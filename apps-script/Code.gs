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
  // Delete from all sheets EXCEPT CommitteeAssessment (preserve committee notes)
  var sheetNames = [
    'Submissions', 'RespondentInfo', 'Workloads', 'JobSetups', 'RuntimeRecords',
    'WallTimeTerminations', 'CheckpointInfo', 'ScalingInfo', 'MemoryInfo',
    'GpuInfo', 'Throughput', 'EvidenceRecords', 'BenchmarkInfo',
    'WorkflowInfo', 'ServiceObservations'
  ];
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
 *   { success: false, duplicate: true, existingSubmissionId: string }
 *   { success: false, windowClosed: true, deadline: string|null }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var credential           = body.credential;
    var answers              = body.answers || {};
    var questionnaireVersion = body.questionnaireVersion || '1.1.0';
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
    var tokenResponse = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + credential,
      { muteHttpExceptions: true }
    );
    if (tokenResponse.getResponseCode() !== 200) {
      return jsonResponse({ success: false, error: 'Invalid Google credential. Please sign in again and resubmit.' });
    }

    var tokenInfo = JSON.parse(tokenResponse.getContentText());
    if (tokenInfo.hd !== ALLOWED_DOMAIN) {
      return jsonResponse({
        success: false,
        error: 'Access restricted to @' + ALLOWED_DOMAIN + ' accounts.'
      });
    }

    var submitterEmail = tokenInfo.email;
    var submitterName  = tokenInfo.name || submitterEmail;
    var piEmail        = answers['A_pi_email'] || '';

    // --- Duplicate check ---
    var existingId = findExistingSubmissionByPiEmail(piEmail);

    if (existingId && existingId !== editingSubmissionId) {
      // A submission already exists for this PI and this is not an edit of it
      return jsonResponse({
        success: false,
        duplicate: true,
        existingSubmissionId: existingId,
        error: 'A submission already exists for this PI (' + piEmail + '). Submission ID: ' + existingId
      });
    }

    // --- Determine submission ID ---
    var submissionId;
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

    // --- Send confirmation email ---
    sendConfirmationEmail(submissionId, submitterEmail, submitterName, answers, !!editingSubmissionId);

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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('HPC Committee')
    .addItem('📋 Generate Report for Selected Row', 'generateReportForSelected')
    .addItem('⚙️ Initialize Sheets', 'initializeSheets')
    .addSeparator()
    .addItem('📧 Send Follow-up to Selected', 'sendFollowUpEmail')
    .addToUi();
}

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

  var rowData        = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var submissionId   = rowData[0];
  var submitterEmail = rowData[3];
  var submitterName  = rowData[4];
  var groupName      = rowData[7] || 'your research group';

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
