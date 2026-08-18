/**
 * SheetWriter.gs — creates and populates spreadsheet tabs.
 *
 * Every sheet has submission_id as column A and pi_name as column B
 * so any tab is self-identifying without needing to cross-reference
 * the Submissions index.
 *
 * pi_name = salutation + full name (e.g. "Prof. Anita Sharma").
 * It is derived from A_pi_salutation + A_pi_name at write time.
 */

// ---------------------------------------------------------------------------
// Sheet definitions — submission_id | pi_name | ... fields
// ---------------------------------------------------------------------------

var SHEET_DEFINITIONS = [
  {
    name: 'Submissions',
    headers: [
      'submission_id', 'pi_name', 'submitted_at', 'submitter_email', 'submitter_name',
      'pi_email', 'group_name', 'department', 'questionnaire_version', 'status'
    ]
  },
  {
    name: 'RespondentInfo',
    headers: [
      'submission_id', 'pi_name', 'pi_salutation', 'pi_email',
      'group_name', 'department', 'completed_by_name', 'completed_by_email',
      'completed_by_role', 'research_description'
    ]
  },
  {
    name: 'Workloads',
    headers: [
      'submission_id', 'pi_name', 'entry_index', 'code_name', 'version',
      'reference', 'categories', 'categories_other', 'job_count_range', 'notes'
    ]
  },
  {
    name: 'JobSetups',
    headers: [
      'submission_id', 'pi_name', 'entry_index', 'workload_ref', 'system_name',
      'system_type', 'nodes_range', 'cores_range', 'uses_gpu',
      'gpus_per_node_range', 'gpu_model', 'memory_range', 'storage_range',
      'interconnect_sensitive', 'notes'
    ]
  },
  {
    name: 'RuntimeRecords',
    headers: [
      'submission_id', 'pi_name', 'entry_index', 'workload_name', 'resource_config',
      'wall_time_hours', 'cpu_gpu_hours', 'num_similar_jobs',
      'evidence_source', 'evidence_level', 'hardware', 'notes'
    ]
  },
  {
    name: 'WallTimeTerminations',
    headers: [
      'submission_id', 'pi_name', 'has_been_terminated', 'frequency',
      'terminated_cores', 'terminated_wall_time_hours', 'terminated_cpu_hours',
      'completed_anywhere', 'completed_system',
      'completed_cores', 'completed_wall_time_hours', 'completed_cpu_hours',
      'notes'
    ]
  },
  {
    name: 'CheckpointInfo',
    headers: [
      'submission_id', 'pi_name', 'workload_ref', 'supported', 'checkpoint_type',
      'checkpoint_interval_hours', 'restart_automatic', 'restart_overhead_hours',
      'restart_errors', 'checkpoint_abandoned', 'abandoned_reason', 'abandoned_reason_other',
      'currently_used', 'notes'
    ]
  },
  {
    name: 'ScalingInfo',
    headers: [
      'submission_id', 'pi_name', 'code_name', 'independent_jobs', 'independent_jobs_notes',
      'scaling_behaviour', 'scaling_limit_cores', 'min_cores', 'max_cores_tested', 'code_notes',
      'resource_config', 'wall_time_hours', 'evidence_source', 'evidence_level',
      'benchmark_reference', 'config_notes'
    ]
  },
  {
    name: 'MemoryInfo',
    headers: [
      'submission_id', 'pi_name', 'code_name', 'typical_memory_gb', 'peak_memory_gb',
      'min_workable_gb', 'memory_distribution', 'standard_nodes_tested',
      'evidence_source', 'evidence_level', 'notes'
    ]
  },
  {
    name: 'GpuInfo',
    headers: [
      'submission_id', 'pi_name', 'code_name', 'uses_gpu', 'gpu_model', 'frameworks',
      'performance_with_gpu', 'performance_without_gpu', 'evidence_source',
      'specialised_interconnect', 'notes'
    ]
  },
  {
    name: 'IndependentJobs',
    headers: [
      'submission_id', 'pi_name', 'job_count_per_year', 'wall_time_hours',
      'concurrent_jobs', 'turnaround_range', 'cpu_hours_used', 'cpu_hours_needed'
    ]
  },
  {
    name: 'PipelineJobs',
    headers: [
      'submission_id', 'pi_name', 'stages', 'stage_wall_time_hours',
      'stage_parallelisable', 'pipelines_per_year', 'end_to_end_hours', 'cpu_hours_used', 'cpu_hours_needed'
    ]
  },
  {
    name: 'ExtendedCalcs',
    headers: [
      'submission_id', 'pi_name', 'wall_time_hours', 'longest_available_hours',
      'completed', 'completed_system', 'can_checkpoint', 'count_per_year', 'cpu_hours_used', 'cpu_hours_needed'
    ]
  },
  {
    name: 'BenchmarkRequests',
    headers: ['submission_id', 'pi_name', 'benchmark_requested', 'benchmark_codes']
  },
  {
    name: 'ServiceObservations',
    headers: [
      'submission_id', 'pi_name', 'problems_experienced', 'other_problem_description', 'workload_characteristics'
    ]
  },
  {
    name: 'CommitteeAssessment',
    headers: [
      'submission_id', 'pi_name', 'triage_category', 'assessor', 'assessed_at',
      'findings', 'recommended_qos', 'follow_up_required', 'follow_up_notes'
    ]
  }
];

