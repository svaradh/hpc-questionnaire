/**
 * TypeScript types for the HPC questionnaire submission data model (schema 2.0.0).
 *
 * Entities mirror the response-sheet tabs written by apps-script/SheetWriter.gs,
 * keeping the separation required by the project specification (section 10):
 * respondent/group, workloads, resources, runtimes, evidence, checkpoint,
 * scaling, service observations and committee assessment. In v3 the resource,
 * runtime and evidence facts of a typical job live together in one
 * WorkloadRecord (one code described once); follow-up records refer to it
 * by name.
 *
 * Conventions:
 * - Quantities are normalised to base units on write: hours (time), GB (size).
 * - Every numeric field may hold 'dont_know'. It must NEVER be read as 0 or "No".
 * - Derived fields are computed by the writer, never asked of respondents.
 *
 * IMPORTANT: Nothing in this data model produces a priority score,
 * ranks users, or assigns QoS classes. The submission is evidence.
 * Policy interpretation is a committee responsibility.
 */

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

/** Stored for any question answered "Don't know / not aware". */
export type Unknown = 'dont_know'

/** A measured or estimated number, or an explicit unknown. */
export type NumOrUnknown = number | Unknown

/** Submission lifecycle status. */
export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'assessed'

/**
 * Evidence confidence levels (1 = highest confidence, 5 = lowest), derived
 * from WorkloadRecord.source. They indicate evidence quality and must NOT
 * be used to rank or score users.
 *   1 — Direct production observation (Gargi, Raman)
 *   2 — Reproducible benchmark
 *   3 — Historical/external production evidence
 *   4 — Published / developer data
 *   5 — Projection (estimate)
 */
export type EvidenceLevel = 1 | 2 | 3 | 4 | 5

export type EvidenceSource =
  | 'gargi' | 'raman' | 'iiserb_earlier' | 'national' | 'collaborator'
  | 'cloud' | 'benchmark' | 'published' | 'estimate' | Unknown

/** Observed operational problems (factual, not entitlement claims). */
export type OperationalProblem =
  | 'wall_time_termination'
  | 'excessive_queue_wait'
  | 'insufficient_node_count'
  | 'insufficient_memory'
  | 'insufficient_gpu_access'
  | 'insufficient_total_capacity'
  | 'scratch_insufficient'
  | 'debug_wait'
  | 'other'
  | 'no_problems_observed'
  | 'no_hpc_experience'
  | Unknown

/** How a workload's jobs are organised (several may apply). */
export type WorkflowPattern = 'standalone' | 'independent' | 'chain' | 'long_calc' | 'campaign' | Unknown

/** Effect on wall time of doubling the cores (ratio new/old wall time). */
export type DoublingEffect = 'le_0_6' | '0_6_0_8' | 'gt_0_8' | 'longer' | 'not_tested' | Unknown

// ---------------------------------------------------------------------------
// 1. Respondent / group (Section A) — tab "Group"
// ---------------------------------------------------------------------------

export interface GroupInfo {
  piSalutation: string
  piName: string
  piEmail: string
  groupName: string
  department: string
  completedBy: { name: string; email: string; role: string }
  hpcUsersNow?: NumOrUnknown
  hpcUsers3y?: NumOrUnknown
  researchDescription?: string
}

// ---------------------------------------------------------------------------
// 2. Service observations (Section B) — tab "Experience"
// ---------------------------------------------------------------------------

export interface ExperienceRecord {
  systemsUsed: string[]
  /** % of core-hours run on IISER Bhopal clusters in the last 12 months. */
  shareIiserbPct?: NumOrUnknown
  problems: OperationalProblem[]
  problemsOther?: string
  /** Systems on which the problems occurred (gargi / raman / iiserb_earlier / elsewhere). */
  problemsWhere?: string[]
  /** Follow-up sections declared "not aware / unable to characterise". */
  notAwareSections?: string[]
}

// ---------------------------------------------------------------------------
// 3–5. Workloads: resources, runtime and evidence of a typical job
//      (Section C) — tab "Workloads", one row per code (max 3)
// ---------------------------------------------------------------------------

export interface WorkloadRecord {
  code: string
  type: string[]
  source?: EvidenceSource
  // Resources and runtime of a typical job
  /** Whether the typical job is CPU-only or GPU; gives context to the numbers below. */
  device?: 'cpu' | 'gpu' | Unknown
  nodes?: NumOrUnknown
  /** CPU cores (for GPU jobs: the cores allocated alongside the GPUs). */
  cores?: NumOrUnknown
  gpus?: NumOrUnknown
  memNodeGb?: NumOrUnknown
  walltimeH?: NumOrUnknown
  scratchMinGb?: NumOrUnknown
  // Volume
  jobsYear?: NumOrUnknown
  jobsYearUnconstrained?: NumOrUnknown
  concurrent?: NumOrUnknown
  // Organisation
  organisation: WorkflowPattern[]
  batchSize?: NumOrUnknown
  chainSteps?: NumOrUnknown
  chainElapsedH?: NumOrUnknown
  longTotalH?: NumOrUnknown
  campaignCores?: NumOrUnknown
  campaignGpus?: NumOrUnknown
  campaignDurationH?: NumOrUnknown
  campaignsYear?: NumOrUnknown
  // GPU / CPU balance
  gpuVersion?: 'in_use' | 'tested_not_adopted' | 'available_not_tested' | 'none' | Unknown
  gpuSpeedup?: 'lt_2' | '2_5' | '5_20' | 'gt_20' | 'not_measured' | Unknown
  cpuViable?: 'similar' | '2_5_slower' | 'gt_5_slower' | 'no' | Unknown
  // Derived (blank when any input is missing or unknown)
  coreHoursYear?: number
  coreHoursYearUnconstrained?: number
  gpuHoursYear?: number
  peakConcurrentCores?: number
  peakConcurrentGpus?: number
  peakConcurrentScratchGb?: number
  evidenceLevel?: EvidenceLevel
}

