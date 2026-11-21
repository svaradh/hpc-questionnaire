/**
 * Setup.gs — one-time setup of a backend whose script project is attached to its
 * response sheet. Used by the handover pipeline (tools/handover/, docs/HANDOVER.md),
 * which uploads this file with Code.gs, SheetWriter.gs, ReportGenerator.gs and
 * BoundMenu.gs. Not for the standalone v3 project.
 *
 * The new owner runs setupBackend once from the script editor (Run). The first run
 * shows Google's permission screen. It then:
 *   1. points SPREADSHEET_ID at the sheet this project is attached to;
 *   2. creates the committee reports folder (COMMITTEE_FOLDER_ID), unless it exists;
 *   3. creates every tab with its headers (initializeSheets) and removes the empty "Sheet1";
 *   4. writes a test submission through the same code as a real one, checks that
 *      every tab has its row, and deletes it again, so the sheet is left empty;
 *   5. sends a test email to the owner.
 * Safe to run again: it reuses the folder and rewrites the headers only.
 */

var SETUP_REPORTS_FOLDER_NAME = 'HPC Committee Reports';

function setupBackend() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run setupBackend in the script project attached to the response sheet.');
  var props = PropertiesService.getScriptProperties();
  var me = Session.getEffectiveUser().getEmail();

  // 1. Sheet
  props.setProperty('SPREADSHEET_ID', ss.getId());
  SPREADSHEET_ID = ss.getId();

  // 2. Reports folder
  var folder = null;
  var folderId = props.getProperty('COMMITTEE_FOLDER_ID');
  if (folderId) {
    try { folder = DriveApp.getFolderById(folderId); if (folder.isTrashed()) folder = null; } catch (err) { folder = null; }
  }
  if (!folder) {
    folder = DriveApp.createFolder(SETUP_REPORTS_FOLDER_NAME);
    props.setProperty('COMMITTEE_FOLDER_ID', folder.getId());
  }
  COMMITTEE_FOLDER_ID = folder.getId();

  // 3. Tabs
  initializeSheets();
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  // 4. Test submission, written and removed again
  var testId = 'SETUP-TEST-' + Utilities.getUuid().substring(0, 8).toUpperCase();
  var allTabs = dataSheetNames().concat(['CommitteeAssessment']);
  // One code that opens every follow-up panel and one queue entry, so every tab gets a row.
  writeToSheets(testId, me, 'Setup test', {
    A_group_name: 'Setup test (removed automatically)',
    A_pi_email: me,
    W_workloads: [{
      _panels: ['W_blk_long', 'W_blk_scaling', 'W_blk_memory', 'W_blk_gpu', 'W_blk_scratch'],
      W_cores: '4', W_walltime: { value: 2, unit: 'hours' }, W_jobs_year: '10'
    }],
    Q_records: [{}]
  }, 'setup-test');
  SpreadsheetApp.flush();
  var missing = allTabs.filter(function(name) { return !hasRowFor(name, testId); });
  deleteAllRowsForSubmission(testId);
  deleteRowsForSubmission(ss.getSheetByName('CommitteeAssessment'), testId);
  SpreadsheetApp.flush();
  var left = allTabs.filter(function(name) { return hasRowFor(name, testId); });
  if (missing.length) throw new Error('Setup test: the test submission was not written to: ' + missing.join(', '));
  if (left.length) throw new Error('Setup test: the test submission could not be removed from: ' + left.join(', '));

  // 5. Email
  GmailApp.sendEmail(me, 'HPC Questionnaire: backend set up',
    [
      'The HPC questionnaire backend in your Google account is set up.',
      '',
      'Response sheet: ' + ss.getUrl(),
      'Reports folder: ' + folder.getUrl(),
      '',
      'Only you can open these until you share them.',
      'This email confirms that the backend can send the questionnaire\'s confirmation emails.'
    ].join('\n'));

  props.setProperty('SETUP_COMPLETED_AT', new Date().toISOString());
  Logger.log('Setup complete. Sheet: ' + ss.getUrl() + ' Folder: ' + folder.getUrl());
}
