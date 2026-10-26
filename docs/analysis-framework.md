# Analysis framework: guiding principles for HPC service design at IISER Bhopal

Status: draft for internal review. Companion to `docs/form-v3-plan.md`.
The analysis notebooks (`analysis/`) and the committee report implement what is described here.
Nothing here scores, ranks or assigns queues: the analyses produce evidence, and the committee decides.

---

## 1. The setting

| | Gargi (2025) | Raman |
|---|---|---|
| CPU cores (compute + high-memory nodes) | 2,560 (20 × 128) | ~1,560 (65 × 24) |
| Interconnect | 200 Gb/s InfiniBand HDR | 100 Gb/s Omni-Path |
| GPUs | none | one node |
| Storage (usable) | 120 TB | 104 TB |

Together the clusters deliver roughly 4,100 CPU cores, about **36 million core-hours a year** at 100 % use, or ~29 M at a realistic 80 %. They serve 50–60 research groups, with 30–50 users active at any time.

That makes this a **capacity facility**: its main job is steady production for many groups. It is not a capability machine of the kind national facilities (PARAM / NSM) provide for the very largest runs. It does, however, have real mid-scale capability: Gargi's 128-core nodes on a 200 Gb/s fabric are built for multi-node jobs. The institutional cluster has four roles:

1. **Routine production** for every group: the bulk of core-hours.
2. **On-ramp**: testing, debugging, development and training, where fast turnaround matters more than size.
3. **Mid-scale capability**: multi-node runs of a few hundred to ~1,000 cores with fast iteration, which national facilities serve poorly (long queues, allocation cycles).
4. **Bridge** to national facilities: preparing and benchmarking work that will scale further elsewhere.

A good policy serves all four without letting any one starve the others.

## 2. Principles

**P1. Evidence before entitlement.** Service follows workload evidence, proportionate to how unusual the request is (CLAUDE.md §8). Groups are never ranked.

**P2. Separate how much from what shape.**
- A **volume** shortfall (more core-hours wanted than the clusters can deliver) is a *capacity* question: more hardware, fair-share, or moving work to national facilities.
- A **shape** mismatch (jobs that need more nodes, more time, more memory or more concurrency than the queues allow) is a *policy* question: queue and limit design.

The two need different remedies; one should not be used to fix the other. High core-hour use alone never implies a need for long wall time (CLAUDE.md §1.4).

**P3. Time-to-solution is the goal; wall time is only one lever.** When a calculation needs longer than a job may run, there are three remedies, to be considered in this order:
1. **Checkpoint/restart**: chain several jobs. This costs little if restart overhead is small.
2. **Scale out**: run on more nodes for less time, if the code scales.
3. **Longer wall time**: only if neither of the first two applies, sized to the evidence.

Long wall-time slots are expensive for everyone. They block backfill, lengthen everyone's waits, and lose more work when a node fails. So a long-wall-time service should go to workloads that are **not checkpointable *and* do not scale**. When a code *could* checkpoint but the respondent did not know, that is an awareness gap, and support or training is the remedy, not a policy change.

**P4. Let scalable codes use the parallel hardware.** Current limits allow at most 3 Gargi nodes (384 cores) and 72 h for any multi-node job. A code that keeps getting faster beyond that is being held back by policy, not by hardware. The usual remedy is **capability windows**: scheduled reservations or a large-job partition with limited frequency. These give scalable codes full use of the interconnect without making large jobs a standing claim on the machine.

**P5. Throughput workloads need concurrency and fairness, not long jobs.** Ensembles and parameter sweeps are limited by how many jobs one user may run at once and by turnaround. The levers are:
- per-user concurrency limits tuned to load
- job arrays
- short jobs that backfill well
- fair-share scheduling with usage decay instead of fixed caps

A test that helps: at the current concurrency limit, how long would one year of the workload take to finish?

**P6. Turnaround should be proportionate to the request.** The *expansion factor* is (queue wait + run time) / run time. It should be close to 1 for debug and small short jobs, and can be a few for large or long jobs. Debug and interactive work needs near-immediate starts, or development stalls.

**P7. Plan for realistic utilisation.** Above roughly 80 % use, queue waits grow steeply. "Capacity" in this analysis therefore means `cores × 8,760 h × target utilisation` (a committee parameter, 0.8 for now). Demand above that is a deficit, even if it would fit at 100 %.

**P8. Storage is working space.**
- **Home** holds what production runs need right now: inputs, checkpoints, parameters, own codes, and outputs awaiting transfer. Keeping research data long-term is the group's responsibility.
- **Scratch** is shared and dynamic, with a purge policy and a largest-area-per-user cap. It earns its place for write-heavy or re-read I/O. Read-only inputs can sit in home when home is on the same parallel file system; where only scratch is on the fast PFS (`storage.scratchOnlyOnFastPFS`), inputs are loaded from scratch and their volume (`W_input_read`) counts toward scratch too.

Storage is judged per group against a guide figure, not by adding up wishes.

