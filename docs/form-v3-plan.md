# Questionnaire v3 — reshaping plan

Status: draft for internal review (not yet shared with the committee).
Base: `progressive-disclosure-v2` @ `f869103` (schema 1.3.0). v3 will be schema 2.0.0.

## 1. Purpose v3 is designed around

1. **Primary:** can the present clusters (Gargi, Raman) sustain the requirements of existing users?
2. **Secondary:** what extensions or new infrastructure are needed for growing demand of current and future users?

QoS redesign is the committee's first agenda item but is **not** assessed by the form. The form only collects the facts the committee will need for it.

Every question must feed one of these two purposes through a quantity the committee can compute with. A question that cannot be traced to a computation or a yes/no test is dropped.

## 2. Design rules (binding for every question)

| Rule | Consequence |
|---|---|
| No text boxes for quantities | Integer/decimal inputs with validation (min, max, integer-only), or `{value, unit}` inputs with a unit selector (time: min/h/days; size: GB/TB). Free text only for names (codes, GPU models) and one closing comment box. |
| Every question has an "unknown" path | Each choice question includes *Don't know / not aware* (plus *Not tested* / *Not applicable* where meaningful). Each numeric input has a **Don't know** tick-box beside it (stored as `"dont_know"`, never as 0 or blank). Each follow-up section keeps the top-level *not aware* declaration. |
| Derive, don't ask | Core-hours/year, GPU-hours/year, peak concurrent scratch, fraction of cluster, evidence-confidence level are **computed** from primary quantities, not asked. |
| Qualitative scales carry numbers | e.g. scaling: "doubling cores made wall time ≤ 0.6× / 0.6–0.8× / > 0.8× / longer"; GPU speed-up bins `<2×, 2–5×, 5–20×, >20×` with a defined comparison basis. |
| No self-classification | Never ask users to classify themselves (occasional/persistent, core/peripheral, computational/experimental) or to judge importance or entitlement. |
| Per-workload facts live in one place | A code is described **once**, in the workload table; follow-up sections refer to it by picking its name, not by re-entering it. |
| Cluster limits are configuration | Gargi/Raman specs and policy limits live in one config file; triggers and range boundaries read from it. |

## 3. Why v2 still feels heavy (and what the pilot data shows)

From the v1.1 pilot sheet (4 genuine groups + owner test fills):

- **Free text for quantities produced unusable data**: e.g. `resource_config = "6 nodes x 24 cores, 576 GB RAM'"`, `"196 cores, 4 nodes 576 GB RAM'"`. → numeric fields only.
- **Detail sections were mostly left blank**: Memory (all blank), Checkpoint (1 of 4), Scaling (2 of 4, partial). Respondents skip per-code repeated tables.
- **The workflow-pattern blocks were answered and informative**: independent jobs (3 groups, up to 10,000 jobs/yr × 72 h, 10 concurrent), pipelines (3 groups, 4–5 stages of 24–72 h), extended calculations (2 groups, 90–240 h needed vs 72–120 h available). → keep the classification, fold it into the workload table.
- **Top range bins saturated**: two groups chose "1,000,000+ core-hours" for both used and needed. → compute core-hours from jobs × cores × wall time instead of asking ranges.
- **Range bins for cores/nodes were too coarse** to compute anything. → integers.

## 4. v3 structure

Target: a group with an ordinary workload and no problems finishes in **~8–10 minutes**; each triggered follow-up adds ≤ 6 questions.

### Section 1 — About your group (core)

| ID | Question | Input |
|---|---|---|
| G_group_name, G_department(+other) | Group name, department | text, select |
| G_pi_salutation, G_pi_name, G_pi_email | PI | select, text, email |
| G_pi_is_respondent → G_by_name/email/role | Who is completing (auto-filled if PI) | radio, text, select |
| G_hpc_users_now | Number of group members who currently submit HPC jobs | integer ≥ 0, DK |
| G_hpc_users_3y | Expected number in 3 years | integer ≥ 0, DK |
| G_research_description | One-line description of the research using HPC (optional) | text |