// ---------------------------------------------------------------------------
// initializeSheets — creates all tabs with formatted headers
// ---------------------------------------------------------------------------

function initializeSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  SHEET_DEFINITIONS.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
    }

    if (sheet.getLastRow() === 0) {
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setValues([def.headers]);
      headerRange.setFontWeight('bold');
      headerRange.setFontColor('#ffffff');
      headerRange.setBackground('#1a3a5c');
      headerRange.setFontSize(10);
      sheet.setFrozenRows(1);
      for (var i = 1; i <= def.headers.length; i++) {
        sheet.autoResizeColumn(i);
      }
    }
  });

  Logger.log('Sheets initialized successfully. ' + SHEET_DEFINITIONS.length + ' tabs ready.');
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
  return String(v);
}

/**
 * Converts a duration question value { value, unit } to hours.
 * Stores 6 decimal places to preserve precision down to 10 seconds
 * (10 s = 0.002778 h). Returns '' if value is absent or not a number.
 *
 * TODO (future harmonisation): wall-time fields in Section D currently
 * store a plain number in hours. When those sections are revised, route
 * them through this function for consistent normalisation.
 */
function durationToHours(answers, key) {
  var v = answers[key];
  if (!v || typeof v !== 'object') return '';
  var num = parseFloat(v.value);
  if (isNaN(num) || v.value === '' || v.value === undefined) return '';
  switch (String(v.unit)) {
    case 'seconds': return parseFloat((num / 3600).toFixed(6));
    case 'minutes': return parseFloat((num / 60).toFixed(6));
    case 'hours':   return parseFloat(num.toFixed(6));
    case 'days':    return parseFloat((num * 24).toFixed(6));
    default:        return parseFloat(num.toFixed(6));
  }
}

/**
 * Computes CPU-hours = cores × wall_time_hours.
 * Returns '' if either value is absent or not a valid number.
 */
function computeCpuHours(cores, wallTimeHours) {
  if (cores === '' || cores === undefined || cores === null) return '';
  if (wallTimeHours === '' || wallTimeHours === undefined || wallTimeHours === null) return '';
  var c = parseFloat(String(cores));
  var h = parseFloat(String(wallTimeHours));
  if (isNaN(c) || isNaN(h)) return '';
  return parseFloat((c * h).toFixed(4));
}

function joinArr(v) {
  if (Array.isArray(v)) return v.join('; ');
  if (v === undefined || v === null) return '';
  return String(v);
}

