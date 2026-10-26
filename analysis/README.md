# HPC Questionnaire — Committee Analysis Notebooks (schema 2.4.0)

Python notebooks for the HPC Users' Committee. They turn the questionnaire responses into evidence about whether
the present clusters (Gargi and Raman) meet current needs, and where extensions would help.
The reasoning behind every analysis is in [`docs/analysis-framework.md`](../docs/analysis-framework.md). Read it first.

**Important:** the notebooks show evidence. They do not score, rank or assign queues. "Suggested categories" and
flags are prompts for the committee, which makes all decisions.

---

## Getting started (Google Colab, nothing to install)

1. **Get access.** The HPC admin shares the v3 response sheet with your `@iiserb.ac.in` account (Viewer access).
2. **Find the Spreadsheet ID**: the long string in the sheet URL between `/d/` and `/edit`.
3. **Open a notebook** at colab.research.google.com → File → Open notebook → GitHub →
   `https://github.com/svaradh/hpc-questionnaire` → `analysis/`.
4. **Paste the ID** into the first code cell, then *Runtime → Run all*. Colab asks once per session to sign in.

Each notebook fetches the helper modules and the cluster configuration from GitHub. `REPO_REF` in the first cell chooses
the branch or tag: `main` normally, or `progressive-disclosure-v2` until v3 is merged.

## Notebooks

| Notebook | Question it answers |
|---|---|
| `00_setup` | Is the data loaded? What cluster sizes and committee parameters are in use? |
| `01_overview` | Who responded, what problems they report (pie and share of groups), on which systems; workload mix |
| `02_compute_capacity` | CPU-hour and GPU-hour demand vs deliverable capacity: Gargi, Raman, unattributed, combined; latent GPU demand; GPU:CPU balance |
| `03_storage` | Home and scratch demand vs capacity per cluster; per-group and per-workload outliers |
| `04_long_jobs` | Long-job requirements split by checkpointing (genuine need vs awareness gap) and by scaling (run wider vs run longer) |
| `05_parallel_and_throughput` | High scalers: useful job size vs policy maximum. Low/intermediate scalers: queue fit, concurrency limits, time to finish a year's work, queue waits, debug use |
| `06_triage` | Suggested clarification (2) and technical-assessment (3) candidates; data quality |

## What the numbers mean

- **Demand** per workload = cores × wall time × jobs per year. *Used* = last 12 months; *desired* = what the group would run
  if limits did not bind (an upper bound). GPU-hours likewise with GPUs.
- **Capacity** = cores (or GPUs) × 8,760 h × `committeeParameters.targetUtilisation`. **Deficit = demand − capacity**
  (positive = shortfall).
- **Cluster attribution:** the cluster each workload names. "Both" is split 50:50; "Not decided" / "Don't know" go to
  *unattributed* (shown separately and in *combined*). GPU work goes to Raman.
- **Storage:** home and scratch capacities come from each cluster's usable storage and the committee's
  `scratchFraction`. Scratch demand is reported as a sum of peaks (worst case) and as a time-averaged load.
- **"Don't know" is never zero.** Workloads with unknown inputs are left out of totals, and their count is printed.
- **Coverage:** totals cover responding groups only.

## Committee parameters

Set in [`src/config/clusters.json`](../src/config/clusters.json) under `committeeParameters` (and each cluster's
`storage.scratchFraction`): target utilisation, home:scratch split, largest scratch area per user, home guide per group,
and scratch trigger fractions. The form's follow-up triggers and these notebooks read the same file.

## Only the respondents' data

The analysis is code-agnostic: no flag or total depends on which code a workload runs. Checking answers against outside
knowledge of a code (or against Slurm accounting) is done by hand. For that, `code_capabilities.json` keeps a reference
list of codes documented to support checkpoint/restart, with the mechanism and a documentation link for each
(`reference_type` marks secondary sources still to verify). `ha.restart_cross_check(wl)` lists the workloads whose code is
on it, next to the reported checkpoint answer, when a committee member asks; nothing else uses it.

- **Missing answers get neutral defaults** (`ha.NEUTRAL_DEFAULTS`): a blank, optional or "don't know" answer neither adds
  demand nor raises a flag, and yes/no flags whose inputs are unknown are `<NA>`, not False.
- **Internal consistency** (`ha.consistency_checks`): answers in one submission that do not fit together, listed after
  submission as things to confirm (notebook 06, and category-2 reasons in triage). The form does not check them.

## Writing your own analysis

```python
from sheets_client import load_data, load_config
import hpc_analysis as ha
dfs, cfg = load_data('YOUR_SPREADSHEET_ID'), load_config()
wl = ha.workloads(dfs, cfg)          # one row per workload, numbers parsed, demand and attribution added
wl[wl['walltime_h'] > 72]            # standard pandas from here
```

Sheet tabs: `Submissions, Group, Experience, Workloads, StorageTesting, LongJobs, Scaling, Memory, Gpu, Scratch,
Queue, Closing, CommitteeAssessment`. Quantities are already in hours and GB. LongJobs, Scaling, Memory, Gpu and
Scratch (the Section D panels) have one row per code that opened the panel; join them to Workloads on
`(submission_id, entry_index)`. Their `not_aware` column is true where the respondent ticked "don't know these
details". Yearly totals (`core_hours_year_max` …) are upper bounds, since each entry describes its heaviest job.

## Testing without real data

`fixtures/synthetic_v3/` holds 12 **fictional** groups, generated by running the form's submit step and the real sheet writer
(`npx tsx analysis/fixtures/make_synthetic.ts`). To run a notebook on them locally, set `HPC_DATA_DIR=fixtures/synthetic_v3`.
Edit the notebooks through `_build_notebooks.py`, then run `python _build_notebooks.py`.

The v1 pilot responses are **not** used as test data. Their questions, units and dimensions differ from v3, and they
contain real names. They stay in the archived v1 sheet.