### Section 2 — Your HPC experience (core; gates follow-ups)

| ID | Question | Input |
|---|---|---|
| X_systems_used | Systems your group has run jobs on in the last 3 years | checkbox: Gargi · Raman · earlier IISERB cluster · national facility (PARAM etc.) · collaborator/other institution · cloud · workstation/local server · none yet (exclusive) |
| X_share_iiserb | Share of your group's computing done on IISERB clusters in the last 12 months | % (0–100), DK — shown if any non-IISERB system ticked |
| X_problems | Operational problems experienced on **any** HPC system (as v2, plus): **scratch space insufficient or jobs failed on scratch limits**; **test/debug jobs wait too long to start** | checkbox, incl. "No problems observed" and "Not yet run jobs on HPC" (exclusive) |
| X_problems_where | For each problem ticked: on which system(s)? | small checkbox matrix (problem × Gargi/Raman/other) — tells the committee whether a problem is a *present-cluster* problem |

### Section 3 — Your workloads (core; up to 5 main codes)

One card per main code (max 5; a free-text field after the table lists any other codes). Sub-headed so it reads as five short blocks.

**3a. Identity**

| ID | Question | Input |
|---|---|---|
| W_code | Code / application | text |
| W_type | Workload type | select (v2 categories) |
| W_source | Where do these numbers come from? | select: Gargi · Raman · earlier IISERB cluster · national facility · collaborator cluster · cloud · benchmark run · published/developer data · estimate. (Evidence level 1–5 is **derived** from this.) |

**3b. A typical job of this code**

| ID | Question | Input |
|---|---|---|
| W_nodes | Nodes per job | integer ≥ 1, DK |
| W_cores | Total CPU cores per job | integer ≥ 1, DK |
| W_gpus | Total GPUs per job | integer ≥ 0, DK |
| W_mem_node | Memory used per node | GB, DK |
| W_walltime | Wall time of a typical job (running time, excluding queue wait) | duration, DK |
| W_scratch_min | Minimum scratch space one running job needs | size (GB/TB), DK, N/A |

**3c. Volume**

| ID | Question | Input |
|---|---|---|
| W_jobs_year | Jobs of this kind run in the last 12 months | integer, DK |
| W_jobs_year_unconstrained | Jobs of this kind per year you need — what you would run if wall time, queue wait and capacity were not limiting | integer, DK |
| W_concurrent | Largest number of these jobs your group runs (or would run) at the same time | integer, DK |

Derived: core-hours/yr (used, unconstrained), GPU-hours/yr, peak concurrent cores, peak concurrent scratch = `W_scratch_min × W_concurrent`.

**3d. How the jobs are organised** (checkbox, may tick several — keeps the informative v1 classification)

| Option | Follow-up (inline, numeric) |
|---|---|
| Single stand-alone calculations | — |
| Many independent jobs (parameter sweeps, ensembles, screening) | W_batch_size: jobs submitted together in one batch (integer) |
| Sequential chain — each job needs the previous job's output | W_chain_steps (integer); W_chain_elapsed: end-to-end time of one chain including queue waits (duration) |
| One calculation that needs longer than a single job allows | W_long_total: total wall time the full calculation needs (duration); W_checkpoint: can it stop and resume without losing completed work? (Yes / No / Not tested / DK) |
| Many heavy jobs running together toward one result (coordinated campaign) | W_campaign_cores: total cores needed simultaneously (integer); W_campaign_duration (duration); W_campaigns_year (integer) |

The last option feeds the "30–50 % of the cluster" question: the committee compares `W_campaign_cores` (and `W_cores`) against cluster totals from config.

**3e. GPU vs CPU** (asked for every workload; this is the GPU:CPU-balance data)