function getArr(answers, key) {
  var v = answers[key];
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// writeToSheets — top-level dispatcher
// ---------------------------------------------------------------------------

function writeToSheets(submissionId, email, name, answers, questionnaireVersion) {
  var timestamp = new Date().toISOString();

  // Construct pi_name once; used as column B in every sheet
  var piSalutation = val(answers, 'A_pi_salutation');
  var piFullName   = val(answers, 'A_pi_name');
  var piName = [piSalutation, piFullName].filter(Boolean).join(' ');

  writeSubmissions(submissionId, piName, timestamp, email, name, answers, questionnaireVersion);
  writeRespondentInfo(submissionId, piName, answers);
  writeWorkloads(submissionId, piName, answers);
  writeJobSetups(submissionId, piName, answers);
  writeRuntimeRecords(submissionId, piName, answers);
  writeBenchmarkRequests(submissionId, piName, answers);
  writeWallTimeTerminations(submissionId, piName, answers);
  writeCheckpointInfo(submissionId, piName, answers);
  writeScalingInfo(submissionId, piName, answers);
  writeMemoryInfo(submissionId, piName, answers);
  writeGpuInfo(submissionId, piName, answers);
  writeIndependentJobs(submissionId, piName, answers);
  writePipelineJobs(submissionId, piName, answers);
  writeExtendedCalcs(submissionId, piName, answers);
  writeServiceObservations(submissionId, piName, answers);
  writeCommitteeAssessmentPlaceholder(submissionId, piName);
}

// ---------------------------------------------------------------------------
// Section writers — every row starts with [submissionId, piName, ...]
// ---------------------------------------------------------------------------

function writeSubmissions(submissionId, piName, timestamp, email, name, answers, version) {
  appendRow('Submissions', [
    submissionId, piName, timestamp, email, name,
    val(answers, 'A_pi_email'),
    val(answers, 'A_group_name'),
    val(answers, 'A_department'),
    version,
    'submitted'
  ]);
}

function writeRespondentInfo(submissionId, piName, answers) {
  appendRow('RespondentInfo', [
    submissionId, piName,
    val(answers, 'A_pi_salutation'),
    val(answers, 'A_pi_email'),
    val(answers, 'A_group_name'),
    val(answers, 'A_department'),
    val(answers, 'A_completed_by_name'),
    val(answers, 'A_completed_by_email'),
    val(answers, 'A_completed_by_role'),
    val(answers, 'A_research_description')
  ]);
}

function writeWorkloads(submissionId, piName, answers) {
  var codes = getArr(answers, 'B_codes');
  if (codes.length === 0) {
    appendRow('Workloads', [submissionId, piName, '', '', '', '', '', '', '', '']);
    return;
  }
  codes.forEach(function(entry, idx) {
    appendRow('Workloads', [
      submissionId, piName,
      idx + 1,
      entry['B_code_name'] || '',
      entry['B_code_version'] || '',
      entry['B_code_reference'] || '',
      joinArr(entry['B_code_categories']),
      entry['B_code_categories_other'] || '',
      entry['B_code_job_count_range'] || '',
      entry['B_code_notes'] || ''
    ]);
  });
}

function writeJobSetups(submissionId, piName, answers) {
  var configs = getArr(answers, 'C_configs');
  if (configs.length === 0) {
    appendRow('JobSetups', [submissionId, piName, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    return;
  }
  configs.forEach(function(entry, idx) {
    appendRow('JobSetups', [
      submissionId, piName,
      idx + 1,
      entry['C_config_workload_ref'] || '',
      entry['C_config_system_name'] || '',
      entry['C_config_system_type'] || '',
      entry['C_config_nodes_range'] || '',
      entry['C_config_cores_range'] || '',
      entry['C_config_uses_gpu'] || '',
      entry['C_config_gpus_per_node_range'] || '',
      entry['C_config_gpu_model'] || '',
      entry['C_config_memory_range'] || '',
      entry['C_config_storage_range'] || '',
      entry['C_config_interconnect_sensitive'] || '',
      entry['C_config_notes'] || ''
    ]);
  });
}

function writeRuntimeRecords(submissionId, piName, answers) {
  var records = getArr(answers, 'D_runtime_records');
  if (records.length === 0) {
    appendRow('RuntimeRecords', [submissionId, piName, '', '', '', '', '', '', '', '', '', '']);
    return;
  }
  records.forEach(function(entry, idx) {
    appendRow('RuntimeRecords', [
      submissionId, piName,
      idx + 1,
      entry['D_rt_workload_name'] || '',
      entry['D_rt_resource_config'] || '',
      entry['D_rt_wall_time_hours'] || '',
      entry['D_rt_cpu_gpu_hours'] || '',
      entry['D_rt_num_similar_jobs'] || '',
      entry['D_rt_evidence_source'] || '',
      entry['D_rt_evidence_level'] || '',
      entry['D_rt_hardware'] || '',
      entry['D_rt_notes'] || ''
    ]);
  });
}

function writeWallTimeTerminations(submissionId, piName, answers) {
  var terminatedWallTimeHours = durationToHours(answers, 'E_terminated_wall_time');
  var terminatedCores         = val(answers, 'E_terminated_cores');
  var completedWallTimeHours  = durationToHours(answers, 'E_completed_wall_time');
  var completedCores          = val(answers, 'E_completed_cores');

  appendRow('WallTimeTerminations', [
    submissionId, piName,
    val(answers, 'E_terminated'),
    val(answers, 'E_frequency'),
    terminatedCores,
    terminatedWallTimeHours,
    computeCpuHours(terminatedCores, terminatedWallTimeHours),
    val(answers, 'E_completed_anywhere'),
    val(answers, 'E_completed_system'),
    completedCores,
    completedWallTimeHours,
    computeCpuHours(completedCores, completedWallTimeHours),
    val(answers, 'E_notes')
  ]);
}

function writeCheckpointInfo(submissionId, piName, answers) {
  var records = getArr(answers, 'F_checkpoint_records');
  if (records.length === 0) {
    appendRow('CheckpointInfo', [submissionId, piName, '', '', '', '', '', '', '', '', '', '', '', '']);
    return;
  }
  records.forEach(function(entry, idx) {
    appendRow('CheckpointInfo', [
      submissionId, piName,
      entry['F_checkpoint_workload'] || '',
      entry['F_supported'] || '',
      entry['F_checkpoint_type'] || '',
      durationToHours(entry, 'F_checkpoint_interval'),
      entry['F_restart_automatic'] || '',
      durationToHours(entry, 'F_restart_overhead'),
      entry['F_restart_errors'] || '',
      entry['F_checkpoint_abandoned'] || '',
      entry['F_abandoned_reason'] || '',
      entry['F_abandoned_reason_other'] || '',
      entry['F_currently_used'] || '',
      entry['F_notes'] || ''
    ]);
  });
}

function writeScalingInfo(submissionId, piName, answers) {
  var outerRecords = getArr(answers, 'G_scaling_records');
  if (outerRecords.length === 0) {
    appendRow('ScalingInfo', [submissionId, piName, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    return;
  }
  outerRecords.forEach(function(codeEntry) {
    var codeName   = codeEntry['G_code_name'] || '';
    var indJobs    = codeEntry['G_independent_jobs'] || '';
    var indNotes   = codeEntry['G_independent_jobs_notes'] || '';
    var scalingBehaviour = codeEntry['G_scaling_behaviour'] || '';
    var scalingLimitCores = codeEntry['G_scaling_limit_cores'] || '';
    var minCores   = codeEntry['G_min_cores'] || '';
    var maxCores   = codeEntry['G_max_cores_tested'] || '';
    var codeNotes  = codeEntry['G_notes'] || '';
    var innerData  = Array.isArray(codeEntry['G_scaling_data']) ? codeEntry['G_scaling_data'] : [];

    if (innerData.length === 0) {
      appendRow('ScalingInfo', [
        submissionId, piName, codeName,
        indJobs, indNotes, scalingBehaviour, scalingLimitCores, minCores, maxCores, codeNotes,
        '', '', '', '', '', ''
      ]);
    } else {
      innerData.forEach(function(cfg) {
        appendRow('ScalingInfo', [
          submissionId, piName, codeName,
          indJobs, indNotes, scalingBehaviour, scalingLimitCores, minCores, maxCores, codeNotes,
          cfg['G_sd_resource_config'] || '',
          cfg['G_sd_wall_time_hours'] || '',
          cfg['G_sd_evidence_source'] || '',
          cfg['G_sd_evidence_level'] || '',
          cfg['G_sd_benchmark_reference'] || '',
          cfg['G_sd_notes'] || ''
        ]);
      });
    }
  });
}

function writeMemoryInfo(submissionId, piName, answers) {
  var records = getArr(answers, 'H_memory_records');
  if (records.length === 0) {
    appendRow('MemoryInfo', [submissionId, piName, '', '', '', '', '', '', '', '', '']);
    return;
  }
  records.forEach(function(entry) {
    appendRow('MemoryInfo', [
      submissionId, piName,
      entry['H_code_name'] || '',
      entry['H_typical_memory_gb'] || '',
      entry['H_peak_memory_gb'] || '',
      entry['H_minimum_workable_gb'] || '',
      entry['H_memory_distribution'] || '',
      entry['H_standard_nodes_tested'] || '',
      entry['H_evidence_source'] || '',
      entry['H_evidence_level'] || '',
      entry['H_notes'] || ''
    ]);
  });
}

function writeGpuInfo(submissionId, piName, answers) {
  var records = getArr(answers, 'I_gpu_records');
  if (records.length === 0) {
    appendRow('GpuInfo', [submissionId, piName, '', '', '', '', '', '', '', '', '']);
    return;
  }
  records.forEach(function(entry) {
    appendRow('GpuInfo', [
      submissionId, piName,
      entry['I_code_name'] || '',
      entry['I_uses_gpu'] || '',
      entry['I_gpu_model'] || '',
      joinArr(entry['I_gpu_frameworks']),
      entry['I_performance_with_gpu'] || '',
      entry['I_performance_without_gpu'] || '',
      entry['I_evidence_source'] || '',
      entry['I_specialised_interconnect'] || '',
      entry['I_notes'] || ''
    ]);
  });
}

function writeIndependentJobs(submissionId, piName, answers) {
  if (getArr(answers, 'J_workflow_types').indexOf('independent') === -1) return;
  appendRow('IndependentJobs', [
    submissionId, piName,
    val(answers, 'J_ind_job_count'),
    durationToHours(answers, 'J_ind_wall_time'),
    val(answers, 'J_ind_concurrent'),
    val(answers, 'J_ind_turnaround'),
    val(answers, 'J_ind_cpu_hours_used'),
    val(answers, 'J_ind_cpu_hours_needed')
  ]);
}

function writePipelineJobs(submissionId, piName, answers) {
  if (getArr(answers, 'J_workflow_types').indexOf('pipeline') === -1) return;
  appendRow('PipelineJobs', [
    submissionId, piName,
    val(answers, 'J_pip_stages'),
    durationToHours(answers, 'J_pip_stage_wall_time'),
    val(answers, 'J_pip_stage_parallel'),
    val(answers, 'J_pip_count_per_year'),
    durationToHours(answers, 'J_pip_end_to_end'),
    val(answers, 'J_pip_cpu_hours_used'),
    val(answers, 'J_pip_cpu_hours_needed')
  ]);
}

function writeExtendedCalcs(submissionId, piName, answers) {
  if (getArr(answers, 'J_workflow_types').indexOf('extended') === -1) return;
  appendRow('ExtendedCalcs', [
    submissionId, piName,
    durationToHours(answers, 'J_ext_wall_time'),
    durationToHours(answers, 'J_ext_longest_available'),
    val(answers, 'J_ext_completed'),
    val(answers, 'J_ext_completed_system'),
    val(answers, 'J_ext_can_checkpoint'),
    val(answers, 'J_ext_count_per_year'),
    val(answers, 'J_ext_cpu_hours_used'),
    val(answers, 'J_ext_cpu_hours_needed')
  ]);
}

function writeBenchmarkRequests(submissionId, piName, answers) {
  var requested = val(answers, 'D_benchmark_request');
  if (!requested || requested === 'no') return;
  appendRow('BenchmarkRequests', [
    submissionId, piName,
    requested,
    val(answers, 'D_benchmark_codes')
  ]);
}

function writeServiceObservations(submissionId, piName, answers) {
  appendRow('ServiceObservations', [
    submissionId, piName,
    joinArr(answers['N_problems']),
    val(answers, 'N_problems_other'),
    joinArr(answers['N_workload_chars'])
  ]);
}

function writeCommitteeAssessmentPlaceholder(submissionId, piName) {
  appendRow('CommitteeAssessment', [
    submissionId, piName, '', '', '', '', '', '', ''
  ]);
}
