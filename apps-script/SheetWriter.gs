/**
 * SheetWriter.gs — creates and populates spreadsheet tabs (schema 2.5.0).
 *
 * Every sheet has submission_id as column A and pi_name as column B
 * so any tab is self-identifying without needing to cross-reference
 * the Submissions index.
 *
 * pi_name = salutation + full name (e.g. "Prof. Anita Sharma").
 *
 * Tabs are declared in SHEET_DEFINITIONS. Each column names the answer key
 * it reads and how the value is written:
 *   v — as-is (arrays joined with '; ')
 *   q — quantity { value, unit } normalised to base units (hours / GB)
 *   d — derived: computed by DERIVED[key](row, answers, tab definition)
 * A tab is either one row per submission (`source: 'top'`) or one row per
 * entry of a repeatable question (`source: { rows: '<questionId>' }`). With
 * `panel`, only entries that opened that follow-up panel are written: the
 * form lists them in each entry's `_panels` (see answersForSubmission in
 * src/utils/conditions.ts). entry_index is the entry's position in the
 * repeatable, so follow-up rows join the Workloads row of the same code.
 *
 * "Don't know" answers are written as 'dont_know', never as 0 or blank.
 */

// ---------------------------------------------------------------------------
// Sheet definitions
// ---------------------------------------------------------------------------