| ID | Question | Input |
|---|---|---|
| W_gpu_version | Does a GPU-accelerated version of this code exist? | Yes, we use it · Yes, tested but not adopted · Yes, not tested · No GPU version · Don't know / not aware |
| W_gpu_speedup | (if used or tested) Speed of one GPU node relative to one CPU-only node for the same calculation | `<2×` · `2–5×` · `5–20×` · `>20×` · Not measured · DK |
| W_cpu_viable | (if W_gpus > 0 or "we use it") Can this workload run on CPU-only nodes in a usable way? | Yes, similar time · Yes, but 2–5× longer · Yes, but > 5× longer · No — GPU-only or memory-bound to GPU · DK |

### Section 4 — Storage, testing and interactive use (core, short)

| ID | Question | Input |
|---|---|---|
| S_persistent_now | Long-term storage (home/project) your group occupies on IISERB clusters now | size, DK |
| S_persistent_3y | Expected in 3 years | size, DK |
| S_scratch_residence | After a job ends, how long must its scratch files stay before they can be moved or deleted? | None · < 1 day · 1–7 days · > 7 days · DK |
| T_uses_debug | Do group members run short test/debug or interactive sessions? | Yes · No · DK |
| T_sessions_week | (if yes) Sessions per week, whole group | integer, DK |
| T_size | (if yes) Typical size: cores; duration | integer; duration |
| T_purpose | (if yes) Used for | checkbox: test inputs before production · compile/debug code · visualisation · notebooks/RStudio · GUI applications · other |

### Section 5 — Follow-up sections (each ≤ 6 questions, each with the *not aware* declaration)

Shown when the trigger fires. Triggers combine **problems ticked** (Section 2) with **workload facts crossing a cluster limit** (Section 3 vs config). Each section starts with "Which workload does this concern?" (pick from the workload names).

| Section | Trigger | Questions |
|---|---|---|
| **5A Long jobs** | wall-time termination ticked · any `W_walltime` or `W_long_total` ≥ max partition limit · "one calculation longer than a job" ticked | longest uninterrupted run needed (duration) and the cores it used (integer) · checkpoint/restart (Yes/No/Not tested/DK) · if yes: time lost per restart (duration) · effect of doubling cores on wall time (≤ 0.6× / 0.6–0.8× / > 0.8× / longer / not tested / DK) · wall-time terminations in the last 12 months (integer, DK) |
| **5B Scaling and large runs** | insufficient node count ticked · `W_cores` ≥ 2 nodes' worth · coordinated campaign ticked | up to 3 measured (cores, wall time) pairs (integer, duration) · effect of doubling cores (same scale) · largest core count tested (integer) · largest core count that still gave ≥ 20 % shorter wall time (integer, DK) |
| **5C Memory** | out-of-memory ticked · `W_mem_node` > standard node memory | peak memory per node (GB) · runs within a standard node? (Yes / Fails out-of-memory / Not tested / DK) · can memory be spread over more nodes? (Yes / No / DK) |
| **5D GPU** | any `W_gpus` > 0 · GPU access ticked · GPU version "we use it" | GPU model(s) used (text) · GPU memory needed per GPU (GB, DK) · largest GPUs per job (integer) · *optional, collapsed:* fast GPU-to-GPU links within a node (NVLink) needed? (Yes/No/DK) · GPUs across several nodes? (Yes, now / Yes, planned / No / DK) |
| **5E Scratch storage** | scratch problem ticked · peak concurrent scratch > configured share of scratch | peak scratch per job (size) · files written per job (< 1k / 1k–100k / > 100k / DK) · I/O pattern (few large files / many small files / DK) · can jobs run with scratch on the compute node's local disk? (Yes / No / DK) |
| **5F Queue and turnaround** | excessive queue wait or insufficient capacity ticked | typical queue wait before start (duration) on Gargi/Raman · longest wait in the last 3 months (duration) · share of planned work not run in the last 12 months (%) |

