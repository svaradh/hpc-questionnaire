"""
sheets_client.py
----------------
Loads HPC questionnaire responses (schema 2.0.0) and the cluster
configuration.

Usage (in Google Colab)
-----------------------
    from sheets_client import load_data, load_config
    dfs = load_data('YOUR_SPREADSHEET_ID')
    cfg = load_config()

Usage (locally, e.g. with the synthetic test data)
--------------------------------------------------
    dfs = load_data('fixtures/synthetic_v3')     # a folder of <Tab>.csv files
    cfg = load_config('../src/config/clusters.json')

If the environment variable HPC_DATA_DIR is set, load_data() reads CSVs from
that folder regardless of its argument (used to test the notebooks).

Each value of `dfs` is a pandas DataFrame, one per sheet tab. Multi-value
columns (problems, organisation, ...) are '; '-joined strings: use
explode_semicolons() to count them. Numeric columns may contain 'dont_know';
use hpc_analysis.num() to read them as numbers (unknown -> NaN, never 0).
"""

from __future__ import annotations

import json
import os
import re
import urllib.request

import pandas as pd

# Sheet tabs written by apps-script/SheetWriter.gs (schema 2.0.0)
SHEET_TABS = [
    "Submissions", "Group", "Experience", "Workloads", "StorageTesting",
    "LongJobs", "Scaling", "Memory", "Gpu", "Scratch", "Queue", "Closing",
    "CommitteeAssessment",
]

# Where notebooks fetch the cluster config and helper modules from in Colab.
REPO_RAW = "https://raw.githubusercontent.com/svaradh/hpc-questionnaire"
DEFAULT_REF = "main"


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

def _clean(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
    return df


def load_local(folder: str) -> dict[str, pd.DataFrame]:
    """Load <Tab>.csv files from a folder (missing tabs -> empty DataFrames)."""
    out = {}
    for tab in SHEET_TABS:
        path = os.path.join(folder, f"{tab}.csv")
        out[tab] = _clean(pd.read_csv(path, dtype=object, keep_default_na=False)) if os.path.exists(path) else pd.DataFrame()
    return out


def load_sheets(spreadsheet_id: str) -> dict[str, pd.DataFrame]:
    """Load all tabs from the Google Sheet (must run in Google Colab)."""
    try:
        from google.colab import auth  # type: ignore
        from google.auth import default
        import gspread

        auth.authenticate_user()
        creds, _ = default()
        gc = gspread.authorize(creds)
    except ModuleNotFoundError:
        raise RuntimeError(
            "load_sheets() must be called from a Google Colab notebook.\n"
            "Open the notebook at colab.research.google.com and run it there,\n"
            "or pass a folder of CSV files to load_data() instead."
        )

    spreadsheet = gc.open_by_key(spreadsheet_id)
    worksheets = {ws.title: ws for ws in spreadsheet.worksheets()}
    out = {}
    for tab in SHEET_TABS:
        if tab not in worksheets:
            print(f"  [Note] Tab '{tab}' not found — using an empty table.")
            out[tab] = pd.DataFrame()
            continue
        values = worksheets[tab].get_all_values()
        out[tab] = _clean(pd.DataFrame(values[1:], columns=values[0])) if len(values) > 1 else pd.DataFrame(columns=values[0] if values else [])
    return out


def load_data(source: str) -> dict[str, pd.DataFrame]:
    """Spreadsheet ID (Colab) or a local folder of CSVs. HPC_DATA_DIR overrides."""
    folder = os.environ.get("HPC_DATA_DIR")
    if folder:
        return load_local(folder)
    if os.path.isdir(source):
        return load_local(source)
    return load_sheets(source)


# ---------------------------------------------------------------------------
# Cluster configuration (src/config/clusters.json)
# ---------------------------------------------------------------------------

def load_config(source: str | None = None, ref: str = DEFAULT_REF) -> dict:
    """
    Load clusters.json and add the values derived from committee parameters
    (the same derivation as src/config/clusterConfig.ts):
      storage.scratchTB / homeTB, cpuCores, thresholds.scratch*TriggerGB.
    `source` may be a local path or URL; by default the file is looked for
    next to the repository, then fetched from GitHub at `ref`.
    """
    candidates = [source] if source else [
        os.environ.get("HPC_CONFIG", ""),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "config", "clusters.json"),
        "clusters.json",
    ]
    cfg = None
    for c in candidates:
        if c and not c.startswith("http") and os.path.exists(c):
            with open(c) as f:
                cfg = json.load(f)
            break
    if cfg is None:
        url = source if source and source.startswith("http") else f"{REPO_RAW}/{ref}/src/config/clusters.json"
        with urllib.request.urlopen(url) as r:
            cfg = json.load(r)
    return derive_config(cfg)


def derive_config(cfg: dict) -> dict:
    for c in cfg["clusters"]:
        st = c["storage"]
        st["scratchTB"] = st["usableTB"] * st["scratchFraction"]
        st["homeTB"] = st["usableTB"] * (1 - st["scratchFraction"])
        # CPU capacity counts compute and high-memory nodes (not the GPU node)
        c["cpuCores"] = sum(n["count"] * n["coresPerNode"] for n in c["nodeTypes"])
        c["gpuCount"] = (sum((g.get("gpusPerNode") or 0) * g["count"] for g in c.get("gpuNodes", []))
                         if all(g.get("gpusPerNode") for g in c.get("gpuNodes", [])) else None)
    p = cfg["committeeParameters"]
    smallest_gb = min(c["storage"]["scratchTB"] for c in cfg["clusters"]) * 1024
    cfg["thresholds"]["scratchPerJobTriggerGB"] = round(smallest_gb * p["scratchPerJobTriggerFraction"])
    cfg["thresholds"]["scratchConcurrentTriggerGB"] = round(smallest_gb * p["scratchConcurrentTriggerFraction"])
    return cfg


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def split_semicolons(series: pd.Series) -> pd.Series:
    """Split a column of '; '-joined strings into lists."""
    def _split(val):
        if val is None or (isinstance(val, float) and pd.isna(val)) or str(val).strip() == "":
            return []
        return [v.strip() for v in re.split(r";", str(val)) if v.strip()]
    return series.apply(_split)


def explode_semicolons(df: pd.DataFrame, col: str) -> pd.Series:
    """Flatten a '; '-joined column into one value per row (for value_counts())."""
    if df.empty or col not in df:
        return pd.Series(dtype=object)
    return split_semicolons(df[col]).explode().dropna().loc[lambda s: s != ""]


def summarise_sheets(dfs: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Row count per tab."""
    return pd.DataFrame([(t, len(d)) for t, d in dfs.items()], columns=["Tab", "Rows"])
