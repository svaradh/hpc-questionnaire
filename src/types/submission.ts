/**
 * TypeScript types for the HPC questionnaire submission data model.
 *
 * The data model separates nine distinct entities as specified in
 * the project specification (section 10). This separation enables:
 *   - Independent export of each entity type as CSV/JSON
 *   - Committee-facing summaries per entity
 *   - Future database normalisation without changing question logic
 *   - Independent versioning of each entity schema
 *
 * IMPORTANT: Nothing in this data model produces a priority score,
 * ranks users, or assigns QoS classes. The submission is evidence.
 * Policy interpretation is a committee responsibility.
 */

// ---------------------------------------------------------------------------
// Shared vocabulary types
// ---------------------------------------------------------------------------

/**
 * Standard set of answers for technical yes/no questions.
 * "Don't know" is always a valid answer and must NEVER be
 * interpreted as "No" by any automated process.
 */
export type YesNoUncertain =
  | 'yes'
  | 'no'
  | 'dont_know'
  | 'not_applicable'
  | 'not_tested'

/** Submission lifecycle status. */
export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'assessed'

/**
 * Evidence confidence levels (1 = highest confidence, 5 = lowest).
 * These levels indicate the quality of the evidence supplied.
 * They must NOT be used to automatically rank or score users.
 *
 *   1 — Direct production observation
 *   2 — Reproducible benchmark
 *   3 — Historical/external production evidence
 *   4 — Software/scaling evidence
 *   5 — Projection
 */
export type EvidenceLevel = 1 | 2 | 3 | 4 | 5

/** Enumeration of recognised evidence sources. */
export type EvidenceSource =
  | 'current_iiser_hpc'
  | 'historical_iiser_hpc'
  | 'external_hpc_national'
  | 'previous_production'
  | 'collaborator_institutional'
  | 'standardised_benchmark'
  | 'published_software_benchmark'
  | 'developer_vendor_documentation'
  | 'projected_workload'
  | 'other'

/** Role of the person completing the form. */
export type RespondentRole =
  | 'pi'
  | 'postdoctoral_researcher'
  | 'phd_student'
  | 'designated_computational_member'
  | 'technical_staff'
  | 'other'

/** Broad computational workload categories (not user identity categories). */
export type WorkloadCategory =
  | 'electronic_structure'
  | 'molecular_dynamics'
  | 'atomistic_simulation'
  | 'climate_environmental'
  | 'cfd'
  | 'bioinformatics_genomics'
  | 'machine_learning'
  | 'numerical_modelling'
  | 'many_body_exact_diagonalisation'
  | 'data_analysis'
  | 'other'

/** Checkpoint/restart implementation type. */
export type CheckpointType = 'native' | 'external' | 'none' | 'dont_know'

/** Observed operational problems (factual, not entitlement claims). */
export type OperationalProblem =
  | 'wall_time_termination'
  | 'excessive_queue_wait'
  | 'insufficient_node_count'
  | 'insufficient_memory'
  | 'insufficient_gpu_access'
  | 'insufficient_total_capacity'
  | 'no_problems_observed'
  | 'other'

/** System type for resource records (Section C). */
export type SystemType =
  | 'hpc_institutional'
  | 'hpc_national'
  | 'hpc_departmental'
  | 'hpc_collaborator'
  | 'cloud'
  | 'workstation'
  | 'laptop'
  | 'dont_know'

// ---------------------------------------------------------------------------
// 1. Respondent / Research group information
// ---------------------------------------------------------------------------

/** Contact details for the person completing the form. */
export interface CompletedBy {
  name: string
  email: string
  role: RespondentRole
  roleOther?: string
}

/**
 * Section A: Research programme.
 * Collects only contextual information — NOT a classification of
 * the group as computational / non-computational / core / peripheral.
 */
export interface Respondent {
  researchGroupName: string
  department: string
  piName: string
  piEmail: string
  completedBy: CompletedBy
  /**
   * Brief factual description of the research activities for which
   * HPC resources are used or requested.
   * Max ~500 words; free text.
   */
  researchDescription: string
}

// ---------------------------------------------------------------------------
// 2. Workload records
// ---------------------------------------------------------------------------

/**
 * Section B: One entry per principal application / code used by the group.
 * A group may have multiple WorkloadRecords.
 */