### Section 6 — Growth and closing (core, short)

| ID | Question | Input |
|---|---|---|
| Z_growth_3y | Expected computing demand in 3 years relative to now | factor (×, decimal ≥ 0), DK |
| Z_other_codes | Other codes used (beyond the 3 above) | text list |
| Z_benchmark_help / Z_volunteer (+codes) | Benchmarking assistance useful? Volunteer to help others? | as v1.3 |
| Z_comments | Anything else | textarea |

## 5. Removed from v2 (no computation depends on them)

Code version/reference · per-row notes (~15 boxes) · per-row evidence source **and** 1–5 level (replaced by one derived source per workload) · storage-range and interconnect-sensitivity (derivable from nodes + scaling) · GPU framework checklist · checkpoint details (automatic restart, restart errors, abandonment reasons, interval) · separate job-setup (D) and runtime (E) tables · workload-characteristics checkboxes (now facts in 3d) · Section K's three blocks (folded into 3c/3d) · range bins for annual core-hours (computed).

Kept optional per committee request: NVLink, multi-node GPU (collapsed inside 5D).

Committee comment "D & E optional when no problems": in v3 the heavy parts of D/E are now the follow-up sections, which do not appear without a trigger. The compact workload table stays **core** for everyone, because the primary purpose (whole-cluster viability) needs every group's demand, not only groups reporting problems. **Confirmed (2026-10-24):** every group, including "no problems" groups, must give at least one workload entry with its yearly figures and job organisation. Required in each entry: cluster, CPU/GPU, cores (and GPUs for GPU jobs), wall time, jobs in the last 12 months, jobs needed per year, and job organisation. Each has a "Don't know" option, which counts as an answer. Submit now checks required questions in every visible section and entry, not only Section A.

## 6. Engine changes required

