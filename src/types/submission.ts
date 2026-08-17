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
 * Section F: Checkpoint and restart characteristics of a workload.
 * Collected per-workload. "Don't know" is always valid.
 */
export interface CheckpointInfo {
  workloadId: string
  /**
   * Whether the application supports checkpoint/restart.
   * "If a job can be stopped and later resumed without repeating
   * completed computation, this is restartable execution."
   */
  supported: YesNoUncertain
  /** Whether the checkpoint mechanism is built-in or external. */
  checkpointType?: CheckpointType
  /** Approximate checkpoint interval (free text, e.g. "every 2 hours"). */
  checkpointInterval?: string
  /**
   * Description of restart behaviour (e.g. "restarts from last
   * checkpoint; partial step is discarded").
   */
  restartBehaviour?: string
  /**
   * Estimated computational work lost if a job is interrupted
   * between checkpoints (e.g. "up to 2 hours of CPU time").
   */
  computationalLossOnInterruption?: string
  /** Whether checkpoint/restart has been tested on this system. */
  tested: YesNoUncertain
  /** Whether checkpoint/restart is currently used in production. */
  currentlyUsed: YesNoUncertain
  notes?: string
}

// ---------------------------------------------------------------------------
// 7. Scaling information
// ---------------------------------------------------------------------------

/**
 * A single data point in a parallel scaling study.
 */
export interface ScalingDataPoint {
  /** Resource configuration description (cores, nodes, etc.). */
  resourceConfig: string
  /** Observed wall-clock time in hours. */
  wallTimeHours?: number
  /** Notes on this configuration (e.g. "memory-bound above 16 cores"). */
  notes?: string
}

/**
 * Section G: Parallel scaling observations for a workload.
 * The committee uses this to assess whether multi-node resources
 * are technically necessary or merely convenient.
 *
 * Users are NOT asked whether they "require" a particular node count.
 * They report what was observed.
 */
export interface ScalingInfo {
  workloadId: string
  /**
   * Whether the workload can be divided into fully independent jobs.
   * "For example, running 100 independent calculations as 100 separate
   * jobs is a highly parallel/decomposable workload."
   */
  independentJobs: YesNoUncertain
  independentJobsNotes?: string
  /** Observed (config, runtime) pairs from scaling tests. */
  runtimeByConfig: ScalingDataPoint[]
  /**
   * Whether increasing node/core count reduces wall-clock runtime
   * for a single job.
   */
  nodeCountAffectsRuntime: YesNoUncertain
  /** Smallest resource config at which the job has been observed to complete. */
  practicalMinNodes?: number
  /**
   * Largest resource config tested (not "maximum required" — just
   * the largest actually tested).
   */
  practicalMaxNodesTested?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// 8. Wall-time termination records
// ---------------------------------------------------------------------------

/**
 * Section E: Factual record of a wall-time termination event.
 * Users report what happened; the committee draws inferences.
 * Users are NOT asked whether they "need" a longer wall time.
 */
export interface WallTimeTerminationRecord {
  id: string
  workloadId: string
  /** Has at least one job been killed by a wall-time limit? */
  hasBeenTerminated: YesNoUncertain
  /**
   * Approximate frequency of terminations
   * (e.g. "rarely", "occasionally", "frequently", "most jobs").
   */
  frequency?: string
  /** Wall time that was requested at submission (hours). */
  requestedWallTimeHours?: number
  /** How long the job had actually been running when killed (hours). */
  actualRunTimeHours?: number
  /** Was the job subsequently restarted? */
  wasRestarted: YesNoUncertain
  /**
   * Description of how much work was lost as a result of termination
   * (e.g. "approximately 3 days of computation", "none — checkpointed").
   */
  workLostDescription?: string
  /** Did the workload eventually complete successfully? */
  eventuallyCompleted: YesNoUncertain
  /**
   * Was the same workload successfully completed using a different
   * resource configuration or system?
   */
  completedUnderDifferentConfig: YesNoUncertain
  differentConfigDescription?: string
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
 * Section H: Memory usage characteristics for a workload.
 */
export interface MemoryRecord {
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
  memoryDistribution?: 'per_node' | 'distributed' | 'dont_know'
  /**
   * Whether the workload has been tested on nodes with the standard
   * memory configuration of the current cluster.
   */
  standardNodesTested: YesNoUncertain
  notes?: string
}

// ---------------------------------------------------------------------------
// GPU record (Section I)
// ---------------------------------------------------------------------------

/**
 * Section I: GPU and specialised hardware characteristics.
 * This section is conditionally shown based on B_uses_gpu or
 * I_uses_gpu_initial answers.
 */
export interface GpuRecord {
  workloadId: string
  /** Whether GPU acceleration is used for this workload. */
  gpuUsed: YesNoUncertain
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
  /** Whether the workload requires a high-speed interconnect (e.g. NVLink, InfiniBand). */
  specialisedInterconnectRequired: YesNoUncertain
  specialisedInterconnectDescription?: string
  notes?: string
}

// ---------------------------------------------------------------------------
// Throughput record (Section J)
// ---------------------------------------------------------------------------

/**
 * Section J: High-throughput workload characteristics.
 * Collected per-workload. Used by the committee to assess whether
 * a high-throughput QoS class is relevant.
 */
export interface ThroughputRecord {
  workloadId: string
  /** Approximate number of independent jobs in a typical campaign. */
  independentJobCount?: number
  /** Maximum number of jobs running concurrently in typical operation. */
  typicalConcurrentJobs?: number
  /** Total CPU/GPU hours consumed per year (range string). */
  totalCpuGpuHoursPerYearRange?: string
  /** Typical time between job submission and job completion (range string). */
  typicalTurnaroundRange?: string
  /** Approximate number of jobs waiting in the queue at any one time. */
  typicalQueueDepth?: number
  /**
   * Whether all jobs in the campaign can be executed independently
   * (i.e. no job depends on the output of another job in the same campaign).
   */
  jobsFullyIndependent: YesNoUncertain
  notes?: string
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

  /** Section J. Throughput characteristics per workload. */
  throughputRecords: ThroughputRecord[]

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
