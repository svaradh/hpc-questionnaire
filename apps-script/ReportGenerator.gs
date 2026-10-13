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
  var bmark  = getFirstRowForSubmission(ss, 'BenchmarkRequests', submissionId);
  var wtt    = getFirstRowForSubmission(ss, 'WallTimeTerminations', submissionId);
  var chks   = getRowsForSubmission(ss, 'CheckpointInfo', submissionId);
  var scls   = getRowsForSubmission(ss, 'ScalingInfo', submissionId);
  var mems   = getRowsForSubmission(ss, 'MemoryInfo', submissionId);
  var gpus   = getRowsForSubmission(ss, 'GpuInfo', submissionId);
  var indep  = getFirstRowForSubmission(ss, 'IndependentJobs', submissionId);
  var pipe   = getFirstRowForSubmission(ss, 'PipelineJobs', submissionId);
  var ext    = getFirstRowForSubmission(ss, 'ExtendedCalcs', submissionId);
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
  // Section D — Typical Job Setups
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION D — TYPICAL JOB SETUPS');

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
  // Section E — Runtime Observations
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION E — RUNTIME OBSERVATIONS');

  if (rts.length === 0 || !rts[0]['workload_name']) {
    body.appendParagraph('No runtime records provided.').setItalic(true);
  } else {
    var rtHeaders = ['Workload', 'Nodes', 'Cores', 'Wall time (h)', 'Core-hours (reported)', 'Core-hours (computed)', 'Jobs', 'Evidence source', 'Confidence'];
    var rtRows = rts
      .filter(function(r) { return r['workload_name']; })
      .map(function(r) {
        return [
          r['workload_name']       || '',
          r['nodes']               || '',
          r['cores']               || '',
          r['wall_time_hours']     || '',
          r['cpu_gpu_hours']       || '',
          r['computed_cpu_hours']  || '',
          r['num_similar_jobs']    || '',
          r['evidence_source']     || '',
          r['evidence_level']      || ''
        ];
      });
    appendTable(body, rtHeaders, rtRows);
  }

  if (bmark && bmark['benchmark_requested'] && bmark['benchmark_requested'] !== 'no') {
    appendHeading3(body, 'Benchmark Request');
    appendTwoColTable(body, [
      ['Requested',  bmark['benchmark_requested'] || ''],
      ['Codes',      bmark['benchmark_codes']      || '']
    ]);
  }

  body.appendParagraph('');

  // -------------------------------------------------------------------------
  // Section F — Wall-Time Terminations
  // -------------------------------------------------------------------------
  if (wtt && wtt['has_been_terminated'] && wtt['has_been_terminated'] !== '') {
    appendHeading2(body, 'SECTION F — WALL-TIME TERMINATIONS');
    appendTwoColTable(body, [
      ['Has been terminated',            wtt['has_been_terminated']        || ''],
      ['Frequency',                      wtt['frequency']                  || ''],
      ['Cores at termination',           wtt['terminated_cores']           || ''],
      ['Requested wall time (h)',        wtt['terminated_wall_time_hours'] || ''],
      ['Core-hours at termination',      wtt['terminated_cpu_hours']       || ''],
      ['Completed anywhere',             wtt['completed_anywhere']         || ''],
      ['Completed on system',            wtt['completed_system']           || ''],
      ['Cores in completed run',         wtt['completed_cores']            || ''],
      ['Wall time in completed run (h)', wtt['completed_wall_time_hours']  || ''],
      ['Core-hours in completed run',    wtt['completed_cpu_hours']        || ''],
      ['Notes',                          wtt['notes']                      || '']
    ]);
    body.appendParagraph('');
  }

  // -------------------------------------------------------------------------
  // Section G — Checkpoint/Restart
  // -------------------------------------------------------------------------
  if (chks.length > 0 && chks.some(function(c) { return c['supported']; })) {
    appendHeading2(body, 'SECTION G — CHECKPOINT / RESTART');
    chks.filter(function(c) { return c['supported']; }).forEach(function(chk) {
      appendHeading3(body, chk['workload_ref'] || '(applies to all codes)');
      appendTwoColTable(body, [
        ['Supported',                chk['supported']                 || ''],
        ['Type',                     chk['checkpoint_type']           || ''],
        ['Checkpoint interval (h)',  chk['checkpoint_interval_hours'] || ''],
        ['Restart automatic',        chk['restart_automatic']         || ''],
        ['Restart overhead (h)',     chk['restart_overhead_hours']    || ''],
        ['Restart errors',           chk['restart_errors']            || ''],
        ['Checkpointing abandoned',  chk['checkpoint_abandoned']      || ''],
        ['Abandoned reason',         chk['abandoned_reason']          || ''],
        ['Currently used',           chk['currently_used']            || ''],
        ['Notes',                    chk['notes']                     || '']
      ]);
      body.appendParagraph('');
    });
  }

  // -------------------------------------------------------------------------
  // Section H — Parallel Scaling
  // -------------------------------------------------------------------------
  if (scls.length > 0 && scls.some(function(s) { return s['independent_jobs']; })) {
    appendHeading2(body, 'SECTION H — PARALLEL SCALING');
    // Group rows by code, since each (code, resource configuration) pair is its own row.
    var scalingByCode = {};
    var scalingCodeOrder = [];
    scls.forEach(function(s) {
      var key = s['code_name'] || '(applies to all codes)';
      if (!scalingByCode[key]) { scalingByCode[key] = []; scalingCodeOrder.push(key); }
      scalingByCode[key].push(s);
    });
    scalingCodeOrder.forEach(function(code) {
      var rows = scalingByCode[code];
      var first = rows[0];
      appendHeading3(body, code);
      appendTwoColTable(body, [
        ['Independent jobs',       first['independent_jobs']    || ''],
        ['Scaling behaviour',      first['scaling_behaviour']   || ''],
        ['Scaling limit (cores)',  first['scaling_limit_cores'] || ''],
        ['Min cores (observed)',   first['min_cores']           || ''],
        ['Max cores tested',       first['max_cores_tested']    || ''],
        ['Notes',                  first['code_notes']          || '']
      ]);
      var configRows = rows.filter(function(r) { return r['nodes'] || r['cores'] || r['wall_time_hours']; });
      if (configRows.length > 0) {
        appendTable(body, ['Nodes', 'Cores', 'Wall time (h)', 'Evidence source', 'Confidence', 'Notes'],
          configRows.map(function(r) {
            return [r['nodes'] || '', r['cores'] || '', r['wall_time_hours'] || '', r['evidence_source'] || '', r['evidence_level'] || '', r['config_notes'] || ''];
          }));
      }
      body.appendParagraph('');
    });
  }

  // -------------------------------------------------------------------------
  // Section I — Memory
  // -------------------------------------------------------------------------
  var memsWithData = mems.filter(function(m) { return m['typical_memory_gb'] || m['peak_memory_gb'] || m['standard_nodes_tested']; });
  if (memsWithData.length > 0) {
    appendHeading2(body, 'SECTION I — MEMORY REQUIREMENTS');
    memsWithData.forEach(function(mem) {
      appendHeading3(body, mem['code_name'] || '(applies to all codes)');
      appendTwoColTable(body, [
        ['Typical memory per node (GB)',  mem['typical_memory_gb']      || ''],
        ['Peak memory per node (GB)',     mem['peak_memory_gb']         || ''],
        ['Min workable memory (GB)',      mem['min_workable_gb']        || ''],
        ['Memory distribution',           mem['memory_distribution']    || ''],
        ['Standard nodes tested',         mem['standard_nodes_tested']  || ''],
        ['Evidence source',               mem['evidence_source']        || ''],
        ['Confidence',                    mem['evidence_level']         || ''],
        ['Notes',                         mem['notes']                  || '']
      ]);
      body.appendParagraph('');
    });
  }

  // -------------------------------------------------------------------------
  // Section J — GPU and Specialised Resources
  // -------------------------------------------------------------------------
  var gpusWithData = gpus.filter(function(g) { return g['gpu_status']; });
  if (gpusWithData.length > 0) {
    appendHeading2(body, 'SECTION J — GPU AND SPECIALISED RESOURCES');
    gpusWithData.forEach(function(gpu) {
      appendHeading3(body, gpu['code_name'] || '(code not specified)');
      appendTwoColTable(body, [
        ['GPU status',                 gpu['gpu_status']             || ''],
        ['GPU model',                  gpu['gpu_model']               || ''],
        ['Min GPU memory needed',      gpu['gpu_memory_needed']       || ''],
        ['Min GPUs per job',           gpu['min_gpus_per_job']        || ''],
        ['Typical GPUs per job',       gpu['typical_gpus_per_job']    || ''],
        ['Frameworks',                 gpu['frameworks']              || ''],
        ['NVLink needed',              gpu['nvlink_needed']           || ''],
        ['Multi-node GPU',             gpu['multinode_gpu']           || ''],
        ['GPU jobs per year',          gpu['gpu_jobs_per_year']       || ''],
        ['Evidence source',            gpu['evidence_source']         || '']
      ]);
      if (gpu['cpu_comparison'] === 'yes') {
        appendTable(body, ['', 'CPU-only run', 'GPU run'], [
          ['Cores/GPUs',  gpu['cpu_cores'] || '',       (gpu['gpu_count'] || '') + (gpu['gpu_cores'] ? ' GPU(s) + ' + gpu['gpu_cores'] + ' cores' : '')],
          ['Wall time (h)', gpu['cpu_wall_time_hours'] || '', gpu['gpu_wall_time_hours'] || '']
        ]);
      } else if (gpu['cpu_comparison']) {
        body.appendParagraph('CPU vs GPU comparison: ' + gpu['cpu_comparison']);
      }
      if (gpu['notes']) body.appendParagraph('Notes: ' + gpu['notes']);
      body.appendParagraph('');
    });
  }

  // -------------------------------------------------------------------------
  // Section K — Workflow Patterns
  // -------------------------------------------------------------------------
  var hasWorkflowData = (indep && indep['job_count_per_year']) || (pipe && pipe['stages']) || (ext && ext['wall_time_hours']);
  if (hasWorkflowData) {
    appendHeading2(body, 'SECTION K — WORKFLOW PATTERNS');

    if (indep && indep['job_count_per_year']) {
      appendHeading3(body, 'Independent Jobs');
      appendTwoColTable(body, [
        ['Jobs per year',           indep['job_count_per_year'] || ''],
        ['Wall time per job (h)',   indep['wall_time_hours']    || ''],
        ['Concurrent jobs',         indep['concurrent_jobs']    || ''],
        ['Typical turnaround',      indep['turnaround_range']   || ''],
        ['CPU-hours used/yr',       indep['cpu_hours_used']     || ''],
        ['CPU-hours needed/yr',     indep['cpu_hours_needed']   || '']
      ]);
      body.appendParagraph('');
    }

    if (pipe && pipe['stages']) {
      appendHeading3(body, 'Pipeline Workflow');
      appendTwoColTable(body, [
        ['Stages',                   pipe['stages']               || ''],
        ['Wall time per stage (h)',  pipe['stage_wall_time_hours'] || ''],
        ['Stages parallelisable',    pipe['stage_parallelisable']  || ''],
        ['Pipelines per year',       pipe['pipelines_per_year']    || ''],
        ['End-to-end time (h)',      pipe['end_to_end_hours']      || ''],
        ['CPU-hours used/yr',        pipe['cpu_hours_used']        || ''],
        ['CPU-hours needed/yr',      pipe['cpu_hours_needed']      || '']
      ]);
      body.appendParagraph('');
    }

    if (ext && ext['wall_time_hours']) {
      appendHeading3(body, 'Extended Calculation');
      appendTwoColTable(body, [
        ['Wall time needed (h)',       ext['wall_time_hours']         || ''],
        ['Longest available (h)',      ext['longest_available_hours'] || ''],
        ['Completed anywhere',         ext['completed']                || ''],
        ['Completed on system',        ext['completed_system']         || ''],
        ['Can checkpoint',             ext['can_checkpoint']           || ''],
        ['Calculations per year',      ext['count_per_year']           || ''],
        ['CPU-hours used/yr',          ext['cpu_hours_used']           || ''],
        ['CPU-hours needed/yr',        ext['cpu_hours_needed']         || '']
      ]);
      body.appendParagraph('');
    }
  }

  // -------------------------------------------------------------------------
  // Section C — Observed Service Issues
  // -------------------------------------------------------------------------
  appendHeading2(body, 'SECTION C — OBSERVED SERVICE ISSUES');

  if (svc && svc['problems_experienced'] && svc['problems_experienced'] !== '') {
    var problems = svc['problems_experienced'].split('; ');
    problems.forEach(function(prob) {
      if (prob.trim()) body.appendListItem(prob.trim()).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
    if (svc['other_problem_description']) {
      body.appendParagraph('Other: ' + svc['other_problem_description']);
    }
  } else {
    body.appendParagraph('No service observations recorded.').setItalic(true);
  }

  if (svc && svc['workload_characteristics'] && svc['workload_characteristics'] !== '') {
    body.appendParagraph('');
    appendHeading3(body, 'Workload Characteristics (self-reported)');
    svc['workload_characteristics'].split('; ').forEach(function(ch) {
      if (ch.trim()) body.appendListItem(ch.trim()).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
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