var SHEET_DEFINITIONS = [
  {
    name: 'Group',
    source: 'top',
    columns: [
      ['pi_salutation', 'A_pi_salutation'], ['pi_email', 'A_pi_email'],
      ['group_name', 'A_group_name'], ['department', 'A_department'], ['department_other', 'A_department_other'],
      ['completed_by_name', 'A_completed_by_name'], ['completed_by_email', 'A_completed_by_email'],
      ['completed_by_role', 'A_completed_by_role'], ['completed_by_role_other', 'A_completed_by_role_other'],
      ['hpc_users_now', 'A_hpc_users_now'], ['hpc_users_3y', 'A_hpc_users_3y'],
      ['research_description', 'A_research_description']
    ]
  },
  {
    name: 'Experience',
    source: 'top',
    columns: [
      ['systems_used', 'X_systems_used'], ['share_iiserb_pct', 'X_share_iiserb'],
      ['problems', 'X_problems'], ['problems_other', 'X_problems_other'], ['problems_where', 'X_problems_where'],
      ['share_not_run_pct', 'Q_share_not_run'],
      ['not_aware_sections', 'not_aware_sections', 'd']
    ]
  },
  {
    name: 'Workloads',
    source: { rows: 'W_workloads' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['type', 'W_type'], ['type_other', 'W_type_other'], ['source', 'W_source'],
      ['cluster', 'W_cluster'], ['affected_by', 'W_affected'], ['organisation', 'W_org'],
      ['device', 'W_device'], ['nodes', 'W_nodes'], ['cores', 'W_cores'], ['gpus', 'W_gpus'],
      ['mem_node_gb', 'W_mem_node', 'q'], ['walltime_h', 'W_walltime', 'q'],
      ['input_read_gb', 'W_input_read', 'q'], ['scratch_write_gb', 'W_scratch_write', 'q'],
      ['jobs_year', 'W_jobs_year'], ['jobs_year_unconstrained', 'W_jobs_year_unconstrained'], ['concurrent', 'W_concurrent'],
      ['gpu_version', 'W_gpu_version'], ['gpu_speedup', 'W_gpu_speedup'], ['cpu_viable', 'W_cpu_viable'],
      ['panels', 'panels', 'd'],
      // Section D panel "How these jobs are organised" (same entry, so kept on this tab)
      ['organisation_opened_by', 'organisation_opened_by', 'd'],
      ['organisation_not_aware', 'NA_org'], ['batch_size', 'W_batch_size'],
      // One sequence: chain steps and/or restarts of a split calculation
      ['seq_jobs', 'W_seq_jobs'], ['seq_run_h', 'W_seq_run', 'q'], ['seq_calendar_h', 'W_seq_calendar', 'q'],
      ['campaign_cores', 'W_campaign_cores'], ['campaign_gpus', 'W_campaign_gpus'], ['campaign_duration_h', 'W_campaign_duration', 'q'], ['campaigns_year', 'W_campaigns_year'],
      // Computed
      ['core_hours_year_max', 'core_hours_year_max', 'd'],
      ['core_hours_year_unconstrained_max', 'core_hours_year_unconstrained_max', 'd'],
      ['gpu_hours_year_max', 'gpu_hours_year_max', 'd'],
      ['peak_concurrent_cores', 'peak_concurrent_cores', 'd'],
      ['peak_concurrent_gpus', 'peak_concurrent_gpus', 'd'],
      ['peak_concurrent_scratch_gb', 'peak_concurrent_scratch_gb', 'd'],
      ['seq_queue_overhead_h', 'seq_queue_overhead_h', 'd'],
      ['evidence_level', 'evidence_level', 'd']
    ]
  },
  {
    name: 'StorageTesting',
    source: 'top',
    columns: [
      ['home_now_gb', 'S_home_now', 'q'], ['home_3y_gb', 'S_home_3y', 'q'], ['output_stay', 'S_output_stay'],
      ['uses_debug', 'T_uses_debug'], ['sessions_week', 'T_sessions_week'],
      ['session_device', 'T_session_device'], ['session_cores', 'T_session_cores'], ['session_gpus', 'T_session_gpus'],
      ['session_length_h', 'T_session_length', 'q'], ['purpose', 'T_purpose'],
      ['other_codes', 'W_other_codes']
    ]
  },
  // Section D panels: one row per code that opened the panel.
  {
    name: 'LongJobs',
    source: { rows: 'W_workloads', panel: 'W_blk_long' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['opened_by', 'opened_by', 'd'],
      ['same_as_entry', 'SAME_long'], ['not_aware', 'NA_long_jobs'],
      ['checkpoint', 'L_checkpoint'], ['restart_loss_h', 'L_restart_loss', 'q'],
      ['longest_run_h', 'L_longest_run', 'q'], ['terminations_12m', 'L_terminations_12m']
    ]
  },
  {
    name: 'Scaling',
    source: { rows: 'W_workloads', panel: 'W_blk_scaling' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['opened_by', 'opened_by', 'd'],
      ['same_as_entry', 'SAME_scaling'], ['not_aware', 'NA_scaling'], ['device', 'W_device'], ['doubling_effect', 'P_doubling'],
      ['cores_1', 'P_cores_1'], ['gpus_1', 'P_gpus_1'], ['walltime_1_h', 'P_wt_1', 'q'],
      ['cores_2', 'P_cores_2'], ['gpus_2', 'P_gpus_2'], ['walltime_2_h', 'P_wt_2', 'q'],
      ['cores_3', 'P_cores_3'], ['gpus_3', 'P_gpus_3'], ['walltime_3_h', 'P_wt_3', 'q'],
      ['runs_not_known', 'P_runs_unknown'],
      ['max_cores_tested', 'P_max_tested'], ['max_gpus_tested', 'P_max_tested_gpus'],
      ['max_cores_useful', 'P_max_useful'], ['max_gpus_useful', 'P_max_useful_gpus']
    ]
  },
  {
    name: 'Memory',
    source: { rows: 'W_workloads', panel: 'W_blk_memory' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['opened_by', 'opened_by', 'd'],
      ['same_as_entry', 'SAME_memory'], ['not_aware', 'NA_memory'],
      ['fits_standard_node', 'M_fits_standard'], ['distributable', 'M_distributable']
    ]
  },
  {
    name: 'Gpu',
    source: { rows: 'W_workloads', panel: 'W_blk_gpu' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['opened_by', 'opened_by', 'd'],
      ['same_as_entry', 'SAME_gpu'], ['not_aware', 'NA_gpu'],
      ['gpu_model', 'G_model'], ['mem_per_gpu_gb', 'G_mem_per_gpu', 'q'],
      ['max_gpus_per_job', 'G_max_gpus'], ['nvlink_needed', 'G_nvlink'], ['multinode_gpu', 'G_multinode']
    ]
  },
  {
    name: 'Scratch',
    source: { rows: 'W_workloads', panel: 'W_blk_scratch' },
    columns: [
      ['code', 'W_code'], ['job_kind', 'W_job_kind'], ['opened_by', 'opened_by', 'd'],
      ['same_as_entry', 'SAME_scratch'], ['not_aware', 'NA_scratch'], ['input_read_only', 'SC_input_readonly'],
      ['rereads_own_output', 'SC_reread'], ['io_time_share', 'SC_io_share'], ['files_per_job', 'SC_files'],
      ['local_disk_possible', 'SC_local_disk'], ['residence_after_job', 'SC_residence']
    ]
  },
  {
    name: 'Queue',
    source: { rows: 'Q_records' },
    columns: [
      ['queue', 'Q_queue'], ['other_system', 'Q_other_system'], ['workload', 'Q_workload'], ['same_as_typical_job', 'Q_same_as_typical'],
      ['req_nodes', 'Q_req_nodes'], ['req_cores', 'Q_req_cores'], ['req_gpus', 'Q_req_gpus'],
      ['req_walltime_h', 'Q_req_walltime', 'q'],
      ['typical_wait_h', 'Q_typical_wait', 'q'], ['longest_wait_h', 'Q_longest_wait', 'q']
    ]
  },
  {
    name: 'Closing',
    source: 'top',
    columns: [
      ['growth_3y_factor', 'Z_growth_3y'],
      ['benchmark_help', 'Z_benchmark_help'], ['benchmark_codes', 'Z_benchmark_codes'],
      ['volunteer', 'Z_volunteer'], ['volunteer_codes', 'Z_volunteer_codes'],
      ['comments', 'Z_comments']
    ]
  }
];

