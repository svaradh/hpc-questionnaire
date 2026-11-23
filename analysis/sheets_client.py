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

import parameters as pm

# Sheet tabs written by apps-script/SheetWriter.gs (schema 2.0.0)
SHEET_TABS = [
    "Submissions", "Group", "Experience", "Workloads", "StorageTesting",
    "LongJobs", "Scaling", "Memory", "Gpu", "Scratch", "Queue", "Closing",
    "Charging", "CommitteeAssessment",
]

# Where notebooks fetch the cluster config and helper modules from in Colab.
REPO_RAW = "https://raw.githubusercontent.com/svaradh/hpc-questionnaire"
REPO_API = "https://api.github.com/repos/svaradh/hpc-questionnaire"

# The release the notebooks use: a git tag on a tested combination of form, backend, analysis
# and cluster configuration. Later changes to the repository do not reach a notebook until its
# REPO_REF is set to a newer tag. To release: change this, run _build_notebooks.py, commit, then
# `git tag <name> && git push origin <name>` (docs: analysis/README.md, "Versions").
DEFAULT_REF = "v3-2026-11-23"

# Form versions whose sheet columns this analysis code was written and tested for.
SUPPORTED_FORM_VERSIONS = {"2.7.0", "2.7.1"}


def code_version() -> str:
    """Which analysis code is running, for the report: the release tag and its commit.

    In Colab the notebook's first cell records REPO_REF (HPC_CODE_REF) and the commit GitHub
    resolves it to (HPC_CODE_COMMIT). Run locally, the git checkout is described instead.
    """
    ref, commit = os.environ.get("HPC_CODE_REF"), os.environ.get("HPC_CODE_COMMIT")
    if ref:
        return f"{ref} (commit {commit[:7]})" if commit else f"{ref} (commit not resolved)"
    try:
        import subprocess
        here = os.path.dirname(os.path.abspath(__file__))
        git = lambda *a: subprocess.run(["git", "-C", here, *a], capture_output=True, text=True, timeout=5).stdout.strip()
        sha = git("rev-parse", "--short", "HEAD")
        if not sha:
            return "unknown"
        tag = git("describe", "--tags", "--exact-match", "HEAD")
        dirty = " with uncommitted changes" if git("status", "--porcelain", "--", ".") else ""
        return f"local copy at {tag or 'commit'} {sha}{dirty}" if tag else f"local copy at commit {sha}{dirty}"
    except Exception:
        return "unknown"


def resolve_commit(ref: str) -> str | None:
    """The commit a branch or tag points to on GitHub (None if it cannot be reached)."""
    try:
        req = urllib.request.Request(f"{REPO_API}/commits/{ref}", headers={"Accept": "application/vnd.github.sha"})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read().decode().strip() or None
    except Exception:
        return None


def unsupported_form_versions(dfs: dict) -> list[str]:
    """Form versions present in the responses that this analysis code was not written for."""
    sub = dfs.get("Submissions")
    if sub is None or sub.empty or "questionnaire_version" not in sub:
        return []
    found = {str(v) for v in sub["questionnaire_version"].dropna().unique() if str(v).strip()}
    return sorted(found - SUPPORTED_FORM_VERSIONS)


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


_GC = None


def gspread_client():
    """A signed-in gspread client (Colab asks once per session)."""
    global _GC
    if _GC is None:
        try:
            from google.colab import auth  # type: ignore
            from google.auth import default
            import gspread

            auth.authenticate_user()
            creds, _ = default()
            _GC = gspread.authorize(creds)
        except ModuleNotFoundError:
            raise RuntimeError(
                "Reading the Google Sheet must be done from a Google Colab notebook.\n"
                "Open the notebook at colab.research.google.com and run it there,\n"
                "or pass a folder of CSV files to load_data() instead."
            )
    return _GC


def load_sheets(spreadsheet_id: str) -> dict[str, pd.DataFrame]:
    """Load all tabs from the Google Sheet (must run in Google Colab)."""
    spreadsheet = gspread_client().open_by_key(spreadsheet_id)
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
        dfs = load_local(folder)
    elif os.path.isdir(source):
        dfs = load_local(source)
    else:
        dfs = load_sheets(source)
    other = unsupported_form_versions(dfs)
    if other:
        print(f"  [Warning] Responses from form version(s) {', '.join(other)}, which this analysis code "
              f"({code_version()}) was not written for. Use a newer release (REPO_REF) before relying on the results.")
    return dfs


# ---------------------------------------------------------------------------
# Cluster configuration (src/config/clusters.json)
# ---------------------------------------------------------------------------

def load_config(source: str | None = None, ref: str = DEFAULT_REF) -> dict:
    """
    Load clusters.json and add the values derived from it (the same
    derivation as src/config/clusterConfig.ts):
      storage.scratchTB / homeTB, cpuCores, thresholds.scratch*TriggerGB.
    The evaluation parameters are attached at their defaults from
    analysis/parameters.json (cfg['parameters']); pass a saved scenario to
    parameters.apply() to use other values.
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
    return pm.apply(derive_config(cfg), pm.load_schema(ref=ref))


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