export interface WorkloadRecord {
  /** Local UUID for referencing from other records. */
  id: string
  /** Name of the application or code (e.g. "VASP", "GROMACS", "OpenFOAM"). */
  softwareName: string
  /** Version string if known. */
  version?: string
  /** URL or publication reference for the software. */
  softwareReference?: string
  /** Computational workload categories that apply to this code. */
  categories: WorkloadCategory[]
  categoriesOther?: string
  /**
   * Approximate number of production jobs per year using this code.
   * Stored as a range string (e.g. "100–499") because exact counts
   * are rarely known in advance.
   */
  annualJobCountRange?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// 3. Resource records
// ---------------------------------------------------------------------------

/**
 * Section C: Typical job setup for a workload on a specific system.
 * A workload may have multiple ResourceRecords (e.g. different systems
 * or very different configurations on the same system).
 *
 * All numeric resource fields use range strings rather than exact numbers
 * because exact values are rarely known by non-expert respondents and
 * range estimates are sufficient for QoS policy decisions.
 */
export interface ResourceRecord {
  id: string
  /** References a WorkloadRecord.id or code name (free-text match). */
  workloadId: string
  /** Name of the cluster/system as the user knows it (e.g. "IISER HPC", "PARAM Shakti"). */
  systemName?: string
  /** Category of the system. */
  systemType?: SystemType
  /** Number of nodes as a range string (e.g. "2_4", "5_16", "dont_know"). */
  nodesRange?: string
  /** Total CPU cores (all nodes combined) as a range string. */
  totalCpuCoresRange?: string
  /** Whether GPUs are used for this job. */
  gpuUsed?: 'yes' | 'no' | 'dont_know'
  /** Number of GPUs per node as a category string (e.g. "1", "4", "dont_know"). */
  gpusPerNodeRange?: string
  /** GPU model/type if known. */
  gpuModel?: string
  /** Memory per CPU core as a range string (e.g. "2_4gb", "4_8gb"). Node-independent. */
  memoryPerCoreRange?: string
  /** Scratch storage per job as a range string (e.g. "100_500gb", "dont_know"). */
  storageScratchRange?: string
  /**
   * Whether this job is sensitive to inter-node network speed
   * (e.g. tightly coupled MPI vs. embarrassingly parallel).
   */
  interconnectSensitive?: 'yes' | 'no' | 'dont_know' | 'not_applicable'
  notes?: string
}

// ---------------------------------------------------------------------------
// 4. Runtime records
// ---------------------------------------------------------------------------

/**
 * Section D: Observed runtime for a specific resource configuration.
 * Paired (resource config, runtime) records are the primary evidence
 * for wall-time behaviour. The committee infers whether wall time is
 * intrinsic or resource-dependent from these pairs.
 *
 * DO NOT store "required wall time" — store observed wall time.
 */
export interface RuntimeRecord {
  id: string
  /** References a WorkloadRecord.id. */
  workloadId: string
  /**
   * Free-text description of the resource configuration at which this
   * runtime was observed (e.g. "32 cores on 1 node, 128 GB RAM").
   * This may also reference a ResourceRecord.id.
   */
  resourceConfigDescription: string
  resourceRecordId?: string
  /** Observed wall-clock runtime in hours. */
  wallTimeHours?: number
  /** Total CPU-hours or GPU-hours for this job. */
  cpuGpuHours?: number
  /** Number of jobs with similar configuration and runtime. */
  numberOfJobs?: number
  evidenceSource: EvidenceSource
  evidenceLevel: EvidenceLevel
  notes?: string
}

// ---------------------------------------------------------------------------
// 5. Evidence records
// ---------------------------------------------------------------------------

/**
 * Section K: Historical or external evidence records.
 * Allows evidence from any source — current cluster usage is NOT
 * the only valid evidence source.
 *
 * "Lack of current-cluster usage is not, by itself, evidence of
 *  lack of computational requirement."
 */
export interface EvidenceRecord {
  id: string
  /** Optional reference to a WorkloadRecord.id. */
  workloadId?: string
  source: EvidenceSource
  sourceOther?: string
  confidenceLevel: EvidenceLevel
  /** Application/code used in this evidence. */
  code: string
  /** Description of the workload type. */
  workloadDescription: string
  /** Hardware platform (e.g. "HPC cluster, Intel Xeon E5-2680v4"). */
  hardware: string
  /** Resource configuration string (e.g. "16 nodes × 28 cores"). */
  resourceConfig: string
  /** Observed wall-clock runtime (free text to allow ranges). */
  runtime?: string
  /** CPU-hours or GPU-hours. */
  cpuGpuHours?: number
  /** Number of jobs of this type. */
  numberOfJobs?: number
  /** Citation, URL, job-scheduler report reference, or document name. */
  reference?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// 6. Checkpoint/restart information
// ---------------------------------------------------------------------------

/**
 * A duration value entered via the 'duration' question type.
 * Stored as the raw user input; normalised to hours by the Apps Script on write.
 *
 * TODO (future harmonisation): wall-time fields in Section D and other
 * time-valued fields currently store a plain number in hours. When those
 * sections are revised, adopt DurationValue throughout so the Apps Script
 * can normalise all time fields consistently.
 */
export interface DurationValue {
  value: number | ''
  unit: 'seconds' | 'minutes' | 'hours' | 'days'
}

/**
 * Section F: Checkpoint and restart characteristics of a workload.
 * Collected per-workload. "Don't know" is always valid.
 */
export interface CheckpointInfo {
  workloadId: string
  supported: YesNoUncertain
  checkpointType?: CheckpointType
  /** How often checkpoints are written. Normalised to hours on export. */
  checkpointInterval?: DurationValue
  /** Whether the job restarts automatically without manual steps. */
  restartAutomatic?: 'yes' | 'no' | 'dont_know'
  /** Time to reinitialise or reload data after a restart. Normalised to hours on export. */
  restartOverhead?: DurationValue
  /** Whether restarted runs have produced incorrect or unexpected results. */
  restartErrors?: 'yes' | 'no' | 'not_tested' | 'dont_know'
  /** Whether checkpointing was attempted in production and later abandoned. */
  checkpointAbandoned?: 'yes' | 'no' | 'dont_know'
  /** Reason checkpointing was abandoned, if applicable. */
  abandonedReason?: 'overhead_too_large' | 'results_unreliable' | 'too_complex' | 'not_compatible' | 'other'
  abandonedReasonOther?: string
  currentlyUsed: YesNoUncertain
  notes?: string
}

// ---------------------------------------------------------------------------
// 7. Scaling information
// ---------------------------------------------------------------------------

/**
 * A single data point in a parallel scaling study.
 * Now includes evidence metadata so the committee can assess source quality.
 */
export interface ScalingDataPoint {
  /** Resource configuration description (cores, nodes, etc.). */
  resourceConfig: string
  /** Observed wall-clock time in hours. */
  wallTimeHours?: number
  /** Where this scaling observation comes from. */
  evidenceSource?: EvidenceSource
  /** Confidence level for this observation. */
  evidenceLevel?: EvidenceLevel
  /** Published benchmark or documentation reference, if applicable. */
  benchmarkReference?: string
  /** Notes on this configuration (e.g. "memory-bound above 32 cores"). */
  notes?: string
}

/**
 * Section G: Parallel scaling observations for one code.
 * The section is now a repeatable (one ScalingInfo per code).
 * The committee uses this to assess whether multi-node resources
 * are technically necessary or merely convenient.
 *
 * Users are NOT asked whether they "require" a particular node count.
 * They report what was observed or is documented.
 */
export interface ScalingInfo {
  /** Code name (corresponds to G_code_name; may be empty if general). */
  workloadId: string
  /**
   * Whether the workload can be divided into fully independent jobs.
   * "For example, running 100 independent calculations as 100 separate
   * jobs is a highly parallel/decomposable workload."
   */
  independentJobs: YesNoUncertain
  independentJobsNotes?: string
  /** Observed (config, runtime, evidence) tuples from scaling tests. */
  runtimeByConfig: ScalingDataPoint[]
  /**
   * Observed parallel scaling pattern: linear | sublinear | plateau |
   * regression | none | not_tested | dont_know.
   * Replaces the former binary nodeCountAffectsRuntime field.
   */
  scalingBehaviour?: string
  /** Core count at which performance stops improving or begins to degrade. */
  scalingLimitCores?: number
  /** Smallest total CPU core count at which the job has been observed to complete. */
  practicalMinCores?: number
  /** Largest total CPU core count actually tested (not a desired maximum). */
  practicalMaxCoresTested?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// 8. Wall-time termination records
// ---------------------------------------------------------------------------

/**
 * Section E: Factual record of a wall-time termination event.
 * Users report what happened; the committee draws inferences.
 * Users are NOT asked whether they "need" a longer wall time.
 *
 * CPU-hours fields are computed by the Apps Script:
 *   terminatedCpuHours = terminatedCores × terminatedWallTime (in hours)
 *   completedCpuHours  = completedCores  × completedWallTime  (in hours)
 * This allows direct comparison of the two resource configurations.
 */
export interface WallTimeTerminationRecord {
  id: string
  /** Has at least one job been killed by a wall-time limit? */
  hasBeenTerminated: YesNoUncertain
  /** Whether this is an isolated occurrence or a recurring pattern. */
  frequency?: 'isolated' | 'recurring' | 'dont_know'
  /** CPU cores allocated when the job was terminated. */
  terminatedCores?: number
  /** Wall-time limit requested when the job was terminated. */
  terminatedWallTime?: DurationValue
  /** Computed: terminatedCores × terminatedWallTime in hours. */
  terminatedCpuHours?: number
  /**
   * Whether the calculation has produced a valid result on any system.
   * yes_same_single   — current IISER cluster, single uninterrupted run
   * yes_same_restarts — current IISER cluster, via checkpoint-restart cycles
   * yes_different     — a different HPC system
   */
  completedAnywhere?: 'yes_same_single' | 'yes_same_restarts' | 'yes_different' | 'no' | 'dont_know'
  /** Name and wall-time limit of the system where it completed (if different). */
  completedSystem?: string
  /** CPU cores used in the successful run. */
  completedCores?: number
  /** Wall-time limit available in the successful run. */
  completedWallTime?: DurationValue
  /** Computed: completedCores × completedWallTime in hours. */
  completedCpuHours?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// QoS observation (Section N)
// ---------------------------------------------------------------------------

/**
 * Section N: Observed operational problems reported by the group.
 * These are factual descriptions of what the group has experienced,
 * NOT requests for specific QoS entitlements.
 * The committee translates observed problems into QoS characteristics.
 */
export interface QoSObservation {
  /** Factual operational problems that have been observed. */
  problemsExperienced: OperationalProblem[]
  /** Free-text description if 'other' is selected. */
  otherDescription?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Committee assessment (Phase 5 placeholder)
// ---------------------------------------------------------------------------

/**
 * Placeholder for the committee-facing assessment added in Phase 5.
 * No automatic scoring or entitlement assignment is performed here.
 * The committee manually records their triage category and findings.
 */
export interface CommitteeAssessment {
  /**
   * Triage category assigned by the committee:
   *   1 — Automatically characterised (data sufficient, fits known profile)
   *   2 — Clarification needed (minor gaps, follow-up required)
   *   3 — Technical assessment (unusual/contested requirement)
   */
  triageCategory?: 1 | 2 | 3
  assessorName?: string
  assessorEmail?: string
  assessedAt?: string
  findings?: string
  recommendedQoSCharacteristics?: string
  followUpRequired?: boolean
  followUpNotes?: string
}

// ---------------------------------------------------------------------------
// Memory record (Section H)
// ---------------------------------------------------------------------------

/**
 * Section H: Memory usage characteristics for one code.
 * The section is now a repeatable (one MemoryRecord per code).
 * Now includes evidence metadata so the committee can assess source quality.
 */
export interface MemoryRecord {
  /** Local UUID for this record. */
  id: string
  /** Code name (corresponds to H_code_name; may be empty if general). */
  workloadId: string
  /** Typical memory used per node in GB. */
  typicalMemoryPerNodeGB?: number
  /** Observed peak memory per node in GB. */
  peakMemoryPerNodeGB?: number
  /** Minimum memory at which the job has been observed to run (GB). */
  minimumWorkableMemoryGB?: number
  /**
   * Whether the job's memory is confined to a single node (per-node)
   * or distributed across nodes (MPI/distributed shared memory).
   */
  memoryDistribution?: 'per_node' | 'distributed' | 'either' | 'dont_know'
  /**
   * Whether the workload has been tested on nodes with the standard
   * memory configuration of the current cluster.
   */
  standardNodesTested: YesNoUncertain
  /** Where this memory information comes from. */
  evidenceSource?: EvidenceSource
  /** Confidence level for this memory information. */
  evidenceLevel?: EvidenceLevel
  notes?: string
}

// ---------------------------------------------------------------------------
// GPU record (Section I)
// ---------------------------------------------------------------------------

/**
 * Section I: GPU and specialised hardware characteristics for one code.
 * The section is now a repeatable (one GpuRecord per code).
 * No section-level gate — users who don't use GPUs simply add no entries.
 * Evidence level is NOT collected for GPU records (only evidence source).
 */
export interface GpuRecord {
  /** Local UUID for this record. */
  id: string
  /** Code name (corresponds to I_code_name). */
  workloadId: string
  /** Whether GPU acceleration is used or has been investigated for this code. */
  gpuUsed: 'yes_currently' | 'yes_investigated' | 'no' | 'dont_know'
  /** GPU model/product name (e.g. "NVIDIA A100 80 GB"). */
  gpuModel?: string
  /** GPU-enabled frameworks or libraries used. */
  gpuFrameworks?: string[]
  /**
   * Observed or estimated performance comparison with and without GPU
   * (free text, e.g. "~10× faster than 32-core CPU-only run").
   */
  performanceWithGpu?: string
  performanceWithoutGpu?: string
  /**
   * Where the GPU performance information comes from.
   * Note: no evidenceLevel for GPU records — only evidenceSource.
   */
  evidenceSource?: EvidenceSource
  /** Whether the workload requires a high-speed interconnect (e.g. NVLink, InfiniBand). */
  specialisedInterconnectRequired: YesNoUncertain
  specialisedInterconnectDescription?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Workflow pattern records (Section J)
// ---------------------------------------------------------------------------

/**
 * Section J — Block A: Independent jobs workflow pattern.
 * Written only when the respondent selects 'independent' in J_workflow_types.
 */
export interface IndependentJobsRecord {
  workloadId?: string
  /** Approximate number of independent jobs run per year. */
  jobCountPerYear?: number
  /** Typical wall time per individual job. */
  wallTimePerJob?: DurationValue
  /** Number of jobs typically running concurrently. */
  concurrentJobs?: number
  /** Typical turnaround time range (submission to completion, including queue). */
  turnaroundRange?: string
  /** Total CPU/GPU hours per year (range string). */
  totalCpuHoursRange?: string
}

/**
 * Section J — Block B: Sequential pipeline workflow pattern.
 * Written only when the respondent selects 'pipeline' in J_workflow_types.
 */
export interface PipelineRecord {
  workloadId?: string
  /** Number of stages in a typical pipeline run. */
  stages?: number
  /** Typical wall time per pipeline stage. */
  stageWallTime?: DurationValue
  /** Whether any stage can be divided into independent parallel jobs. */
  stageParallelisable?: 'yes' | 'partly' | 'no' | 'dont_know'
  /** Number of complete pipelines run per year. */
  pipelinesPerYear?: number
  /** Total elapsed time from first stage start to last stage completion. */
  endToEndTime?: DurationValue
  /** Total CPU/GPU hours per year (range string). */
  totalCpuHoursRange?: string
}

/**
 * Section J — Block C: Extended single-calculation workflow pattern.
 * Written only when the respondent selects 'extended' in J_workflow_types.
 * This block collects evidence that helps the committee assess whether
 * extended/reservation-like access is genuinely required.
 */
export interface ExtendedCalcRecord {
  workloadId?: string
  /** Typical wall time required for one continuous calculation. */
  wallTime?: DurationValue
  /** Longest wall-time limit available to the group on any HPC system. */
  longestAvailableWallTime?: DurationValue
  /**
   * Whether this type of calculation has produced a valid result on any system.
   * yes_single   — completed in a single uninterrupted run
   * yes_restarts — completed via checkpoint-restart cycles
   * no           — has not produced a valid result anywhere
   * dont_know    — unknown
   */
  completed?: 'yes_single' | 'yes_restarts' | 'no' | 'dont_know'
  /** System name and wall-time limit under which the calculation completed. */
  completedSystem?: string
  /** Whether any part of the calculation can be saved and resumed. */
  canCheckpoint?: 'yes' | 'no' | 'dont_know' | 'not_tested'
  /** Number of such calculations run or attempted per year. */
  countPerYear?: number
  /** Total CPU/GPU hours per year (range string). */
  totalCpuHoursRange?: string
}

// ---------------------------------------------------------------------------
// Benchmark record (Section L)
// ---------------------------------------------------------------------------

/**
 * Section L: Benchmark evidence for a workload.
 */
export interface BenchmarkRecord {
  workloadId?: string
  /**
   * Status of benchmark evidence:
   *   existing        — a benchmark already exists and is provided
   *   user_provided   — the user is submitting a benchmark result
   *   requested       — the user requests facility assistance with benchmarking
   *   unavailable     — no benchmark is available or feasible
   */
  status: 'existing' | 'user_provided' | 'requested' | 'unavailable'
  /** Description of the benchmark (input, system size, hardware, result). */
  description?: string
  /** Citation, URL, or document reference for the benchmark. */
  reference?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Workflow and support record (Section M)
// ---------------------------------------------------------------------------

/**
 * Section M: Optimisation and workflow approaches investigated.
 * This section is factual — it records what has been investigated,
 * NOT whether failure to investigate disqualifies a user's requirement.
 */
export interface WorkflowRecord {
  workloadId?: string
  /** Optimisation/workflow approaches that have been investigated. */
  investigatedApproaches: (
    | 'checkpoint_restart'
    | 'job_decomposition'
    | 'job_arrays'
    | 'workflow_managers'
    | 'scaling_analysis'
    | 'memory_optimisation'
    | 'gpu_acceleration'
    | 'none_investigated'
  )[]
  /** Whether technical assistance from facility staff would be useful. */
  technicalAssistanceUseful: YesNoUncertain
  technicalAssistanceDescription?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Top-level Submission
// ---------------------------------------------------------------------------

/**
 * A complete questionnaire submission.
 * Combines all nine data model entities.
 *
 * Status flow: draft → submitted → under_review → assessed
 *
 * IMPORTANT: No field in this model contains a priority score,
 * a QoS rank, or an automatic entitlement assignment.
 * The committeeAssessment field is populated only by the committee
 * in Phase 5 and later.
 */
export interface Submission {
  /** UUID generated at first save. */
  id: string
  /**
   * Schema version against which this submission was completed
   * (e.g. "1.0.0"). Enables future migrations.
   */
  questionnaireVersion: string
  status: SubmissionStatus
  createdAt: string
  updatedAt: string
  submittedAt?: string

