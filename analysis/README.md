# HPC Questionnaire Analysis Notebooks

These notebooks help the HPC Users' Committee at IISER Bhopal analyse submissions from the HPC Workload Characterisation Questionnaire. They produce charts and summaries that the committee uses to understand workload diversity and plan appropriate Quality-of-Service classes.

**Important:** These notebooks visualise evidence collected from research groups. They do not score, rank, or automatically assign queues. All policy decisions are made by the committee.

---

## Prerequisites

- A Google account with at least **read** access to the questionnaire Google Sheet
- No local Python installation needed — all notebooks run in Google Colab

---

## How to open in Colab

**Option A — Upload manually**

1. Download or clone this `analysis/` folder to your computer.
2. Go to [colab.research.google.com](https://colab.research.google.com).
3. Choose **File → Upload notebook** and select the `.ipynb` file you want to open.
4. Upload `sheets_client.py` to the Colab session storage (see Setup below).

**Option B — Open from GitHub**

1. Push this repository to GitHub (or a fork).
2. Go to [colab.research.google.com](https://colab.research.google.com).
3. Choose **File → Open notebook → GitHub** tab.
4. Paste the repository URL and select the notebook.

---

## How to set up sheet access

The notebooks support two authentication methods. Choose whichever suits your situation.

### Method 1 — Interactive OAuth (recommended for committee members)

This is the simplest method. When you run `00_setup.ipynb`, a pop-up will ask you to sign in with your Google account. No key files are needed.

This method uses `google.colab.auth.authenticate_user()` and works only inside Colab.

### Method 2 — Service account key (for automated or server-side use)

1. In [Google Cloud Console](https://console.cloud.google.com), create a service account with the **Google Sheets API** and **Google Drive API** enabled.
2. Download the JSON key file.
3. Share your Google Sheet with the service account email (view access is sufficient).
4. In `00_setup.ipynb`, set `SERVICE_ACCOUNT_KEY_PATH` to the path of the JSON file (e.g. `/content/service_account.json` after uploading it to Colab).

---

## How to run

1. Open `00_setup.ipynb` first. Run all cells. This installs packages, sets your Sheet ID, authenticates, and confirms all tabs are accessible.
2. Open any of the numbered notebooks (`01_` through `06_`). Each notebook imports `sheets_client` and calls `load_sheets()` at the top — you do not need to re-authenticate if you are in the same Colab session.
3. Run all cells in order. Charts appear inline.

**Run order:** `00_setup` must be run first in each new session. The other notebooks (`01` to `06`) are independent of each other and can be run in any order.

---

## Notebook descriptions

| Notebook | What it shows |
|---|---|
| `00_setup.ipynb` | Authentication, sheet connection, row-count summary |
| `01_workload_overview.ipynb` | Workload categories, codes used, job volumes, department distribution |
| `02_resource_requirements.ipynb` | Memory, wall time, core counts, evidence confidence levels |
| `03_gpu_demand.ipynb` | GPU usage status, memory, frameworks, speedup ratios |
| `04_workflow_patterns.ipynb` | Independent jobs, pipelines, extended calculations, checkpointing |
| `05_service_gaps.ipynb` | Problems experienced, wall-time terminations, checkpoint issues, scaling |
| `06_qos_clusters.ipynb` | Workload fingerprints, QoS dimension overlap, triage ordering |

---

## How to add custom analysis

- Each notebook follows the same pattern: load data, filter/clean, plot.
- Add new cells at the bottom of the relevant notebook.
- The `load_sheets()` function returns a plain `dict` of pandas DataFrames — one per sheet tab. You can join, filter, and plot them however you like.
- The `sheets_client.py` module contains helper functions (`split_semicolons`, `map_range_labels`) that are useful when working with multi-value fields and range strings.
- Do not modify `sheets_client.py` unless you are changing authentication or data loading behaviour — keep analysis logic in the notebooks.

---

## Troubleshooting

**"Worksheet not found"** — The sheet tab name must match exactly. Check that your Google Sheet has all the tabs listed in the questionnaire data model.

**"403 Forbidden"** — The authenticated account does not have access to the sheet. Share the sheet with the relevant Google account or service account email.

**Empty DataFrames** — If a tab exists but has no data rows (only a header), the notebook will skip that chart and print a notice. This is normal if no submissions have been collected yet.

**Package import errors** — Re-run `00_setup.ipynb` to reinstall packages. Colab environments reset between sessions.
