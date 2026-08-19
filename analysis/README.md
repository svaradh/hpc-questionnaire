# HPC Questionnaire — Committee Analysis Notebooks

Python notebooks for the HPC Users' Committee to analyse questionnaire responses and design QoS policy.

**Important:** These notebooks visualise evidence collected from research groups. They do not score, rank, or automatically assign queues. All policy decisions are made by the committee.

---

## What you need

1. An `@iiserb.ac.in` Google account — the HPC admin will share the response sheet with you
2. A web browser — that's it

No installation, no configuration, no API keys.

---

## Getting started

### Step 1 — Get access to the data

The HPC admin shares the **HPC Questionnaire Responses** Google Sheet with your IISER Google account (Viewer access). You will receive a sharing notification by email.

### Step 2 — Find the Spreadsheet ID

Open the sheet in your browser. The URL looks like:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```
Copy the long string between `/d/` and `/edit`. You will need this once in Step 4.

### Step 3 — Open a notebook in Colab

Go to **colab.research.google.com** and open any notebook:
- File → Open notebook → GitHub → paste `https://github.com/svaradh/hpc-questionnaire`
- Then navigate to the `analysis/` folder

### Step 4 — Run the setup notebook first

Open **`00_setup.ipynb`** and paste your Spreadsheet ID where indicated (one cell, clearly marked). Click **Runtime → Run all**.

Colab will ask you to sign in with your Google account — click your IISER account. This happens once per Colab session. After that, open and run any other notebook directly.

---

## Notebooks

| Notebook | What it shows |
|---|---|
| `00_setup.ipynb` | Connect to the sheet, verify data loaded correctly |
| `01_workload_overview.ipynb` | Workload categories, codes used, job counts, department breakdown |
| `02_resource_requirements.ipynb` | Memory per core, wall-time distribution, core counts, evidence levels |
| `03_gpu_demand.ipynb` | GPU status, memory needs, frameworks, NVLink/multi-node, CPU vs GPU speedup |
| `04_workflow_patterns.ipynb` | Independent/pipeline/extended split, CPU-hours used vs needed gap |
| `05_service_gaps.ipynb` | Problems experienced, wall-time terminations, scaling behaviour |
| `06_qos_clusters.ipynb` | Workload fingerprints, QoS dimension prevalence, triage priority table |

Run them in any order after `00_setup.ipynb`.

---

## Writing your own analysis

Once the data is loaded, each sheet tab is a standard pandas DataFrame. Open a new Colab notebook and write anything you like:

```python
# Two lines to get started in any new notebook
from sheets_client import load_sheets, explode_semicolons, map_range_labels, MEMORY_PER_CORE_LABELS
dfs = load_sheets('YOUR_SPREADSHEET_ID')

# Standard pandas from here
df = dfs['RuntimeRecords']
df[df['wall_time_hours'].astype(float) > 48]        # filter long jobs
df.groupby('evidence_source').size()                 # count by source

# Multi-value columns (categories, problems, frameworks, etc.)
explode_semicolons(dfs['Workloads'], 'categories').value_counts()

# Readable axis labels from range keys
map_range_labels(dfs['JobSetups']['memory_range'], MEMORY_PER_CORE_LABELS)
```

**Helper functions** (import from `sheets_client`):
- `load_sheets(spreadsheet_id)` — loads all tabs as DataFrames
- `explode_semicolons(df, col)` — flattens semicolon-joined columns for counting
- `split_semicolons(series)` — splits into lists without exploding
- `map_range_labels(series, mapping)` — converts range keys to readable labels
- `summarise_sheets(dfs)` — shows row counts per tab

**Label mappings** (import from `sheets_client`):
`CPU_HOURS_LABELS`, `WALL_TIME_LABELS`, `MEMORY_LABELS`, `MEMORY_PER_CORE_LABELS`,
`CORES_LABELS`, `GPU_MEMORY_LABELS`, `JOB_COUNT_LABELS`

---

## Available data tabs

| Tab | Contents |
|---|---|
| Submissions | Index — one row per group (submission_id, pi_name, department) |
| RespondentInfo | Section A — PI and respondent details |
| Workloads | Section B — codes used, categories, job counts (one row per code) |
| JobSetups | Section C — typical job configurations (one row per code+system) |
| RuntimeRecords | Section D — observed runtimes with evidence source and level |
| WallTimeTerminations | Section E — wall-time termination events |
| CheckpointInfo | Section F — checkpoint/restart capability per code |
| ScalingInfo | Section G — parallel scaling observations |
| MemoryInfo | Section H — memory requirements per code |
| GpuInfo | Section I — GPU requirements and CPU vs GPU comparison |
| IndependentJobs | Section J — independent job workflow data |
| PipelineJobs | Section J — pipeline workflow data |
| ExtendedCalcs | Section J — extended single calculation data |
| BenchmarkRequests | Section D — benchmark requests |
| ServiceObservations | Section N — problems experienced and workload characteristics |
| CommitteeAssessment | Committee triage and notes (filled in by committee) |