  // --- Nine data model entities ---

  /** Section A. */
  respondent?: Partial<Respondent>

  /** Section B. One entry per principal code/application. */
  workloads: WorkloadRecord[]

  /** Section C. One or more resource configs per workload. */
  resources: ResourceRecord[]

  /** Section D. Observed (config, runtime) pairs. */
  runtimes: RuntimeRecord[]

  /** Section K. Historical/external evidence records. */
  evidenceRecords: EvidenceRecord[]

  /** Section F. Checkpoint/restart info per workload. */
  checkpointInfo: CheckpointInfo[]

  /** Section G. Scaling observations per workload. */
  scalingInfo: ScalingInfo[]

  /** Section E. Wall-time termination events per workload. */
  wallTimeTerminations: WallTimeTerminationRecord[]

  /** Section H. Memory characteristics per workload. */
  memoryRecords: MemoryRecord[]

  /** Section I. GPU characteristics per workload. */
  gpuRecords: GpuRecord[]

  /** Section J — Block A. Independent-jobs workflow pattern. */
  independentJobsRecords: IndependentJobsRecord[]

  /** Section J — Block B. Sequential pipeline workflow pattern. */
  pipelineRecords: PipelineRecord[]

  /** Section J — Block C. Extended single-calculation workflow pattern. */
  extendedCalcRecords: ExtendedCalcRecord[]

  /** Section L. Benchmark evidence per workload. */
  benchmarkRecords: BenchmarkRecord[]

  /** Section M. Workflow and optimisation investigation. */
  workflowRecords: WorkflowRecord[]

  /** Section N. Observed operational problems (single record per submission). */
  qosObservation?: Partial<QoSObservation>

  /**
   * Phase 5 placeholder. Populated by the committee only.
   * Not present in Phase 1 submissions.
   */
  committeeAssessment?: CommitteeAssessment

  /**
   * Raw flat answers from the form renderer, keyed by questionId.
   * This is the primary store used by the React UI and localStorage.
   * The structured entities above are derived from these answers on export.
   */
  rawAnswers: Record<string, unknown>
}