// Submissions and CommitteeAssessment have fixed layouts (written separately).
var SUBMISSIONS_HEADERS = [
  'submission_id', 'pi_name', 'submitted_at', 'submitter_email', 'submitter_name',
  'pi_email', 'group_name', 'department', 'questionnaire_version', 'status'
];
var COMMITTEE_HEADERS = [
  'submission_id', 'pi_name', 'triage_category', 'assessor', 'assessed_at',
  'findings', 'recommended_qos', 'follow_up_required', 'follow_up_notes'
];

/** Tabs whose rows are rewritten on an edit (CommitteeAssessment is preserved). */
function dataSheetNames() {
  return ['Submissions'].concat(SHEET_DEFINITIONS.map(function(d) { return d.name; }));
}

// ---------------------------------------------------------------------------
// Derived values — computed from the row being written, never asked
// ---------------------------------------------------------------------------

/** Evidence-confidence level (CLAUDE.md §3) from the respondent's stated source. */
var EVIDENCE_LEVEL_BY_SOURCE = {
  gargi: 1, raman: 1,
  benchmark: 2,
  iiserb_earlier: 3, national: 3, collaborator: 3, cloud: 3,
  published: 4,
  estimate: 5
};

/**
 * Yearly totals are upper bounds: the entry describes its heaviest job, and
 * every job is counted as that heavy. For a sequence (chain or split
 * calculation) with its running time and job count known, the mean running
 * time per job is used instead of the heaviest job's wall time (tighter,
 * still an upper bound on cores).
 */
function hoursPerJob(r) {
  var wt = base(r, 'W_walltime');
  var run = base(r, 'W_seq_run'), jobs = num(r, 'W_seq_jobs');
  var org = Array.isArray(r['W_org']) ? r['W_org'] : [];
  var isSeq = org.indexOf('chain') >= 0 || org.indexOf('long_calc') >= 0;
  if (isSeq && run !== null && jobs) return wt === null ? run / jobs : Math.min(wt, run / jobs);
  return wt;
}

/** Ids of the triggers that opened a panel for this entry, '; '-joined. */
function triggersOf(r, panel) {
  var t = r && r._triggers && r._triggers[panel];
  return Array.isArray(t) ? t.join('; ') : '';
}

/** a − b, rounded; '' if either is missing or unknown. */
function difference(a, b) { return (a === null || b === null) ? '' : parseFloat((a - b).toFixed(4)); }

var DERIVED = {
  core_hours_year_max: function(r) { return product(num(r, 'W_cores'), hoursPerJob(r), num(r, 'W_jobs_year')); },
  core_hours_year_unconstrained_max: function(r) {
    return product(num(r, 'W_cores'), hoursPerJob(r), num(r, 'W_jobs_year_unconstrained'));
  },
  gpu_hours_year_max: function(r) { return product(num(r, 'W_gpus'), hoursPerJob(r), num(r, 'W_jobs_year')); },
  // Time spent waiting (queue and gaps) = calendar time − running time
  seq_queue_overhead_h: function(r) { return difference(base(r, 'W_seq_calendar'), base(r, 'W_seq_run')); },
  // Why a panel was shown for this entry (trigger ids from the form)
  opened_by: function(r, answers, def) { return triggersOf(r, def.source.panel); },
  organisation_opened_by: function(r) { return triggersOf(r, 'W_blk_org'); },
  peak_concurrent_cores: function(r) { return product(num(r, 'W_cores'), num(r, 'W_concurrent')); },
  peak_concurrent_gpus: function(r) { return product(num(r, 'W_gpus'), num(r, 'W_concurrent')); },
  peak_concurrent_scratch_gb: function(r) { return product(base(r, 'W_scratch_write'), num(r, 'W_concurrent')); },
  evidence_level: function(r) {
    var s = r['W_source'];
    return EVIDENCE_LEVEL_BY_SOURCE.hasOwnProperty(s) ? EVIDENCE_LEVEL_BY_SOURCE[s] : '';
  },
  not_aware_sections: function(r, answers) { return notAwareSections(answers); },
  // Section D panels this entry opened: "W_blk_long" -> "long"
  panels: function(r) {
    return (Array.isArray(r._panels) ? r._panels : []).map(function(p) { return p.replace(/^W_blk_/, ''); }).join('; ');
  }
};

