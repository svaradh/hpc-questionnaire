/**
 * SheetWriter.gs — creates and populates spreadsheet tabs (schema 2.0.0).
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
 *   d — derived: computed by DERIVED[key] from the row being written
 * A tab is either one row per submission (`source: 'top'`) or one row per
 * entry of a repeatable question (`source: { rows: '<questionId>' }`).
 * `writeIf` (optional) skips the tab for a submission when it returns false.
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
      ['not_aware_sections', 'not_aware_sections', 'd']
    ]
  },
  {
    name: 'Workloads',
    source: { rows: 'W_workloads' },
    columns: [
      ['code', 'W_code'], ['type', 'W_type'], ['type_other', 'W_type_other'], ['source', 'W_source'],
      ['device', 'W_device'], ['nodes', 'W_nodes'], ['cores', 'W_cores'], ['gpus', 'W_gpus'],
      ['mem_node_gb', 'W_mem_node', 'q'], ['walltime_h', 'W_walltime', 'q'], ['scratch_min_gb', 'W_scratch_min', 'q'],
      ['jobs_year', 'W_jobs_year'], ['jobs_year_unconstrained', 'W_jobs_year_unconstrained'], ['concurrent', 'W_concurrent'],
      ['organisation', 'W_org'], ['batch_size', 'W_batch_size'],
      ['chain_steps', 'W_chain_steps'], ['chain_elapsed_h', 'W_chain_elapsed', 'q'],
      ['long_total_h', 'W_long_total', 'q'],
      ['campaign_cores', 'W_campaign_cores'], ['campaign_gpus', 'W_campaign_gpus'], ['campaign_duration_h', 'W_campaign_duration', 'q'], ['campaigns_year', 'W_campaigns_year'],
      ['gpu_version', 'W_gpu_version'], ['gpu_speedup', 'W_gpu_speedup'], ['cpu_viable', 'W_cpu_viable'],
      ['core_hours_year', 'core_hours_year', 'd'],
      ['core_hours_year_unconstrained', 'core_hours_year_unconstrained', 'd'],
      ['gpu_hours_year', 'gpu_hours_year', 'd'],
      ['peak_concurrent_cores', 'peak_concurrent_cores', 'd'],
      ['peak_concurrent_gpus', 'peak_concurrent_gpus', 'd'],
      ['peak_concurrent_scratch_gb', 'peak_concurrent_scratch_gb', 'd'],
      ['evidence_level', 'evidence_level', 'd']
    ]
  },
  {
    name: 'StorageTesting',
    source: 'top',
    columns: [
      ['persistent_now_gb', 'S_persistent_now', 'q'], ['persistent_3y_gb', 'S_persistent_3y', 'q'],
      ['scratch_residence', 'S_scratch_residence'],
      ['uses_debug', 'T_uses_debug'], ['sessions_week', 'T_sessions_week'],
      ['session_device', 'T_session_device'], ['session_cores', 'T_session_cores'], ['session_gpus', 'T_session_gpus'],
      ['session_length_h', 'T_session_length', 'q'], ['purpose', 'T_purpose'],
      ['other_codes', 'W_other_codes']
    ]
  },
  {
    name: 'LongJobs',
    source: { rows: 'L_records' },
    columns: [
      ['workload', 'L_workload'], ['device', 'L_device'], ['longest_run_h', 'L_longest_run', 'q'],
      ['longest_cores', 'L_longest_cores'], ['longest_gpus', 'L_longest_gpus'],
      ['checkpoint', 'L_checkpoint'], ['restart_loss_h', 'L_restart_loss', 'q'],
      ['doubling_effect', 'L_doubling'], ['terminations_12m', 'L_terminations_12m']
    ]
  },
  {
    name: 'Scaling',
    source: { rows: 'P_records' },
    columns: [
      ['workload', 'P_workload'], ['scale_over', 'P_scale_over'],
      ['cores_1', 'P_cores_1'], ['gpus_1', 'P_gpus_1'], ['walltime_1_h', 'P_wt_1', 'q'],
      ['cores_2', 'P_cores_2'], ['gpus_2', 'P_gpus_2'], ['walltime_2_h', 'P_wt_2', 'q'],
      ['cores_3', 'P_cores_3'], ['gpus_3', 'P_gpus_3'], ['walltime_3_h', 'P_wt_3', 'q'],
      ['doubling_effect', 'P_doubling'],
      ['max_cores_tested', 'P_max_tested'], ['max_gpus_tested', 'P_max_tested_gpus'],
      ['max_cores_useful', 'P_max_useful'], ['max_gpus_useful', 'P_max_useful_gpus']
    ]
  },
  {
    name: 'Memory',
    source: { rows: 'M_records' },
    columns: [
      ['workload', 'M_workload'], ['peak_gb', 'M_peak', 'q'],
      ['fits_standard_node', 'M_fits_standard'], ['distributable', 'M_distributable']
    ]
  },
  {
    name: 'Gpu',
    source: { rows: 'G_records' },
    columns: [
      ['workload', 'G_workload'], ['gpu_model', 'G_model'], ['mem_per_gpu_gb', 'G_mem_per_gpu', 'q'],
      ['max_gpus_per_job', 'G_max_gpus'], ['nvlink_needed', 'G_nvlink'], ['multinode_gpu', 'G_multinode']
    ]
  },
  {
    name: 'Scratch',
    source: { rows: 'SC_records' },
    columns: [
      ['workload', 'SC_workload'], ['peak_gb', 'SC_peak', 'q'], ['files_per_job', 'SC_files'],
      ['file_pattern', 'SC_pattern'], ['local_disk_possible', 'SC_local_disk']
    ]
  },
  {
    name: 'Queue',
    source: 'top',
    writeIf: function(answers) {
      return ['Q_cluster', 'Q_typical_wait', 'Q_longest_wait', 'Q_share_not_run']
        .some(function(k) { return answers[k] !== undefined; });
    },
    columns: [
      ['cluster', 'Q_cluster'], ['typical_wait_h', 'Q_typical_wait', 'q'],
      ['longest_wait_h', 'Q_longest_wait', 'q'], ['share_not_run_pct', 'Q_share_not_run']
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

var DERIVED = {
  core_hours_year: function(r) { return product(num(r, 'W_cores'), base(r, 'W_walltime'), num(r, 'W_jobs_year')); },
  core_hours_year_unconstrained: function(r) {
    return product(num(r, 'W_cores'), base(r, 'W_walltime'), num(r, 'W_jobs_year_unconstrained'));
  },
  gpu_hours_year: function(r) { return product(num(r, 'W_gpus'), base(r, 'W_walltime'), num(r, 'W_jobs_year')); },
  peak_concurrent_cores: function(r) { return product(num(r, 'W_cores'), num(r, 'W_concurrent')); },
  peak_concurrent_gpus: function(r) { return product(num(r, 'W_gpus'), num(r, 'W_concurrent')); },
  peak_concurrent_scratch_gb: function(r) { return product(base(r, 'W_scratch_min'), num(r, 'W_concurrent')); },
  evidence_level: function(r) {
    var s = r['W_source'];
    return EVIDENCE_LEVEL_BY_SOURCE.hasOwnProperty(s) ? EVIDENCE_LEVEL_BY_SOURCE[s] : '';
  },
  not_aware_sections: function(r, answers) { return notAwareSections(answers); }
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
 * how to characterise" declaration (NA_<topic> = true) → "long_jobs; memory".
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
    // Always (re)write row 1, so header changes in source reach an existing sheet.
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

function cell(col, obj, answers) {
  var kind = col[2] || 'v';
  if (kind === 'q') return quantityToBase(obj, col[1]);
  if (kind === 'd') return DERIVED[col[1]](obj, answers);
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
    if (def.writeIf && !def.writeIf(answers)) return;
    if (def.source === 'top') {
      appendRow(def.name, [submissionId, piName].concat(def.columns.map(function(c) { return cell(c, answers, answers); })));
      return;
    }
    var rows = Array.isArray(answers[def.source.rows]) ? answers[def.source.rows] : [];
    rows.forEach(function(row, i) {
      appendRow(def.name, [submissionId, piName, i + 1].concat(def.columns.map(function(c) { return cell(c, row || {}, answers); })));
    });
  });

  appendRow('CommitteeAssessment', [submissionId, piName, '', '', '', '', '', '', '']);
}