**P9. Decide on GPUs from measured benefit.** GPU capacity should follow evidence of speed-up and of CPU non-viability, plus the latent demand of CPU codes that already have tested GPU versions. Comparisons use node-hours: one GPU node against one CPU node.

**P10. Equal access, differentiated service.** Every group gets fair access to production. Service *classes* (debug, throughput, capability windows, long wall time, high memory, GPU) are defined by workload shape, never by who the group is.

**P11. Close the loop with accounting data.** The questionnaire gives *stated* demand; Slurm accounting (`sacct`) gives *observed* use. Reconcile the two each year. Introduce policy changes as pilots and measure their effect on waits, utilisation and expansion factors.

**P12. Make uncertainty visible.**
- Every number carries its coverage: how many groups answered and how many said "Don't know".
- "Don't know" is never treated as zero.
- Demand is reported as ranges where the inputs are ranges.
- The survey covers respondents only, so totals are lower bounds.

## 3. Default analyses and the questions they answer

| Analysis | Question | Principle | Notebook |
|---|---|---|---|
| Problems reported (pie + share of groups), split by where they occurred | What goes wrong, and is it on the present clusters? | P1 | 01 |
| CPU-hour demand vs capacity: Gargi, Raman, unattributed, combined; used vs unconstrained | Is there a *volume* shortfall? | P2, P7 | 02 |
| GPU-hour demand vs capacity; latent GPU demand from CPU codes; CPU-viability of GPU workloads | How much GPU, and how much would CPU nodes absorb? | P9 | 02 |
| Home and scratch demand vs capacity per cluster; per-group outliers; output residence | Is storage short, or held too long? | P8 | 03 |
| Long-job requirement split by checkpoint status | Genuine long-wall-time need, or awareness gap? | P3 | 04 |
| Long jobs without checkpoint, split by scaling | Should these run *longer* or *wider*? | P3, P4 | 04 |
| High-scalers: cores wanted vs policy maximum; estimated wall time at the cap vs at the wanted size | Where does policy hold back the parallel hardware? | P4 | 05 |
| Low/intermediate scalers: queue fit, concurrency need vs per-user limit, time to finish a year's work, queue waits | Where do queue limits throttle throughput or turnaround? | P5, P6 | 05 |
| Debug/interactive demand vs the 30-min debug queues | Is the on-ramp adequate? | P6 | 05 |
| Clarification and technical-assessment candidates; answers to confirm (internal consistency); data quality | Which submissions need a follow-up? | P1, P12 | 06 |

## 4. Suggested decision tests (for the committee to adopt, amend or reject)

| Service characteristic | Suggested evidence test |
|---|---|
| Long wall time | Needed run time exceeds the applicable limit **and** checkpoint = No **and** doubling the cores gives > 0.8× the wall time (or does not apply) **and** evidence level ≤ 3. |
| Capability window (large multi-node) | Doubling the cores gives ≤ 0.8× the wall time beyond the current per-job maximum, with measured pairs (Section D, Running on more cores) at evidence level ≤ 2–3. |
| Throughput tuning (concurrency / fair-share) | At the current concurrency limit, a year of the workload takes more than ~6 months to finish, **or** the expansion factor is persistently > 3 for small jobs. |
| High memory | Peak memory per node exceeds a standard node and cannot be distributed (Section D, Memory). |
| Scratch above the per-user cap | Peak concurrent scratch exceeds the cap, the I/O is write-heavy or re-read, and local disk is not an option (Section D, Files and scratch). |
| GPU expansion | Measured GPU node speed-up ≥ 5× and CPU-only not viable, with enough GPU-hours to keep extra GPUs busy at the target utilisation. |
| Support / training rather than policy | Checkpoint "Not tested" or "Don't know" for a long-job workload; "Not aware" declarations; scaling never tested. |

## 5. Caveats

- **Coverage:** totals cover responding groups only. Report the response rate next to every total.
- **"Unconstrained" demand** is self-estimated and tends to be optimistic. Treat it as an upper bound and the "used" figure as the lower bound.
- **Cluster attribution:** workloads with cluster "Both" are split 50:50. "Not decided" and "Don't know" go into an *unattributed* pool, shown separately and in the combined total.
- **Averages vs peaks:** scratch and concurrency are reported both as sums of peaks (worst case) and as time-averaged load (Little's law: average running jobs = jobs per year × wall time / 8,760 h).
- **Only the respondents' data:** the scripts are code-agnostic — no flag depends on which code a workload runs. Checking answers against outside knowledge of a code's performance, or against Slurm accounting, is manual. For checkpoint/restart, `analysis/code_capabilities.json` keeps a reference list with the documented mechanism and official documentation link for each code, and `restart_cross_check()` lists matching workloads on request.
- **Missing answers are neutral:** blank, optional and "don't know" answers get defaults that neither add demand nor raise a flag (`NEUTRAL_DEFAULTS` in `hpc_analysis.py`); a test whose inputs are unknown is reported as undecided (`<NA>`), not as failed.
- **Internal consistency** is checked after submission, by comparing a respondent's answers with each other (`consistency_checks`); the form does not check it. Each mismatch is something to confirm, not a finding.