/** Plain number from an answer; null when blank, 'dont_know' or invalid. */
function num(obj, key) {
  var v = obj[key];
  if (v === undefined || v === null || v === '' || v === 'dont_know') return null;
  var n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Quantity in base units as a number; null when blank or unknown. */
function base(obj, key) {
  var v = quantityToBase(obj, key);
  return (v === '' || v === 'dont_know') ? null : v;
}

/** Product of numbers rounded to 4 dp; '' if any factor is missing or unknown. */
function product() {
  var p = 1;
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] === null) return '';
    p *= arguments[i];
  }
  return parseFloat(p.toFixed(4));
}

/**
 * Sections where the respondent ticked the top-level "not aware / don't know
 * how to characterise" declaration (NA_<topic> = true) → "queue". Per-code
 * panel declarations are in each follow-up tab's not_aware column.
 */
function notAwareSections(answers) {
  return Object.keys(answers)
    .filter(function(k) { return k.indexOf('NA_') === 0 && answers[k] === true; })
    .map(function(k) { return k.substring(3); })
    .join('; ');
}

// ---------------------------------------------------------------------------
// initializeSheets — creates all tabs with formatted headers
// ---------------------------------------------------------------------------

function initializeSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var all = [{ name: 'Submissions', headers: SUBMISSIONS_HEADERS }]
    .concat(SHEET_DEFINITIONS.map(function(d) { return { name: d.name, headers: headersFor(d) }; }))
    .concat([{ name: 'CommitteeAssessment', headers: COMMITTEE_HEADERS }]);

  all.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    // Always (re)write row 1, so header changes in source reach an existing sheet;
    // clear it first so columns that were dropped do not linger.
    sheet.getRange(1, 1, 1, sheet.getMaxColumns()).clearContent();
    var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
    headerRange.setValues([def.headers]);
    headerRange.setFontWeight('bold');
    headerRange.setFontColor('#ffffff');
    headerRange.setBackground('#1a3a5c');
    headerRange.setFontSize(10);
    sheet.setFrozenRows(1);
  });

  Logger.log('Sheets initialized successfully. ' + all.length + ' tabs ready.');
}

function headersFor(def) {
  var lead = def.source === 'top' ? ['submission_id', 'pi_name'] : ['submission_id', 'pi_name', 'entry_index'];
  return lead.concat(def.columns.map(function(c) { return c[0]; }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendRow(sheetName, rowData) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.appendRow(rowData);
}

function val(answers, key) {
  var v = answers[key];
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Unit factors to base units — time → hours, size → GB. Must match
 * src/utils/quantity.ts (UNIT_FACTORS).
 */
var UNIT_FACTORS = {
  seconds: 1 / 3600, minutes: 1 / 60, hours: 1, days: 24, weeks: 168,
  MB: 1 / 1024, GB: 1, TB: 1024
};

/**
 * Converts a quantity answer { value, unit } to base units (hours or GB),
 * 6 decimal places. Returns 'dont_know' when the respondent ticked
 * "Don't know", and '' when absent or not a number.
 */
function quantityToBase(answers, key) {
  var v = answers[key];
  if (v === 'dont_know') return 'dont_know';
  if (!v || typeof v !== 'object') return '';
  var n = parseFloat(v.value);
  if (isNaN(n) || v.value === '' || v.value === undefined) return '';
  var factor = UNIT_FACTORS.hasOwnProperty(String(v.unit)) ? UNIT_FACTORS[String(v.unit)] : 1;
  return parseFloat((n * factor).toFixed(6));
}

function cell(col, obj, answers, def) {
  var kind = col[2] || 'v';
  if (kind === 'q') return quantityToBase(obj, col[1]);
  if (kind === 'd') return DERIVED[col[1]](obj, answers, def);
  return val(obj, col[1]);
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

function writeToSheets(submissionId, email, name, answers, questionnaireVersion) {
  var timestamp = new Date().toISOString();
  var piName = [val(answers, 'A_pi_salutation'), val(answers, 'A_pi_name')].filter(Boolean).join(' ');

  appendRow('Submissions', [
    submissionId, piName, timestamp, email, name,
    val(answers, 'A_pi_email'), val(answers, 'A_group_name'), val(answers, 'A_department'),
    questionnaireVersion, 'submitted'
  ]);

  SHEET_DEFINITIONS.forEach(function(def) {
    if (def.source === 'top') {
      appendRow(def.name, [submissionId, piName].concat(def.columns.map(function(c) { return cell(c, answers, answers, def); })));
      return;
    }
    var rows = Array.isArray(answers[def.source.rows]) ? answers[def.source.rows] : [];
    rows.forEach(function(row, i) {
      var panel = def.source.panel;
      if (panel && !(row && Array.isArray(row._panels) && row._panels.indexOf(panel) >= 0)) return;
      appendRow(def.name, [submissionId, piName, i + 1].concat(def.columns.map(function(c) { return cell(c, row || {}, answers, def); })));
    });
  });

  appendRow('CommitteeAssessment', [submissionId, piName, '', '', '', '', '', '', '']);
}
