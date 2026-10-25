/**
 * ReportGenerator.gs — creates a formatted Google Doc per submission.
 *
 * Called from the "HPC Committee" menu → "Generate Report for Selected Row".
 * The selected row must be in the Submissions sheet.
 *
 * The generated document is placed in COMMITTEE_FOLDER_ID (Drive folder).
 */

// ---------------------------------------------------------------------------
// Menu handler
// ---------------------------------------------------------------------------

/**
 * generateReportForSelected — entry point from the custom menu.
 * Reads the submission_id from the selected row of the Submissions sheet,
 * then generates a formatted committee report document.
 */
function generateReportForSelected() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  if (sheet.getName() !== 'Submissions') {
    SpreadsheetApp.getUi().alert(
      'Please switch to the Submissions tab and select the row you want to report on.'
    );
    return;
  }

  var row = sheet.getActiveRange().getRow();
  if (row < 2) {
    SpreadsheetApp.getUi().alert('Please select a data row (not the header row).');
    return;
  }

  var submissionId = sheet.getRange(row, 1).getValue();
  if (!submissionId) {
    SpreadsheetApp.getUi().alert('No submission ID found in the selected row (column A).');
    return;
  }

  var docUrl = generateReport(String(submissionId));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Report created: ' + docUrl,
    'Report Generated',
    10
  );
}

// ---------------------------------------------------------------------------
// Core report generator (schema 2.4.0)
// ---------------------------------------------------------------------------

/**
 * Report sections, in order. Each names a tab from SHEET_DEFINITIONS
 * (SheetWriter.gs); its columns are rendered with readable labels, empty
 * fields skipped. Repeatable tabs render one sub-table per entry, titled by
 * `titleCol`. Cluster comparisons and triage suggestions are in the analysis
 * notebooks (analysis/04–06), which read the cluster configuration.
 */
var REPORT_SECTIONS = [
  { tab: 'Group',          title: 'A — About the group' },
  { tab: 'Experience',     title: 'B — HPC experience (any system)' },
  { tab: 'Workloads',      title: 'C — Workloads (with D: how the jobs are organised)', titleCol: 'code' },
  { tab: 'LongJobs',       title: 'D — Long runs', titleCol: 'code' },
  { tab: 'Scaling',        title: 'D — Running on more cores', titleCol: 'code' },
  { tab: 'Memory',         title: 'D — Memory', titleCol: 'code' },
  { tab: 'Gpu',            title: 'D — GPU details', titleCol: 'code' },
  { tab: 'Scratch',        title: 'D — Files and scratch', titleCol: 'code' },
  { tab: 'StorageTesting', title: 'E — Home area, testing and interactive use' },
  { tab: 'Queue',          title: 'F — Queue and turnaround', titleCol: 'queue' },
  { tab: 'Closing',        title: 'G — Growth and closing' }
];

/** Columns computed by the sheet writer rather than answered (shown in italics). */
var DERIVED_COLUMNS = ['core_hours_year_max', 'core_hours_year_unconstrained_max', 'gpu_hours_year_max', 'peak_concurrent_cores',
                       'peak_concurrent_gpus', 'peak_concurrent_scratch_gb', 'chain_queue_overhead_h', 'long_queue_overhead_h',
                       'evidence_level', 'not_aware_sections', 'panels'];

/** "walltime_h" -> "Walltime (h)", "mem_node_gb" -> "Mem node (GB)". */
function readableLabel(col) {
  var unit = '';
  var m = col.match(/_(h|gb|pct|tb)$/);
  if (m) {
    unit = { h: ' (h)', gb: ' (GB)', pct: ' (%)', tb: ' (TB)' }[m[1]];
    col = col.slice(0, -m[0].length);
  }
  var words = col.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1) + unit;
}

function readableValue(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v === 'dont_know') return "Don't know";
  if (v === true || v === 'true' || v === 'TRUE') return 'Yes';
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-IN') : String(Math.round(v * 100) / 100);
  return String(v).replace(/_/g, ' ');
}

/** [label, value] pairs for the non-empty answer columns of a row. */
function rowPairs(def, row) {
  return def.columns
    .filter(function(c) { return readableValue(row[c[0]]) !== ''; })
    .map(function(c) {
      var label = readableLabel(c[0]) + (DERIVED_COLUMNS.indexOf(c[0]) >= 0 ? ' — computed' : '');
      return [label, readableValue(row[c[0]])];
    });
}

/**
 * generateReport — builds a Google Doc with everything one group submitted,
 * plus the values the sheet writer computed from it.
 *
 * @param  {string} submissionId
 * @return {string} URL of the created document
 */