/** Section D — tab "StorageTesting". */
export interface StorageTestingRecord {
  persistentNowGb?: NumOrUnknown
  persistent3yGb?: NumOrUnknown
  scratchResidence?: 'none' | 'lt_1d' | '1_7d' | 'gt_7d' | Unknown
  usesDebug?: 'yes' | 'no' | Unknown
  sessionsWeek?: NumOrUnknown
  sessionDevice?: 'cpu' | 'gpu' | Unknown
  sessionCores?: NumOrUnknown
  sessionGpus?: NumOrUnknown
  sessionLengthH?: NumOrUnknown
  purpose?: string[]
  otherCodes?: string
}

// ---------------------------------------------------------------------------
// 6–8. Follow-up records (Section E1–E6), each referring to a workload by name
// ---------------------------------------------------------------------------

/** E1 — tab "LongJobs" (includes checkpoint/restart information). */
export interface LongJobRecord {
  workload: string
  device?: 'cpu' | 'gpu' | Unknown
  longestRunH?: NumOrUnknown
  longestCores?: NumOrUnknown
  longestGpus?: NumOrUnknown
  checkpoint?: 'yes' | 'no' | 'not_tested' | Unknown
  restartLossH?: NumOrUnknown
  doublingEffect?: DoublingEffect
  terminations12m?: NumOrUnknown
}

/** E2 — tab "Scaling". Up to three measured (CPU cores or GPUs, wall time) pairs. */
export interface ScalingRecord {
  workload: string
  /** Which resource the measurements vary. */
  scaleOver?: 'cpu' | 'gpu' | Unknown
  points: Array<{ cores?: NumOrUnknown; gpus?: NumOrUnknown; walltimeH?: NumOrUnknown }>
  doublingEffect?: DoublingEffect
  maxCoresTested?: NumOrUnknown
  maxGpusTested?: NumOrUnknown
  maxCoresUseful?: NumOrUnknown
  maxGpusUseful?: NumOrUnknown
}

/** E3 — tab "Memory". */
export interface MemoryRecord {
  workload: string
  peakGb?: NumOrUnknown
  fitsStandardNode?: 'yes' | 'fails_oom' | 'not_tested' | Unknown
  distributable?: 'yes' | 'no' | Unknown
}

/** E4 — tab "Gpu". */
export interface GpuRecord {
  workload: string
  gpuModel?: string
  memPerGpuGb?: NumOrUnknown
  maxGpusPerJob?: NumOrUnknown
  nvlinkNeeded?: 'yes' | 'no' | Unknown
  multinodeGpu?: 'yes_now' | 'yes_planned' | 'no' | Unknown
}

/** E5 — tab "Scratch". */
export interface ScratchRecord {
  workload: string
  peakGb?: NumOrUnknown
  filesPerJob?: 'lt_1k' | '1k_100k' | 'gt_100k' | Unknown
  filePattern?: 'few_large' | 'many_small' | 'both' | Unknown
  localDiskPossible?: 'yes' | 'no' | Unknown
}

/** E6 — tab "Queue". */
export interface QueueRecord {
  cluster?: string[]
  typicalWaitH?: NumOrUnknown
  longestWaitH?: NumOrUnknown
  shareNotRunPct?: NumOrUnknown
}

/** Section F — tab "Closing". */
export interface ClosingRecord {
  growth3yFactor?: NumOrUnknown
  benchmarkHelp?: 'yes' | 'no' | 'not_sure'
  benchmarkCodes?: string
  volunteer?: 'yes' | 'possibly' | 'no'
  volunteerCodes?: string
  comments?: string
}

// ---------------------------------------------------------------------------
// 9. Committee assessment — tab "CommitteeAssessment" (committee only)
// ---------------------------------------------------------------------------

/**
 * Triage categories (CLAUDE.md §8):
 *   1 — automatically characterised
 *   2 — clarification needed
 *   3 — technical assessment
 */
export interface CommitteeAssessment {
  triageCategory?: 1 | 2 | 3
  assessor?: string
  assessedAt?: string
  findings?: string
  recommendedQos?: string
  followUpRequired?: boolean
  followUpNotes?: string
}

// ---------------------------------------------------------------------------
// Top-level submission
// ---------------------------------------------------------------------------

export interface Submission {
  id: string
  /** Schema version the submission was completed against, e.g. "2.0.0". */
  questionnaireVersion: string
  status: SubmissionStatus
  submittedAt?: string

  group: GroupInfo
  experience: ExperienceRecord
  workloads: WorkloadRecord[]
  storageTesting: StorageTestingRecord
  longJobs: LongJobRecord[]
  scaling: ScalingRecord[]
  memory: MemoryRecord[]
  gpu: GpuRecord[]
  scratch: ScratchRecord[]
  queue?: QueueRecord
  closing: ClosingRecord
  committeeAssessment?: CommitteeAssessment

  /** Raw flat answers from the form, keyed by questionId (primary store in the UI). */
  rawAnswers: Record<string, unknown>
}
