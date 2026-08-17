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
// Core report generator
// ---------------------------------------------------------------------------

/**
 * generateReport — builds a Google Doc containing the full committee report
 * for the given submissionId.
 *
 * @param  {string} submissionId
 * @return {string} URL of the created document
 */
function generateReport(submissionId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- Collect data from all sheets ---
  var sub    = getFirstRowForSubmission(ss, 'Submissions', submissionId);
  var resp   = getFirstRowForSubmission(ss, 'RespondentInfo', submissionId);
  var wloads = getRowsForSubmission(ss, 'Workloads', submissionId);
  var setups = getRowsForSubmission(ss, 'JobSetups', submissionId);
  var rts    = getRowsForSubmission(ss, 'RuntimeRecords', submissionId);
  var wtt    = getFirstRowForSubmission(ss, 'WallTimeTerminations', submissionId);
  var chk    = getFirstRowForSubmission(ss, 'CheckpointInfo', submissionId);
  var scl    = getFirstRowForSubmission(ss, 'ScalingInfo', submissionId);
  var mem    = getFirstRowForSubmission(ss, 'MemoryInfo', submissionId);
  var gpu    = getFirstRowForSubmission(ss, 'GpuInfo', submissionId);
  var tput   = getFirstRowForSubmission(ss, 'Throughput', submissionId);
  var evds   = getRowsForSubmission(ss, 'EvidenceRecords', submissionId);
  var bmark  = getFirstRowForSubmission(ss, 'BenchmarkInfo', submissionId);
  var wflow  = getFirstRowForSubmission(ss, 'WorkflowInfo', submissionId);
  var svc    = getFirstRowForSubmission(ss, 'ServiceObservations', submissionId);

  // Convenience: pull frequently-used values
  var groupName  = sub ? sub['group_name']  || '(not provided)' : '(not provided)';
  var piName     = sub ? sub['pi_name']     || '(not provided)' : '(not provided)';
  var submittedAt = sub ? sub['submitted_at'] || '' : '';

  // --- Create the document ---
  var docTitle = 'HPC Report — ' + groupName + ' — ' + submissionId;
  var doc = DocumentApp.create(docTitle);
  var body = doc.getBody();

  // Move to committee folder
  if (COMMITTEE_FOLDER_ID) {
    var file = DriveApp.getFileById(doc.getId());
    DriveApp.getFolderById(COMMITTEE_FOLDER_ID).addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  // -------------------------------------------------------------------------
  // Title
  // -------------------------------------------------------------------------
  var titlePara = body.appendParagraph('HPC WORKLOAD CHARACTERISATION — COMMITTEE REPORT');
  titlePara.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  titlePara.editAsText().setBold(true);

  body.appendParagraph(
    'Generated: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) +
    '   |   Submission ID: ' + submissionId +
    '   |   Status: Submitted'
  ).setItalic(true);

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section A — Research Group
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION A — RESEARCH GROUP');

  var salutation = resp ? (resp['pi_salutation'] || '') : '';
  var piEmail    = resp ? (resp['pi_email']    || '') : '';
  var completedBy = resp ? ((resp['completed_by_name'] || '') + ' (' + (resp['completed_by_role'] || '') + ')') : '';
  var researchDesc = resp ? (resp['research_description'] || 'Not provided') : 'Not provided';
  var dept = resp ? (resp['department'] || '(not provided)') : '(not provided)';

  var sectionAData = [
    ['Research Group', groupName],
    ['Department', dept],
    ['PI', salutation + ' ' + piName + ' (' + piEmail + ')'],
    ['Submitted by', completedBy || '(not provided)'],
    ['Description', researchDesc]
  ];
  appendTwoColTable(body, sectionAData);

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section B — Workloads
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION B — WORKLOADS');

  if (wloads.length === 0 || !wloads[0]['code_name']) {
    body.appendParagraph('No workload entries provided.').setItalic(true);
  } else {
    wloads.forEach(function(w) {
      if (!w['code_name']) return;
      appendHeading3(body, w['code_name']);
      appendTwoColTable(body, [
        ['Categories',   w['categories']    || '(not provided)'],
        ['Version',      w['version']       || '(not known)'],
        ['Annual jobs',  w['job_count_range'] || '(not provided)'],
        ['Reference',    w['reference']     || ''],
        ['Notes',        w['notes']         || '']
      ]);
      body.appendParagraph('');
    });
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section C — Typical Job Setups
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION C — TYPICAL JOB SETUPS');

  if (setups.length === 0 || !setups[0]['system_name']) {
    body.appendParagraph('No job setup entries provided.').setItalic(true);
  } else {
    setups.forEach(function(s, idx) {
      appendHeading3(body, 'Setup ' + (idx + 1) + (s['workload_ref'] ? ' — ' + s['workload_ref'] : ''));
      appendTwoColTable(body, [
        ['System',               s['system_name']          || ''],
        ['System type',          s['system_type']          || ''],
        ['Nodes',                s['nodes_range']          || ''],
        ['CPU cores',            s['cores_range']          || ''],
        ['GPU used',             s['uses_gpu']             || ''],
        ['GPUs per node',        s['gpus_per_node_range']  || ''],
        ['GPU model',            s['gpu_model']            || ''],
        ['Memory per core',      s['memory_range']         || ''],
        ['Scratch storage',      s['storage_range']        || ''],
        ['Inter-node sensitive', s['interconnect_sensitive'] || ''],
        ['Notes',                s['notes']                || '']
      ]);
      body.appendParagraph('');
    });
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section D — Runtime Observations
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION D — RUNTIME OBSERVATIONS');

  if (rts.length === 0 || !rts[0]['workload_name']) {
    body.appendParagraph('No runtime records provided.').setItalic(true);
  } else {
    var rtHeaders = ['Workload', 'Config', 'Wall time (h)', 'Core-hours', 'Jobs', 'Evidence source', 'Confidence'];
    var rtRows = rts
      .filter(function(r) { return r['workload_name']; })
      .map(function(r) {
        return [
          r['workload_name']    || '',
          r['resource_config']  || '',
          r['wall_time_hours']  || '',
          r['cpu_gpu_hours']    || '',
          r['num_similar_jobs'] || '',
          r['evidence_source']  || '',
          r['evidence_level']   || ''
        ];
      });
    appendTable(body, rtHeaders, rtRows);
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section E — Wall-Time Terminations
  // -------------------------------------------------------------------------
  if (wtt && wtt['has_been_terminated'] && wtt['has_been_terminated'] !== '') {
    appendHeading2(body, 'SECTION E — WALL-TIME TERMINATIONS');
    appendTwoColTable(body, [
      ['Has been terminated',          wtt['has_been_terminated']         || ''],
      ['Frequency',                    wtt['frequency']                   || ''],
      ['Requested wall time (h)',      wtt['requested_wall_time_hrs']     || ''],
      ['Actual run time at kill (h)',  wtt['actual_run_time_hrs']         || ''],
      ['Was restarted',               wtt['was_restarted']               || ''],
      ['Work lost',                    wtt['work_lost']                   || ''],
      ['Eventually completed',         wtt['eventually_completed']        || ''],
      ['Completed on different config',wtt['completed_different_config']  || ''],
      ['Notes',                        wtt['notes']                       || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section F — Checkpoint/Restart
  // -------------------------------------------------------------------------
  if (chk && chk['supported'] && chk['supported'] !== '') {
    appendHeading2(body, 'SECTION F — CHECKPOINT / RESTART');
    appendTwoColTable(body, [
      ['Supported',              chk['supported']           || ''],
      ['Type',                   chk['checkpoint_type']     || ''],
      ['Interval',               chk['interval']            || ''],
      ['Restart behaviour',      chk['restart_behaviour']   || ''],
      ['Computational loss',     chk['computational_loss']  || ''],
      ['Tested',                 chk['tested']              || ''],
      ['Currently used',         chk['currently_used']      || ''],
      ['Notes',                  chk['notes']               || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section G — Parallel Scaling
  // -------------------------------------------------------------------------
  if (scl && scl['independent_jobs'] && scl['independent_jobs'] !== '') {
    appendHeading2(body, 'SECTION G — PARALLEL SCALING');
    appendTwoColTable(body, [
      ['Independent jobs',                 scl['independent_jobs']           || ''],
      ['Node count affects runtime',       scl['node_count_affects_runtime'] || ''],
      ['Configurations tested (summary)',  scl['configs_tested']             || ''],
      ['Min nodes (observed)',             scl['min_nodes']                  || ''],
      ['Max nodes tested',                 scl['max_nodes']                  || ''],
      ['Notes',                            scl['notes']                      || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section H — Memory
  // -------------------------------------------------------------------------
  if (mem && (mem['typical_memory_gb'] || mem['peak_memory_gb'] || mem['standard_nodes_tested'])) {
    appendHeading2(body, 'SECTION H — MEMORY REQUIREMENTS');
    appendTwoColTable(body, [
      ['Typical memory per node (GB)',  mem['typical_memory_gb']      || ''],
      ['Peak memory per node (GB)',     mem['peak_memory_gb']         || ''],
      ['Min workable memory (GB)',      mem['min_workable_gb']        || ''],
      ['Memory distribution',          mem['memory_distribution']     || ''],
      ['Standard nodes tested',        mem['standard_nodes_tested']   || ''],
      ['Notes',                        mem['notes']                   || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section I — GPU
  // -------------------------------------------------------------------------
  if (gpu && gpu['gpu_used'] && gpu['gpu_used'] !== '') {
    appendHeading2(body, 'SECTION I — GPU AND SPECIALISED RESOURCES');
    appendTwoColTable(body, [
      ['GPU used',                   gpu['gpu_used']                  || ''],
      ['GPU model',                  gpu['gpu_model']                 || ''],
      ['Frameworks',                 gpu['frameworks']                || ''],
      ['Performance with GPU',       gpu['performance_with_gpu']      || ''],
      ['Performance without GPU',    gpu['performance_without_gpu']   || ''],
      ['Specialised interconnect',   gpu['specialised_interconnect']  || ''],
      ['Notes',                      gpu['notes']                     || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section J — Throughput
  // -------------------------------------------------------------------------
  if (tput && (tput['independent_job_count'] || tput['fully_independent'])) {
    appendHeading2(body, 'SECTION J — THROUGHPUT');
    appendTwoColTable(body, [
      ['Independent job count',   tput['independent_job_count'] || ''],
      ['Concurrent jobs',         tput['concurrent_jobs']       || ''],
      ['Total CPU/GPU hours/yr',  tput['total_hours_range']     || ''],
      ['Typical turnaround',      tput['turnaround_range']      || ''],
      ['Queue depth',             tput['queue_depth']           || ''],
      ['Fully independent',       tput['fully_independent']     || ''],
      ['Notes',                   tput['notes']                 || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section K — External Evidence
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION K — EXTERNAL EVIDENCE');

  if (evds.length === 0 || !evds[0]['source']) {
    body.appendParagraph('No external evidence records provided.').setItalic(true);
  } else {
    var evHeaders = ['Source', 'Confidence', 'Code', 'Workload', 'Hardware', 'Config', 'Runtime', 'Core-hours', 'Jobs', 'Reference'];
    var evRows = evds
      .filter(function(ev) { return ev['source']; })
      .map(function(ev) {
        return [
          ev['source']               || '',
          ev['confidence_level']     || '',
          ev['code']                 || '',
          ev['workload_description'] || '',
          ev['hardware']             || '',
          ev['resource_config']      || '',
          ev['runtime']              || '',
          ev['cpu_gpu_hours']        || '',
          ev['num_jobs']             || '',
          ev['reference']            || ''
        ];
      });
    appendTable(body, evHeaders, evRows);
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section L — Benchmark
  // -------------------------------------------------------------------------
  if (bmark && bmark['status'] && bmark['status'] !== '') {
    appendHeading2(body, 'SECTION L — BENCHMARK EVIDENCE');
    appendTwoColTable(body, [
      ['Status',      bmark['status']      || ''],
      ['Description', bmark['description'] || ''],
      ['Reference',   bmark['reference']   || ''],
      ['Notes',       bmark['notes']       || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section M — Workflow Optimisation
  // -------------------------------------------------------------------------
  if (wflow && wflow['investigated_approaches'] && wflow['investigated_approaches'] !== '') {
    appendHeading2(body, 'SECTION M — WORKFLOW OPTIMISATION');
    appendTwoColTable(body, [
      ['Approaches investigated',         wflow['investigated_approaches']       || ''],
      ['Technical assistance useful',     wflow['technical_assistance_useful']   || ''],
      ['Notes',                           wflow['notes']                         || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section N — Observed Service Issues
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION N — OBSERVED SERVICE ISSUES');

  if (svc && svc['problems_experienced'] && svc['problems_experienced'] !== '') {
    var problems = svc['problems_experienced'].split('; ');
    problems.forEach(function(prob) {
      if (prob.trim()) body.appendListItem(prob.trim()).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
    if (svc['other_description']) {
      body.appendParagraph('Other: ' + svc['other_description']);
    }
    if (svc['notes']) {
      body.appendParagraph('Notes: ' + svc['notes']);
    }
  } else {
    body.appendParagraph('No service observations recorded.').setItalic(true);
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Committee Assessment — to be completed manually
  // -------------------------------------------------------------------------
  appendHeading2(body, 'COMMITTEE ASSESSMENT (to be completed)');

  var assessmentData = [
    ['Triage Category',  '[ ] 1 — Automatically characterised   [ ] 2 — Clarification needed   [ ] 3 — Technical assessment'],
    ['Assessor',         ''],
    ['Date assessed',    ''],
    ['Findings',         '\n\n\n\n'],
    ['Recommended QoS',  ''],
    ['Follow-up needed', '[ ] Yes   [ ] No'],
    ['Follow-up notes',  '']
  ];
  appendTwoColTable(body, assessmentData);

  // --- Save and return URL ---
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
