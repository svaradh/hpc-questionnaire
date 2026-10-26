/**
 * make_synthetic.ts — builds a synthetic v3 response dataset for testing the
 * analysis notebooks. Each made-up submission goes through the form's own
 * submit step (answersForSubmission: hidden answers dropped, `_panels` and
 * `_triggers` added to each workload entry) and then the real apps-script/SheetWriter.gs, so
 * column names, follow-up rows and derived values match production.
 *
 * Usage:  npx tsx analysis/fixtures/make_synthetic.ts
 * Output: analysis/fixtures/synthetic_v3/<Tab>.csv
 *
 * ALL GROUPS BELOW ARE FICTIONAL. Each one is designed to exercise a
 * particular analysis path (noted in the comment above it).
 */

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import schemaData from '../../src/schema/questionnaire.json'
import { answersForSubmission, missingRequired } from '../../src/utils/conditions'
import type { QuestionnaireSchema } from '../../src/types/schema'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(HERE, 'synthetic_v3')
const schema = schemaData as unknown as QuestionnaireSchema

const tabs: Record<string, unknown[][]> = {}
const ctx: Record<string, unknown> = {
  SPREADSHEET_ID: 'synthetic', Logger: { log() {} },
  SpreadsheetApp: { openById: () => ({ getSheetByName: (n: string) => ({ appendRow: (r: unknown[]) => (tabs[n] = tabs[n] || []).push(r) }) }) },
}
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script/SheetWriter.gs'), 'utf8'), ctx)

const h = (v: number) => ({ value: v, unit: 'hours' })
const d = (v: number) => ({ value: v, unit: 'days' })
const gb = (v: number) => ({ value: v, unit: 'GB' })
const tb = (v: number) => ({ value: v, unit: 'TB' })
const group = (n: number, dept: string, extra: Record<string, unknown>) => ({
  A_pi_salutation: 'Dr.', A_pi_name: `Synthetic PI ${n}`, A_pi_email: `pi${n}@example.org`,
  A_group_name: `Synthetic Group ${n}`, A_department: dept, A_pi_is_respondent: 'yes',
  A_completed_by_name: `Synthetic PI ${n}`, A_completed_by_email: `pi${n}@example.org`, A_completed_by_role: 'pi',
  ...extra,
})