function generateReport(submissionId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sub = getFirstRowForSubmission(ss, 'Submissions', submissionId);
  var groupName = sub ? sub['group_name'] || '(not provided)' : '(not provided)';
  var piName = sub ? sub['pi_name'] || '(not provided)' : '(not provided)';

  var doc = DocumentApp.create('HPC Report — ' + groupName + ' — ' + submissionId);
  var body = doc.getBody();
  if (COMMITTEE_FOLDER_ID) {
    var file = DriveApp.getFileById(doc.getId());
    DriveApp.getFolderById(COMMITTEE_FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  var titlePara = body.appendParagraph('HPC WORKLOAD CHARACTERISATION — COMMITTEE REPORT');
  titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(groupName + ' — ' + piName).setBold(true);
  body.appendParagraph(
    'Submission ' + submissionId +
    (sub ? '   |   submitted ' + sub['submitted_at'] + '   |   questionnaire v' + sub['questionnaire_version'] : '') +
    '   |   generated ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  ).setItalic(true);
  body.appendParagraph(
    'This report lists the facts the group provided and values computed from them (marked "computed"). ' +
    'Quantities are in hours and GB. "Don\'t know" is a valid answer and is not a negative finding. ' +
    'Yearly totals ("max") are upper bounds: each code\'s entry describes its heaviest job. ' +
    'Comparisons with cluster limits and suggested triage categories are in the analysis notebooks (04–06).'
  ).setItalic(true);

  REPORT_SECTIONS.forEach(function(sec) {
    var def = SHEET_DEFINITIONS.filter(function(d) { return d.name === sec.tab; })[0];
    if (!def) return;
    var rows = getRowsForSubmission(ss, sec.tab, submissionId);
    var isRows = def.source !== 'top';
    if (isRows && rows.length === 0) return;      // follow-up not triggered or not answered
    appendHeading2(body, sec.title);
    if (!isRows) {
      var pairs = rows.length ? rowPairs(def, rows[0]) : [];
      if (pairs.length) appendTwoColTable(body, pairs);
      else body.appendParagraph('No answers.').setItalic(true);
      return;
    }
    rows.forEach(function(row) {
      appendHeading3(body, readableValue(row[sec.titleCol]) || ('Entry ' + row['entry_index']));
      var pairs = rowPairs(def, row).filter(function(p) { return p[0] !== readableLabel(sec.titleCol); });
      if (pairs.length) appendTwoColTable(body, pairs);
    });
  });

  // Committee notes, if any have been entered
  var ca = getFirstRowForSubmission(ss, 'CommitteeAssessment', submissionId);
  if (ca && (ca['triage_category'] || ca['findings'])) {
    appendHeading2(body, 'Committee assessment');
    appendTwoColTable(body, [
      ['Triage category', ca['triage_category'] || ''], ['Assessor', ca['assessor'] || ''],
      ['Findings', ca['findings'] || ''], ['Follow-up', ca['follow_up_notes'] || '']
    ]);
  }

  doc.saveAndClose();
  return doc.getUrl();
}

// ---------------------------------------------------------------------------
// Data retrieval helpers
// ---------------------------------------------------------------------------

/**
 * Returns all rows from a sheet where column A matches submissionId.
 * Each row is returned as a plain object keyed by the header row values.
 *
 * @param {Spreadsheet} ss
 * @param {string}      sheetName
 * @param {string}      submissionId
 * @return {Object[]}
 */
function getRowsForSubmission(ss, sheetName, submissionId) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(submissionId)) {
      var obj = {};
      headers.forEach(function(h, colIdx) {
        obj[h] = data[i][colIdx];
      });
      result.push(obj);
    }
  }
  return result;
}

/**
 * Returns only the first matching row (for single-record sections).
 *
 * @param {Spreadsheet} ss
 * @param {string}      sheetName
 * @param {string}      submissionId
 * @return {Object|null}
 */
function getFirstRowForSubmission(ss, sheetName, submissionId) {
  var rows = getRowsForSubmission(ss, sheetName, submissionId);
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Document formatting helpers
// ---------------------------------------------------------------------------

function appendHeading2(body, text) {
  var p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  p.editAsText().setForegroundColor('#1a3a5c');
  return p;
}

function appendHeading3(body, text) {
  var p = body.appendParagraph(text);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING3);
  return p;
}

/**
 * Appends a two-column label/value table.
 *
 * @param {Body}     body
 * @param {Array[]}  rows  — array of [label, value] pairs
 */
function appendTwoColTable(body, rows) {
  if (rows.length === 0) return;

  var table = body.appendTable();

  rows.forEach(function(row) {
    var tableRow = table.appendTableRow();
    var labelCell = tableRow.appendTableCell(String(row[0]));
    var valueCell = tableRow.appendTableCell(String(row[1] !== undefined ? row[1] : ''));

    // Style label column
    labelCell.editAsText().setBold(true);
    labelCell.setBackgroundColor('#f0f4f8');
    labelCell.setPaddingTop(4);
    labelCell.setPaddingBottom(4);
    labelCell.setPaddingLeft(6);
    labelCell.setPaddingRight(6);

    // Style value column
    valueCell.setPaddingTop(4);
    valueCell.setPaddingBottom(4);
    valueCell.setPaddingLeft(6);
    valueCell.setPaddingRight(6);
  });

  return table;
}

/**
 * Appends a multi-column table with a header row.
 *
 * @param {Body}     body
 * @param {string[]} headers
 * @param {Array[]}  dataRows  — array of arrays, one per row
 */
function appendTable(body, headers, dataRows) {
  var allRows = [headers].concat(dataRows);
  var table = body.appendTable(allRows);

  // Style the header row
  var headerRow = table.getRow(0);
  for (var c = 0; c < headerRow.getNumCells(); c++) {
    var cell = headerRow.getCell(c);
    cell.editAsText().setBold(true).setForegroundColor('#ffffff');
    cell.setBackgroundColor('#1a3a5c');
    cell.setPaddingTop(4);
    cell.setPaddingBottom(4);
  }

  return table;
}