| Change | Why |
|---|---|
| `quantity` type: `{value, unit}` for time and size with a units table; normalised on write (hours, GB) | single numeric format; replaces `duration` and plain hour fields (the CLAUDE.md time-harmonisation task) |
| `integer` / `decimal` validation, min/max, inline error | format-validated boxes |
| `allowUnknown` on numeric/quantity inputs (Don't-know tick-box) | unknown path without free text |
| `maxEntries` on repeatables (5) | workload cap |
| `workloadRef` type: options from the workload table's names | follow-ups refer to workloads without re-entry |
| Conditions over repeatable rows with comparisons: `{rows: 'W', field, op: 'gte', value \| configRef}` | threshold-based triggers |
| `src/config/clusters.json`: per-cluster nodes by type, cores/node, memory/node, GPUs, partitions + wall-time limits, scratch size/quota/purge | triggers and analysis read limits from one place |
| `committeeUse` tag per question | documents which computation each answer feeds; drives the analysis code |
| Keep `optionalWhen`, `notAwareOption`, `answersForSubmission` | already built in 1.3 |

## 7. Data and the old versions

- v3 writes to a **new** response spreadsheet (one wide row per workload; one tab per follow-up section). Avoids the stale-header issue in the v1 sheet.
- **Pilot data is not migrated into v3.** Question semantics, units and dimensions changed (e.g. core-hour ranges → computed values; free-text configs → integers). Instead:
  - the v1.1 sheet stays as a read-only archive;
  - a small **test fixture** is built for developing analytics, with an explicit field-by-field mapping table; fields whose meaning changed are left blank and marked `not_mapped`, never coerced;
  - fixture rows are labelled `source_version = 1.1.0` so they can never be mistaken for v3 responses.
- v1 retirement: tag `main` as `v1-archive`; merge v3 to `main` after internal sign-off; close the v1 submission window at v3 launch.

## 8. Build order (form stays working at each step)

1. Cluster config + engine changes (§6), with v1.3 content still running.
2. v3 schema content, section by section (1 → 6), with the new sheet writer.
3. Derived-metric layer (core-hours, concurrency, fraction-of-cluster, evidence level) in Apps Script and the analysis notebooks; test fixture from pilot data.
4. Internal review → committee review of the finished form + this plan.
5. Launch; archive v1.

## 9. Cluster facts used by the form (`src/config/clusters.json`)

| | Gargi (2025) | Raman |
|---|---|---|
| Standard nodes | 17 × 128 cores, 768 GB | 64 × 24 cores*, 96 GB |
| High-memory | 3 × 128 cores, 2304 GB | 1 × 24 cores, 1152 GB |
| GPU | none | 1 node (GPU model/count not listed) |
| Storage | 120 TB usable, 15 GB/s | 104 TB usable, 6 GB/s |
| Interconnect | 200 Gb/s InfiniBand HDR | 100 Gb/s Omni-Path |
| Queues (max nodes · wall time · max concurrent jobs) | debug 1–2 · 30 min · 4; short 1–3 · 36 h · 3; medium 1–3 · 72 h · 3; long 1 · 120 h · 1; xlong 1 · 168 h · 1; hmq 1 · 168 h · 1 | debug 1–4 · 30 min · 4; short 5–8 · 48 h · 8; medium 2–4 · 72 h · 4; long 1 · 120 h · 1; gpu 1 · 24 h · 1; hmq 1 · 72 h · 1 |

\* assumed 2 × 12-core Xeon Gold 6126 (consistent with pilot data); to confirm.

Consequences for the form:
- **Multi-node jobs are capped at 72 h on both clusters**; only single-node jobs reach 120–168 h. → 5A trigger: (nodes > 1 and wall time > 72 h) or wall time > 168 h.
- **Largest job permitted ≈ 384 cores** (Gargi, 3 × 128); 30 % of Gargi ≈ 768 cores. → 5B triggers: cores > 384, or campaign cores ≥ 768.
- **Largest standard node memory 768 GB** (Raman 96 GB). → 5C trigger: memory/node > 768 GB; analysis also flags > 96 GB as Gargi-only.
- **GPU capacity is a single Raman node with a 24 h / 1-job queue.** → the per-workload GPU-version, speed-up and CPU-viability questions (3e) are the main evidence for any GPU investment; 5D asks GPU model and memory needed.
- **Debug queues are 30 min.** → T_size duration lets the committee see whether debug/interactive needs fit.
- Charges (₹0.10 / core-h, ₹0.20 / core-h for 7-day queue, ₹1 / GPU card-h) are recorded in config for the analysis layer; the form does not ask about cost.

All thresholds live under `thresholds` in the config; `null` disables a trigger.

## 10. Open items

1. Raman: cores per node (24 assumed); GPU believed Volta-generation (not needed by the form).
2. Scratch: assumed 50 % of usable storage (Gargi ~60 TB, Raman ~52 TB) per user's estimate; quota and purge policy still unknown.
3. Confirm the workload table stays core for groups reporting no problems (§5).

## 11. Progress

- [x] Step 1 engine: `quantity` type (time/size, normalised to hours/GB), integer/min/max inline validation, Don't-know tick-box (`allowUnknown`), `maxEntries`, `workloadRef`, row-based and compound conditions with `configRef` thresholds, `committeeUse` tag, cluster config. Verified with condition unit tests and in the browser; v1.3 form unchanged.
- [x] Step 2 v3 schema (`src/schema/questionnaire.json`, 2.0.0) and declarative sheet writer (`apps-script/SheetWriter.gs`). Verified: every answerable question maps to a sheet column; derived values (core-hours/yr, GPU-hours/yr, peak concurrent cores and scratch, evidence level) computed by the writer; all six follow-up triggers fire in the browser; answers of hidden or "not aware" sections are dropped on submit.
- [x] Step 3 report generator (`apps-script/ReportGenerator.gs`, driven by the sheet definitions) and analysis notebooks 00–06 (`analysis/`, computations in `hpc_analysis.py`, principles in `docs/analysis-framework.md`). Tested on a synthetic dataset of 12 fictional groups generated through the real sheet writer; all notebooks execute and the report renders for every group. Pilot data deliberately **not** used as a fixture (different semantics; real names in a public repo).
- Added for the analysis: per-workload cluster question (`W_cluster`: Gargi / Raman / Both / Not decided / Don't know) and `committeeParameters.targetUtilisation` (0.8 placeholder).
- Old versions archived as tags (`docs/ARCHIVE.md`).

### Implementation decisions taken in step 2 (differences from §4)

- Section letters (from 2.3.0): A About · B Experience · C Workloads · D Details for each code (the follow-up panels, one card per code that opens any; required, Don't know always allowed) · E Storage & testing · F Queue · G Growth & closing. Section 1 keeps the `A_*` question IDs (PI auto-fill and the duplicate-PI check depend on them); other IDs as in §4.
- Follow-ups E1–E5 are short per-workload lists (max 5 entries), each starting with a workload picker, so a group with two long-running codes can describe both.
- `X_problems_where` was replaced in 2.6.0 by `X_problems_gargi` / `X_problems_raman`: of the problems ticked, those faced on each cluster.
- The checkpoint question lives only in E1 (not duplicated in the workload card).
- The workload table is core for everyone, with at least one entry required (confirmed 2026-10-24).
- Drafts use a v3 storage key, so a v1/v2 draft on the same device is not loaded into v3.
- Every cores / GPU / wall-time question is preceded by a CPU-vs-GPU question (workload card, debug sessions, E1, E2); E1 also fires for GPU jobs over the 24 h GPU-queue limit; E6 distinguishes the Raman GPU queue.
- **Home area** (D) asks only for working space: run inputs and data files, checkpoint files, parameter files, own production/analysis codes, and final outputs awaiting transfer to the group's own storage; plus how long outputs stay before transfer. The section states that home is not long-term storage. (Policy context: ≥ 30–50 concurrent users; ~1 TB per group is already large.)
- **Scratch**: the workload card asks for the largest volume of input files one job *loads* and the largest volume it *writes* during the run (from 2.2.0; both trigger the scratch panel). Where only scratch is on the fast parallel file system (`storage.scratchOnlyOnFastPFS`), inputs are best loaded from scratch and both volumes count toward scratch. The scratch panel separates whether inputs are read-only, re-reading of own output, share of run time spent on file I/O, file count, local-disk option, and how long files must stay after the job. Scratch policy is a largest area per user (value not yet set), not equal shares; trigger thresholds (1 % / 5 % of ~52 TB) are placeholders.
- **Committee parameters** (`committeeParameters` and per-cluster `storage.scratchFraction` in `src/config/clusters.json`): the home:scratch split (0.5 for now; usually 60:40), the largest scratch area per user, a home-space guide per group, and the scratch trigger fractions. Scratch/home sizes and scratch trigger thresholds are computed from these, and the analysis (step 3) will check responses against the same file.
- **Queue (E6)**: up to 5 entries, each recording the queue (picker generated from the cluster config, showing node and wall-time limits), the workload, and the resources requested (skipped when it was the typical job from Section C) before the typical and longest waits. The share of planned work not run stays group-level.
- [x] Schema 2.4.0 backend (2026-10-26): the form strips hidden answers on submit and tags each workload entry with
  the Section D panels it opened (`_panels`); `SheetWriter.gs` writes one LongJobs / Scaling / Memory / Gpu / Scratch
  row per code that opened the panel (joined to Workloads by `entry_index`), with a `not_aware` column. Workloads
  gains `affected_by`, `input_read_gb`, `panels`, chain/long running and calendar times, queue overheads
  (calendar − running) and yearly totals as upper bounds (`*_max`; chains use running time per step). Report sections
  re-lettered A–G. Notebooks updated and run on regenerated synthetic data.