const submissions = [
  // 1. High-scaling DFT on Gargi: long jobs WITH checkpointing; wants more nodes than policy allows.
  //    A second Quantum ESPRESSO entry (AIMD) answers its long-runs panel "same as" the first.
  group(1, 'chemistry', {
    A_hpc_users_now: 6, A_hpc_users_3y: 9,
    X_systems_used: ['gargi', 'national'], X_share_iiserb: 60,
    X_problems: ['wall_time_termination', 'insufficient_node_count'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'Quantum ESPRESSO', W_job_kind: 'ground-state relaxations', W_type: ['electronic_structure'], W_source: 'gargi', W_cluster: 'gargi',
      W_affected: ['wall_time_termination', 'insufficient_node_count'], W_device: 'cpu',
      W_nodes: 3, W_cores: 384, W_mem_node: gb(300), W_walltime: h(70), W_input_read: gb(2), W_scratch_write: gb(150),
      W_jobs_year: 300, W_jobs_year_unconstrained: 500, W_concurrent: 4, W_org: ['independent', 'long_calc'],
      W_batch_size: 20, W_seq_jobs: 3, W_seq_run: d(8), W_seq_calendar: d(14),
      W_gpu_version: 'tested_not_adopted', W_gpu_speedup: '2_5',
      L_checkpoint: 'yes', L_restart_loss: { value: 20, unit: 'minutes' }, L_terminations_12m: 25,
      P_doubling: 'le_0_6', P_cores_1: 256, P_wt_1: h(100), P_cores_2: 512, P_wt_2: h(55), P_run3: 'added', P_cores_3: 1024, P_wt_3: h(31),
      P_max_tested: 1024, P_max_useful: 1024 },
    // Same code, different kind of job: reuses entry 1's long-runs answers ("Same answers as")
    { W_code: 'Quantum ESPRESSO', W_job_kind: 'ab initio MD', W_type: ['electronic_structure', 'molecular_dynamics'], W_source: 'gargi',
      W_cluster: 'gargi', W_affected: ['wall_time_termination'], W_device: 'cpu',
      W_nodes: 2, W_cores: 256, W_mem_node: gb(200), W_walltime: h(100), W_input_read: gb(1), W_scratch_write: gb(20),
      W_jobs_year: 40, W_jobs_year_unconstrained: 80, W_concurrent: 2, W_org: ['long_calc'],
      W_seq_jobs: 4, W_seq_run: d(16), W_seq_calendar: d(30), W_gpu_version: 'tested_not_adopted', W_gpu_speedup: '2_5',
      SAME_long: true,
      P_doubling: 'gt_0_8', P_runs_unknown: ['dont_know'], P_max_tested: 256, P_max_useful: 'dont_know' }],
    S_home_now: tb(1.5), S_home_3y: tb(2.5), S_output_stay: '1_4w', T_uses_debug: 'yes', T_sessions_week: 15,
    T_session_device: 'cpu', T_session_cores: 64, T_session_length: { value: 45, unit: 'minutes' }, T_purpose: ['test_inputs'],
    Z_growth_3y: 1.8,
  }),
  // 2. GPU MD throughput on Raman: GPU queue limits, queue waits; CPU only viable at >5x
  group(2, 'chemistry', {
    A_hpc_users_now: 5, A_hpc_users_3y: 8,
    X_systems_used: ['raman', 'collaborator'], X_share_iiserb: 30,
    X_problems: ['insufficient_gpu_access', 'excessive_queue_wait'], X_problems_where: ['raman'],
    W_workloads: [{ W_code: 'GROMACS', W_job_kind: 'protein MD', W_type: ['molecular_dynamics'], W_source: 'raman', W_cluster: 'raman',
      W_affected: ['insufficient_gpu_access', 'excessive_queue_wait'], W_device: 'gpu',
      W_nodes: 1, W_cores: 12, W_gpus: 1, W_mem_node: gb(40), W_walltime: h(48), W_input_read: gb(1), W_scratch_write: gb(20),
      W_jobs_year: 120, W_jobs_year_unconstrained: 600, W_concurrent: 8, W_org: ['independent'], W_batch_size: 10,
      W_gpu_version: 'in_use', W_gpu_speedup: '5_20', W_cpu_viable: 'gt_5_slower',
      L_checkpoint: 'yes', L_restart_loss: { value: 5, unit: 'minutes' }, L_terminations_12m: 40,
      P_doubling: 'not_tested',
      G_model: 'NVIDIA A100', G_mem_per_gpu: gb(40), G_max_gpus: 2, G_nvlink: 'no', G_multinode: 'no' }],
    Q_records: [{ Q_queue: 'raman.gpu', Q_workload: 'GROMACS — protein MD', Q_same_as_typical: 'yes', Q_typical_wait: d(3), Q_longest_wait: d(9) }],
    Q_share_not_run: 60,
    S_home_now: gb(800), S_home_3y: tb(1.2), S_output_stay: 'lt_1w', T_uses_debug: 'no', Z_growth_3y: 2,
  }),
  // 3. Climate model: long, NOT checkpointable, low scaling -> genuine long-wall-time candidate
  group(3, 'earth_environmental', {
    A_hpc_users_now: 3, A_hpc_users_3y: 4,
    X_systems_used: ['gargi'], X_problems: ['wall_time_termination'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'WRF', W_job_kind: 'regional climate runs', W_type: ['climate_environmental'], W_source: 'gargi', W_cluster: 'gargi',
      W_affected: ['wall_time_termination'], W_device: 'cpu',
      W_nodes: 1, W_cores: 128, W_mem_node: gb(200), W_walltime: d(9), W_input_read: gb(300), W_scratch_write: gb(400),
      W_jobs_year: 20, W_jobs_year_unconstrained: 30, W_concurrent: 2, W_org: ['long_calc'],
      W_seq_jobs: 2, W_seq_run: d(9), W_seq_calendar: d(12), W_gpu_version: 'none',
      L_checkpoint: 'no', L_longest_run: d(9), L_terminations_12m: 6,
      P_doubling: 'gt_0_8', P_cores_1: 64, P_wt_1: d(10), P_cores_2: 128, P_wt_2: d(9), P_max_tested: 256, P_max_useful: 128 }],
    S_home_now: tb(3), S_home_3y: tb(5), S_output_stay: 'gt_3m', T_uses_debug: 'dont_know', Z_growth_3y: 1.2,
  }),
  // 4. Exact diagonalisation: high memory, single node
  group(4, 'physics', {
    A_hpc_users_now: 2, A_hpc_users_3y: 2,
    X_systems_used: ['gargi'], X_problems: ['insufficient_memory'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'ED-custom', W_job_kind: 'exact diagonalisation', W_type: ['many_body_exact_diagonalisation'], W_source: 'gargi', W_cluster: 'gargi',
      W_affected: ['insufficient_memory'], W_device: 'cpu',
      W_nodes: 1, W_cores: 128, W_mem_node: tb(1.8), W_walltime: h(100), W_input_read: gb(0), W_scratch_write: gb(0),
      W_jobs_year: 40, W_jobs_year_unconstrained: 60, W_concurrent: 1, W_org: ['standalone'], W_gpu_version: 'dont_know',
      M_fits_standard: 'fails_oom', M_distributable: 'no' }],
    S_home_now: gb(300), S_home_3y: gb(500), S_output_stay: '1_4w', T_uses_debug: 'no', Z_growth_3y: 1.5,
  }),
  // 5. Bioinformatics: many small independent jobs, concurrency-limited, queue waits on Gargi short
  group(5, 'biological_sciences', {
    A_hpc_users_now: 8, A_hpc_users_3y: 12,
    X_systems_used: ['gargi', 'cloud'], X_share_iiserb: 70,
    X_problems: ['excessive_queue_wait', 'insufficient_total_capacity'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'GATK', W_job_kind: 'variant calling', W_type: ['bioinformatics_genomics'], W_source: 'gargi', W_cluster: 'gargi',
      W_affected: ['excessive_queue_wait', 'insufficient_total_capacity'], W_device: 'cpu',
      W_nodes: 1, W_cores: 16, W_mem_node: gb(64), W_walltime: h(6), W_input_read: gb(30), W_scratch_write: gb(50),
      W_jobs_year: 15000, W_jobs_year_unconstrained: 30000, W_concurrent: 60, W_org: ['independent'], W_batch_size: 500,
      W_gpu_version: 'available_not_tested',
      SC_input_readonly: 'yes', SC_reread: 'no', SC_io_share: '10_30', SC_files: '1k_100k', SC_local_disk: 'dont_know', SC_residence: 'none' }],
    Q_records: [{ Q_queue: 'gargi.short', Q_workload: 'GATK — variant calling', Q_same_as_typical: 'yes', Q_typical_wait: h(10), Q_longest_wait: d(3) }],
    Q_share_not_run: 40,
    S_home_now: tb(4), S_home_3y: tb(10), S_output_stay: '1_3m', T_uses_debug: 'yes', T_sessions_week: 30,
    T_session_device: 'cpu', T_session_cores: 8, T_session_length: h(2), T_purpose: ['notebooks', 'test_inputs'], Z_growth_3y: 2.5,
  }),
  // 6. ML on GPUs, cluster not decided (unattributed demand); large inputs read from scratch
  group(6, 'mathematics', {
    A_hpc_users_now: 4, A_hpc_users_3y: 10,
    X_systems_used: ['workstation', 'cloud'], X_share_iiserb: 0, X_problems: ['insufficient_gpu_access'], X_problems_where: ['elsewhere'],
    W_workloads: [{ W_code: 'PyTorch', W_job_kind: 'model training', W_type: ['machine_learning'], W_source: 'estimate', W_cluster: 'not_decided',
      W_affected: ['insufficient_gpu_access'], W_device: 'gpu',
      W_nodes: 1, W_cores: 16, W_gpus: 4, W_mem_node: gb(128), W_walltime: h(20), W_input_read: tb(1.5), W_scratch_write: gb(500),
      W_jobs_year: 50, W_jobs_year_unconstrained: 300, W_concurrent: 2, W_org: ['standalone'],
      W_gpu_version: 'in_use', W_gpu_speedup: 'gt_20', W_cpu_viable: 'no',
      G_model: 'NVIDIA H100', G_mem_per_gpu: gb(80), G_max_gpus: 8, G_nvlink: 'yes', G_multinode: 'yes_planned',
      SC_input_readonly: 'yes', SC_reread: 'no', SC_io_share: '10_30', SC_files: '1k_100k', SC_local_disk: 'yes', SC_residence: 'lt_1d' }],
    S_home_now: tb(2), S_home_3y: tb(6), S_output_stay: 'dont_know', T_uses_debug: 'yes', T_sessions_week: 10,
    T_session_device: 'gpu', T_session_cores: 8, T_session_gpus: 1, T_session_length: h(3), T_purpose: ['notebooks'], Z_growth_3y: 4,
  }),
  // 7. Ordinary user, no problems
  group(7, 'physics', {
    A_hpc_users_now: 2, A_hpc_users_3y: 2,
    X_systems_used: ['gargi'], X_problems: ['no_problems_observed'],
    W_workloads: [{ W_code: 'Quantum ESPRESSO', W_job_kind: 'ground-state relaxations', W_type: ['electronic_structure'], W_source: 'gargi', W_cluster: 'gargi', W_device: 'cpu',
      W_nodes: 1, W_cores: 64, W_mem_node: gb(100), W_walltime: h(10), W_input_read: gb(1), W_scratch_write: gb(10),
      W_jobs_year: 150, W_jobs_year_unconstrained: 150, W_concurrent: 3, W_org: ['standalone'], W_gpu_version: 'available_not_tested' }],
    S_home_now: gb(200), S_home_3y: gb(300), S_output_stay: 'lt_1w', T_uses_debug: 'no', Z_growth_3y: 1,
  }),
  // 8. Mostly "Don't know": clarification candidate; "don't know these details" on the long-runs panel
  group(8, 'humanities_social_sciences', {
    A_hpc_users_now: 'dont_know', A_hpc_users_3y: 'dont_know',
    X_systems_used: ['raman'], X_problems: ['wall_time_termination'], X_problems_where: ['raman'],
    W_workloads: [{ W_code: 'Stata', W_job_kind: 'panel regressions', W_type: ['data_analysis'], W_source: 'dont_know', W_cluster: 'raman',
      W_affected: ['wall_time_termination'], W_device: 'cpu',
      W_nodes: 'dont_know', W_cores: 'dont_know', W_mem_node: 'dont_know', W_walltime: 'dont_know',
      W_input_read: 'dont_know', W_scratch_write: 'dont_know',
      W_jobs_year: 'dont_know', W_jobs_year_unconstrained: 'dont_know', W_org: ['dont_know'], W_gpu_version: 'dont_know',
      NA_long_jobs: true, NA_scaling: true }],
    S_home_now: 'dont_know', S_home_3y: 'dont_know', T_uses_debug: 'dont_know',
  }),
  // 9. LAMMPS coordinated campaign: high scaling, checkpoint "don't know" for a restart-capable code (awareness gap)
  group(9, 'physics', {
    A_hpc_users_now: 4, A_hpc_users_3y: 5,
    X_systems_used: ['gargi', 'national'], X_share_iiserb: 50,
    X_problems: ['insufficient_node_count', 'wall_time_termination'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'LAMMPS', W_job_kind: 'large MD campaign', W_type: ['molecular_dynamics', 'atomistic_simulation'], W_source: 'national', W_cluster: 'gargi',
      W_affected: ['insufficient_node_count', 'wall_time_termination'], W_device: 'cpu',
      W_nodes: 4, W_cores: 512, W_mem_node: gb(150), W_walltime: h(96), W_input_read: gb(10), W_scratch_write: gb(300),
      W_jobs_year: 60, W_jobs_year_unconstrained: 120, W_concurrent: 4, W_org: ['campaign', 'long_calc'],
      W_seq_jobs: 3, W_seq_run: d(12), W_seq_calendar: d(20),
      W_campaign_cores: 2048, W_campaign_duration: d(5), W_campaigns_year: 4, W_gpu_version: 'available_not_tested',
      L_checkpoint: 'dont_know', L_longest_run: d(12), L_terminations_12m: 10,
      P_doubling: 'le_0_6', P_cores_1: 512, P_wt_1: h(96), P_cores_2: 1024, P_wt_2: h(52), 
      P_max_tested: 2048, P_max_useful: 2048 }],
    S_home_now: tb(1), S_home_3y: tb(1.5), S_output_stay: '1_4w', T_uses_debug: 'yes', T_sessions_week: 5,
    T_session_device: 'cpu', T_session_cores: 128, T_session_length: { value: 25, unit: 'minutes' }, T_purpose: ['compile_debug'], Z_growth_3y: 1.5,
  }),
  // 10. CFD sequential chain on Raman (medium queue): queue overhead = calendar − running time
  group(10, 'earth_environmental', {
    A_hpc_users_now: 3, A_hpc_users_3y: 3,
    X_systems_used: ['raman'], X_problems: ['excessive_queue_wait'], X_problems_where: ['raman'],
    W_workloads: [{ W_code: 'OpenFOAM', W_job_kind: 'turbulent flow chain', W_type: ['cfd'], W_source: 'raman', W_cluster: 'raman',
      W_affected: ['excessive_queue_wait'], W_device: 'cpu',
      W_nodes: 4, W_cores: 96, W_mem_node: gb(80), W_walltime: h(60), W_input_read: gb(20), W_scratch_write: gb(100),
      W_jobs_year: 80, W_jobs_year_unconstrained: 150, W_concurrent: 6, W_org: ['chain'],
      W_seq_jobs: 5, W_seq_run: h(220), W_seq_calendar: d(20), W_gpu_version: 'none' }],
    Q_records: [{ Q_queue: 'raman.medium', Q_workload: 'OpenFOAM — turbulent flow chain', Q_same_as_typical: 'no', Q_req_nodes: 4, Q_req_cores: 96,
      Q_req_walltime: h(72), Q_typical_wait: d(2), Q_longest_wait: d(6) }],
    Q_share_not_run: 25,
    S_home_now: gb(600), S_home_3y: tb(1), S_output_stay: '1_4w', T_uses_debug: 'no', Z_growth_3y: 1.3,
  }),
  // 11. Scratch-heavy quantum chemistry: write-heavy, re-read, I/O bound
  group(11, 'chemistry', {
    A_hpc_users_now: 3, A_hpc_users_3y: 4,
    X_systems_used: ['gargi'], X_problems: ['scratch_insufficient'], X_problems_where: ['gargi'],
    W_workloads: [{ W_code: 'Gaussian', W_job_kind: 'conformer screening', W_type: ['electronic_structure'], W_source: 'gargi', W_cluster: 'both',
      W_affected: ['scratch_insufficient'], W_device: 'cpu',
      W_nodes: 1, W_cores: 64, W_mem_node: gb(250), W_walltime: h(30), W_input_read: gb(5), W_scratch_write: tb(2),
      W_jobs_year: 400, W_jobs_year_unconstrained: 600, W_concurrent: 4, W_org: ['independent'], W_batch_size: 'dont_know',
      W_gpu_version: 'none',
      SC_input_readonly: 'yes', SC_reread: 'yes', SC_io_share: 'gt_30', SC_files: 'lt_1k', SC_local_disk: 'dont_know', SC_residence: 'lt_1d' }],
    S_home_now: gb(500), S_home_3y: gb(800), S_output_stay: '1_4w', T_uses_debug: 'no', Z_growth_3y: 1.2,
  }),
  // 12. New group, no HPC experience yet, estimates only
  group(12, 'economics', {
    A_hpc_users_now: 0, A_hpc_users_3y: 3,
    X_systems_used: ['none_yet'], X_problems: ['no_hpc_experience'],
    W_workloads: [{ W_code: 'R', W_job_kind: 'simulations', W_type: ['data_analysis'], W_source: 'estimate', W_cluster: 'dont_know', W_device: 'cpu',
      W_nodes: 1, W_cores: 32, W_mem_node: gb(64), W_walltime: h(4), W_input_read: gb(2), W_scratch_write: gb(5),
      W_jobs_year: 200, W_jobs_year_unconstrained: 200, W_concurrent: 10, W_org: ['independent'], W_batch_size: 50,
      W_gpu_version: 'dont_know' }],
    S_home_now: gb(100), S_home_3y: gb(300), S_output_stay: 'dont_know', T_uses_debug: 'yes', T_sessions_week: 3,
    T_session_device: 'cpu', T_session_cores: 4, T_session_length: h(1), T_purpose: ['notebooks'], Z_growth_3y: 'dont_know',
  }),
]

