/**
 * Code.gs — HPC Questionnaire Backend
 * Main entry point for the Google Apps Script web app.
 *
 * Configuration is read from Script Properties (Project Settings → Script Properties):
 *   SPREADSHEET_ID      — ID of the Google Sheet to write data into
 *   COMMITTEE_FOLDER_ID — ID of the Drive folder for committee reports
 */

var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
var COMMITTEE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('COMMITTEE_FOLDER_ID');
var ALLOWED_DOMAIN = 'iiserb.ac.in';

// ---------------------------------------------------------------------------
// Web app entry points
// ---------------------------------------------------------------------------

/**
 * doPost — receives a questionnaire submission from the React form.
 *
 * Expected request body (JSON string):
 *   {
 *     credential: string,          // raw Google ID token JWT
 *     answers: Record<string, unknown>,
 *     questionnaireVersion: string
 *   }
 *
 * Steps:
 *   1. Parse the JSON body.
 *   2. Verify the Google ID token and check the domain.
 *   3. Generate a submission ID.
 *   4. Write data to the spreadsheet.
 *   5. Send a confirmation email.
 *   6. Return JSON with { success, submissionId }.
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var credential = body.credential;
    var answers = body.answers;
    var questionnaireVersion = body.questionnaireVersion || '1.1.0';

    // --- Verify Google ID token ---
    var tokenUrl = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + credential;
    var tokenResponse = UrlFetchApp.fetch(tokenUrl, { muteHttpExceptions: true });
    var tokenStatus = tokenResponse.getResponseCode();

    if (tokenStatus !== 200) {
      return jsonResponse({ success: false, error: 'Invalid Google credential. Please sign in again and resubmit.' });
    }

    var tokenInfo = JSON.parse(tokenResponse.getContentText());

    if (tokenInfo.hd !== ALLOWED_DOMAIN) {
      return jsonResponse({
        success: false,
        error: 'Access restricted. Please sign in with your @' + ALLOWED_DOMAIN + ' Google account.'
      });
    }

    var submitterEmail = tokenInfo.email;
    var submitterName = tokenInfo.name || submitterEmail;

    // --- Generate submission ID ---
    var year = new Date().getFullYear();
    var uid = Utilities.getUuid().substring(0, 8).toUpperCase();
    var submissionId = 'HPC-' + year + '-' + uid;

    // --- Write to sheets ---
    writeToSheets(submissionId, submitterEmail, submitterName, answers, questionnaireVersion);

    // --- Send confirmation email ---
    sendConfirmationEmail(submissionId, submitterEmail, submitterName, answers);

    return jsonResponse({ success: true, submissionId: submissionId });

  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return jsonResponse({ success: false, error: err.message });
  }
}

/**
 * doGet — health check endpoint.
 * Visit the web app URL in a browser to verify it is deployed correctly.
 */
function doGet(e) {
  return jsonResponse({ status: 'ok', message: 'HPC Questionnaire API' });
}

// ---------------------------------------------------------------------------
// Custom menu (appears in the spreadsheet UI)
// ---------------------------------------------------------------------------

/**
 * onOpen — adds the "HPC Committee" menu to the spreadsheet.
 * Runs automatically when the spreadsheet is opened.
 */
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

/**
 * sendConfirmationEmail — sends a confirmation to the submitter and PI.
 *
 * @param {string} submissionId
 * @param {string} email       - submitter's email
 * @param {string} name        - submitter's display name
 * @param {Object} answers     - flat answers object from the form
 */
function sendConfirmationEmail(submissionId, email, name, answers) {
  var piEmail = answers['A_pi_email'] || '';
  var piName = answers['A_pi_name'] || 'Principal Investigator';
  var groupName = answers['A_group_name'] || 'your research group';

  var subject = 'HPC Questionnaire — Submission Received [' + submissionId + ']';

  var body = [
    'Dear ' + name + ',',
    '',
    'Thank you for completing the IISER HPC Workload Characterisation Questionnaire.',
    'Your submission has been received and recorded.',
    '',
    'Submission details:',
    '  Submission ID : ' + submissionId,
    '  Research group: ' + groupName,
    '  Submitted at  : ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    '',
    'Please keep your submission ID for reference. The HPC Users\' Committee will',
    'review your submission and may contact you if clarification is needed.',
    '',
    'What happens next:',
    '  1. The committee will review all submissions.',
    '  2. If information is incomplete or unclear, a member may contact you',
    '     for a brief follow-up.',
    '  3. The committee\'s QoS recommendations will be communicated to the PI',
    '     (' + piName + ') once the review process is complete.',
    '',
    'If you need to update your submission or have questions, please contact',
    'the HPC facility team.',
    '',
    'This is an automated message. Please do not reply directly to this email.',
    '',
    'IISER HPC Users\' Committee',
    'Indian Institute of Science Education and Research Bhopal'
  ].join('\n');

  // Send to submitter
  GmailApp.sendEmail(email, subject, body);

  // Send copy to PI if different from submitter
  if (piEmail && piEmail !== email) {
    var piBody = [
      'Dear ' + piName + ',',
      '',
      'A member of your research group (' + name + ', ' + email + ') has submitted',
      'the IISER HPC Workload Characterisation Questionnaire on behalf of ' + groupName + '.',
      '',
      'Submission ID : ' + submissionId,
      'Submitted at  : ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      '',
      'The HPC Users\' Committee will review the submission and contact you',
      'if further information is needed.',
      '',
      'This is an automated message. Please do not reply directly to this email.',
      '',
      'IISER HPC Users\' Committee',
      'Indian Institute of Science Education and Research Bhopal'
    ].join('\n');

    GmailApp.sendEmail(piEmail, subject, piBody);
  }
}

/**
 * sendFollowUpEmail — prompts committee member for a note, then emails
 * the submitter of the selected row.
 * Called from the HPC Committee menu in the spreadsheet.
 */
function sendFollowUpEmail() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  if (sheet.getName() !== 'Submissions') {
    SpreadsheetApp.getUi().alert('Please select a row in the Submissions sheet first.');
    return;
  }

  var row = sheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please select a data row (not the header).');
    return;
  }

  var rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  // Submissions columns: submission_id(1) | submitted_at(2) | submitter_email(3) | submitter_name(4)
  //                       | pi_name(5) | pi_email(6) | group_name(7)
  var submissionId = rowData[0];
  var submitterEmail = rowData[2];
  var submitterName = rowData[3];
  var groupName = rowData[6] || 'your research group';

  if (!submitterEmail) {
    SpreadsheetApp.getUi().alert('No submitter email found in this row.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt(
    'Send Follow-up Email',
    'Add a custom note to the follow-up email (leave blank for the default message):',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  var customNote = result.getResponseText().trim();

  var subject = 'HPC Questionnaire Follow-up — ' + submissionId + ' — ' + groupName;
  var body = [
    'Dear ' + submitterName + ',',
    '',
    'Thank you for submitting the IISER HPC Workload Characterisation Questionnaire',
    '(Submission ID: ' + submissionId + ').',
    '',
    'The HPC Users\' Committee is reviewing your submission and would like to',
    'request some additional information or clarification.'
  ];

  if (customNote) {
    body.push('');
    body.push('Note from the committee:');
    body.push(customNote);
  }

  body = body.concat([
    '',
    'Please reply to this email with the requested information at your earliest',
    'convenience.',
    '',
    'Thank you for your cooperation.',
    '',
    'IISER HPC Users\' Committee',
    'Indian Institute of Science Education and Research Bhopal'
  ]);

  GmailApp.sendEmail(submitterEmail, subject, body.join('\n'));
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
