"""
sheets_client.py
----------------
Shared module for loading HPC questionnaire data from a Google Sheet.

Usage (in any Google Colab notebook)
-------------------------------------
    from sheets_client import load_sheets
    dfs = load_sheets('YOUR_SPREADSHEET_ID')
    submissions = dfs['Submissions']

Authentication
--------------
This module uses Google Colab's built-in authentication — no service account,
no API keys, no configuration files. When you call load_sheets(), Colab will
ask you to sign in with your Google account (one click). You need Viewer access
to the sheet, which the admin shares with you via Google Drive.

Writing your own analysis
--------------------------
Once you have `dfs`, each value is a standard pandas DataFrame:

    df = dfs['RuntimeRecords']
    df[df['wall_time_hours'] > 48]          # filter
    df.groupby('evidence_source').size()    # aggregate
    df['wall_time_hours'].hist()            # plot

Multi-value columns (e.g. categories, problems) are stored as
semicolon-joined strings. Use explode_semicolons() to count them:

    from sheets_client import explode_semicolons
    explode_semicolons(dfs['Workloads'], 'categories').value_counts()
"""

from __future__ import annotations

import re
from typing import Optional

import pandas as pd


# ---------------------------------------------------------------------------
# Range label mappings — import these in notebooks for consistent labels
# ---------------------------------------------------------------------------

CPU_HOURS_LABELS: dict[str, str] = {
    "lt_1000":        "<1K",
    "1000_9999":      "1K–10K",
    "10000_99999":    "10K–100K",
    "100000_499999":  "100K–500K",
    "500000_999999":  "500K–1M",
    "1000000_plus":   "≥1M",
    "not_estimated":  "Not estimated",
    "dont_know":      "Don't know",
}

WALL_TIME_LABELS: dict[str, str] = {
    "lt_1h":   "<1h",
    "1h_6h":   "1–6h",
    "6h_24h":  "6–24h",
    "1d_3d":   "1–3d",
    "3d_7d":   "3–7d",
    "gt_7d":   ">7d",
    "dont_know": "Don't know",
}

MEMORY_LABELS: dict[str, str] = {
    "lt_16gb":    "<16 GB",
    "16_64gb":    "16–64 GB",
    "65_128gb":   "65–128 GB",
    "129_256gb":  "129–256 GB",
    "257_512gb":  "257–512 GB",
    "513gb_plus": ">512 GB",
    "dont_know":  "Don't know",
}

MEMORY_PER_CORE_LABELS: dict[str, str] = {
    "lt_2gb":    "<2 GB/core",
    "2_4gb":     "2–4 GB/core",
    "4_8gb":     "4–8 GB/core",
    "8_16gb":    "8–16 GB/core",
    "16_32gb":   "16–32 GB/core",
    "32gb_plus": ">32 GB/core",
    "dont_know": "Don't know",
}

CORES_LABELS: dict[str, str] = {
    "1_8":      "1–8",
    "9_32":     "9–32",
    "33_128":   "33–128",
    "129_512":  "129–512",
    "513_plus": "≥513",
    "dont_know": "Don't know",
}

GPU_MEMORY_LABELS: dict[str, str] = {
    "lt_16gb":  "<16 GB",
    "16_40gb":  "16–40 GB",
    "40_80gb":  "40–80 GB",
    "gt_80gb":  ">80 GB",
    "dont_know": "Don't know",
}

JOB_COUNT_LABELS: dict[str, str] = {
    "lt_10":     "<10",
    "10_49":     "10–49",
    "50_99":     "50–99",
    "100_499":   "100–499",
    "500_999":   "500–999",
    "1000_4999": "1K–5K",
    "5000_plus": "≥5K",
    "dont_know": "Don't know",
}

# Numeric midpoints for ordering range strings on axes
CPU_HOURS_MIDPOINTS: dict[str, float] = {
    "lt_1000": 500, "1000_9999": 5000, "10000_99999": 50000,
    "100000_499999": 300000, "500000_999999": 750000, "1000000_plus": 1500000,
}

JOB_COUNT_MIDPOINTS: dict[str, float] = {
    "lt_10": 5, "10_49": 30, "50_99": 75, "100_499": 300,
    "500_999": 750, "1000_4999": 3000, "5000_plus": 7500, "dont_know": -1,
}

# ---------------------------------------------------------------------------
# Sheet tab names (must match the Google Sheet exactly)
# ---------------------------------------------------------------------------

SHEET_TABS = [
    "Submissions", "RespondentInfo", "Workloads", "JobSetups",
    "RuntimeRecords", "WallTimeTerminations", "CheckpointInfo",
    "ScalingInfo", "MemoryInfo", "GpuInfo",
    "IndependentJobs", "PipelineJobs", "ExtendedCalcs",
    "BenchmarkRequests", "ServiceObservations", "CommitteeAssessment",
]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
    return df


def _worksheet_to_df(worksheet) -> pd.DataFrame:
    try:
        records = worksheet.get_all_records(default_blank="")
        if not records:
            return pd.DataFrame()
        return _clean_dataframe(pd.DataFrame(records))
    except Exception:
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_sheets(spreadsheet_id: str) -> dict[str, pd.DataFrame]:
    """
    Load all questionnaire sheet tabs into a dict of DataFrames.

    Parameters
    ----------
    spreadsheet_id : str
        The Google Sheet ID (the long string in the sheet URL between /d/ and /edit).

    Returns
    -------
    dict[str, pd.DataFrame]
        Keys are sheet tab names. Missing or empty tabs return empty DataFrames.

    Notes
    -----
    Must be called from a Google Colab notebook. Colab will prompt you to
    sign in with your Google account on first call. You need Viewer access
    to the sheet (granted by the HPC admin).
    """
    # Colab authentication — one sign-in prompt, then cached for the session
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
            "Open the notebook at colab.research.google.com and run it there."
        )

    spreadsheet = gc.open_by_key(spreadsheet_id)
    all_worksheets = {ws.title: ws for ws in spreadsheet.worksheets()}

    result: dict[str, pd.DataFrame] = {}
    for tab in SHEET_TABS:
        if tab in all_worksheets:
            result[tab] = _worksheet_to_df(all_worksheets[tab])
        else:
            print(f"  [Note] Tab '{tab}' not found — returning empty DataFrame.")
            result[tab] = pd.DataFrame()

    return result


def split_semicolons(series: pd.Series) -> pd.Series:
    """Split a column of semicolon-joined strings into lists."""
    def _split(val):
        if pd.isna(val) or str(val).strip() == "":
            return []
        return [v.strip() for v in re.split(r"[;,]", str(val)) if v.strip()]
    return series.apply(_split)


def explode_semicolons(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Flatten a semicolon-joined column into individual values.
    Use .value_counts() on the result to count occurrences.

    Example
    -------
        explode_semicolons(dfs['Workloads'], 'categories').value_counts()
    """
    return split_semicolons(df[col]).explode().dropna().loc[lambda s: s != ""]


def map_range_labels(series: pd.Series, mapping: dict) -> pd.Series:
    """Map raw range keys (e.g. '1000_9999') to readable labels (e.g. '1K–10K')."""
    return series.map(lambda x: mapping.get(str(x).strip(), str(x).strip()) if pd.notna(x) else x)


def summarise_sheets(dfs: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Show a row-count summary for all loaded tabs."""
    return pd.DataFrame(
        [(tab, len(df)) for tab, df in dfs.items()],
        columns=["Tab", "Rows"]
    )