const write = vm.runInContext('writeToSheets', ctx)
submissions.forEach((a, i) => {
  const id = `SYN-${String(i + 1).padStart(2, '0')}`
  // Fixtures need not be complete; report what the form would still ask for (other than contact details).
  const missing = missingRequired(schema.sections, a).filter(m => m.sectionId !== 'A')
  if (missing.length) console.log(`${id}: ${missing.length} required answers left blank (e.g. ${missing[0].label})`)
  write(id, `pi${i + 1}@example.org`, `Synthetic PI ${i + 1}`, answersForSubmission(schema.sections, a), schema.version)
})

const defs = vm.runInContext('SHEET_DEFINITIONS', ctx)
const headersFor = vm.runInContext('headersFor', ctx)
const headers: Record<string, string[]> = {
  Submissions: vm.runInContext('SUBMISSIONS_HEADERS', ctx),
  CommitteeAssessment: vm.runInContext('COMMITTEE_HEADERS', ctx),
  ...Object.fromEntries(defs.map((dd: { name: string }) => [dd.name, headersFor(dd)])),
}
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
fs.mkdirSync(OUT, { recursive: true })
for (const [name, hdr] of Object.entries(headers)) {
  const rows = (tabs[name] || []).map((r: unknown[]) => r.map(csvCell).join(','))
  fs.writeFileSync(path.join(OUT, `${name}.csv`), [hdr.join(','), ...rows].join('\n') + '\n')
}
console.log(`Wrote ${submissions.length} synthetic submissions to ${path.relative(ROOT, OUT)}/`)
