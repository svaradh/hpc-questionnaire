"""
sheets_client.py
----------------
Shared module for loading HPC questionnaire data from a Google Sheet.

Usage
-----
    from sheets_client import load_sheets
    dfs = load_sheets()
    submissions = dfs["Submissions"]

Authentication
--------------
The module tries two methods in order:

1. Service account JSON key:
   Set the environment variable SERVICE_ACCOUNT_KEY or pass
   service_account_key_path to load_sheets().

2. Google Colab interactive OAuth:
   If running inside Colab and no key is provided, calls
   google.colab.auth.authenticate_user() and uses the resulting
   credentials with gspread.

Sheet ID
--------
Set the environment variable SPREADSHEET_ID, or create a file named
.spreadsheet_id in the same directory containing only the sheet ID,
or pass spreadsheet_id directly to load_sheets().

Never hardcode the spreadsheet ID or credentials in this file.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

import pandas as pd


# ---------------------------------------------------------------------------
# Range label mappings (used by analysis notebooks via import)
# ---------------------------------------------------------------------------

CPU_HOURS_LABELS: dict[str, str] = {
    "lt_1000": "<1K",
    "1000_9999": "1K–10K",
    "10000_99999": "10K–100K",
    "100000_499999": "100K–500K",
    "500000_999999": "500K–1M",
    "1000000_plus": "≥1M",
}

WALL_TIME_LABELS: dict[str, str] = {
    "lt_1h": "<1h",
    "1h_6h": "1–6h",
    "6h_24h": "6–24h",
    "1d_3d": "1–3d",
    "3d_7d": "3–7d",
    "gt_7d": ">7d",
}

MEMORY_LABELS: dict[str, str] = {
    "lt_16gb": "<16 GB",
    "16_64gb": "16–64 GB",
    "65_128gb": "65–128 GB",
    "129_256gb": "129–256 GB",
    "257_512gb": "257–512 GB",
    "513gb_plus": ">512 GB",
}

CORES_LABELS: dict[str, str] = {
    "1_8": "1–8",
    "9_32": "9–32",
    "33_128": "33–128",
    "129_512": "129–512",
    "513_plus": "≥513",
}

GPU_MEMORY_LABELS: dict[str, str] = {
    "lt_16gb": "<16 GB",
    "16_40gb": "16–40 GB",
    "40_80gb": "40–80 GB",
    "gt_80gb": ">80 GB",
}

JOB_COUNT_LABELS: dict[str, str] = {
    "lt_10": "<10",
    "10_49": "10–49",
    "50_99": "50–99",
    "100_499": "100–499",
    "500_999": "500–999",
    "1000_4999": "1K–5K",
    "5000_plus": "≥5K",
    "dont_know": "Don't know",
}

# Midpoint values for ordering range strings numerically
CPU_HOURS_MIDPOINTS: dict[str, float] = {
    "lt_1000": 500,
    "1000_9999": 5000,
    "10000_99999": 50000,
    "100000_499999": 300000,
    "500000_999999": 750000,
    "1000000_plus": 1500000,
}

JOB_COUNT_MIDPOINTS: dict[str, float] = {
    "lt_10": 5,
    "10_49": 30,
    "50_99": 75,
    "100_499": 300,
    "500_999": 750,
    "1000_4999": 3000,
    "5000_plus": 7500,
    "dont_know": -1,
}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Expected sheet tab names (in Google Sheet order)
SHEET_TABS = [
    "Submissions",
    "RespondentInfo",
    "Workloads",
    "JobSetups",
    "RuntimeRecords",
    "WallTimeTerminations",
    "CheckpointInfo",
    "ScalingInfo",
    "MemoryInfo",
    "GpuInfo",
    "IndependentJobs",
    "PipelineJobs",
    "ExtendedCalcs",
    "BenchmarkRequests",
    "ServiceObservations",
    "CommitteeAssessment",
]


def _get_spreadsheet_id(spreadsheet_id: Optional[str] = None) -> str:
    """Resolve the spreadsheet ID from argument, env var, or local file."""
    if spreadsheet_id:
        return spreadsheet_id

    env_id = os.environ.get("SPREADSHEET_ID", "").strip()
    if env_id:
        return env_id

    id_file = Path(__file__).parent / ".spreadsheet_id"
    if id_file.exists():
        file_id = id_file.read_text().strip()
        if file_id:
            return file_id

    raise ValueError(
        "Spreadsheet ID not found. Set the SPREADSHEET_ID environment variable, "
        "create a .spreadsheet_id file in the analysis/ directory, "
        "or pass spreadsheet_id= to load_sheets()."
    )


def _clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Strip whitespace from all string cells."""
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].apply(
            lambda x: x.strip() if isinstance(x, str) else x
        )
    return df


def _open_sheet_service_account(key_path: str, spreadsheet_id: str):
    """Open spreadsheet using a service account JSON key."""
    import gspread
    from google.oauth2.service_account import Credentials

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_file(key_path, scopes=scopes)
    gc = gspread.authorize(creds)
    return gc.open_by_key(spreadsheet_id)


def _open_sheet_colab(spreadsheet_id: str):
    """Open spreadsheet using interactive Colab OAuth."""
    from google.colab import auth  # type: ignore
    import gspread
    from google.auth import default

    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)
    return gc.open_by_key(spreadsheet_id)


def _worksheet_to_df(worksheet) -> pd.DataFrame:
    """Convert a gspread worksheet to a cleaned DataFrame."""
    try:
        records = worksheet.get_all_records(default_blank="")
        if not records:
            return pd.DataFrame()
        df = pd.DataFrame(records)
        df = _clean_dataframe(df)
        return df
    except Exception:
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def split_semicolons(series: pd.Series) -> pd.Series:
    """
    Split a Series of semicolon-joined strings into lists.

    Values like "electronic_structure; molecular_dynamics" become
    ["electronic_structure", "molecular_dynamics"].

    Empty strings and NaN become [].
    """
    def _split(val):
        if pd.isna(val) or str(val).strip() == "":
            return []
        return [v.strip() for v in re.split(r"[;,]", str(val)) if v.strip()]

    return series.apply(_split)


def explode_semicolons(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Return a flat Series of individual values after splitting a
    semicolon-joined column and exploding. Useful for value_counts().
    """
    series = split_semicolons(df[col])
    return series.explode().dropna().loc[lambda s: s != ""]


def map_range_labels(series: pd.Series, mapping: dict) -> pd.Series:
    """
    Map raw range keys to human-readable labels.
    Unmapped values are passed through unchanged.
    """
    return series.map(lambda x: mapping.get(str(x).strip(), str(x).strip()) if pd.notna(x) else x)


def load_sheets(
    spreadsheet_id: Optional[str] = None,
    service_account_key_path: Optional[str] = None,
) -> dict[str, pd.DataFrame]:
    """
    Load all questionnaire sheet tabs into a dict of DataFrames.

    Parameters
    ----------
    spreadsheet_id : str, optional
        The Google Sheet ID. Falls back to SPREADSHEET_ID env var or
        .spreadsheet_id file if not provided.
    service_account_key_path : str, optional
        Path to a service account JSON key file. If not provided and
        running in Colab, interactive OAuth is used instead.

    Returns
    -------
    dict[str, pd.DataFrame]
        Keys are sheet tab names (e.g. "Submissions", "Workloads").
        Missing or empty tabs return empty DataFrames.
    """
    sid = _get_spreadsheet_id(spreadsheet_id)

    # Resolve key path from argument or environment
    key_path = service_account_key_path or os.environ.get(
        "SERVICE_ACCOUNT_KEY", ""
    ).strip()

    if key_path and Path(key_path).exists():
        spreadsheet = _open_sheet_service_account(key_path, sid)
    else:
        # Try Colab OAuth; fall back with a clear error if not in Colab
        try:
            spreadsheet = _open_sheet_colab(sid)
        except ModuleNotFoundError:
            raise RuntimeError(
                "Not running in Google Colab and no service account key found. "
                "Set SERVICE_ACCOUNT_KEY to a valid JSON key path, or run this "
                "notebook in Google Colab for interactive OAuth."
            )

    # Build a dict keyed by worksheet title for fast lookup
    all_worksheets = {ws.title: ws for ws in spreadsheet.worksheets()}

    result: dict[str, pd.DataFrame] = {}
    for tab in SHEET_TABS:
        if tab in all_worksheets:
            result[tab] = _worksheet_to_df(all_worksheets[tab])
        else:
            print(f"  [Warning] Tab '{tab}' not found in spreadsheet — returning empty DataFrame.")
            result[tab] = pd.DataFrame()

    return result


def summarise_sheets(dfs: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Return a summary DataFrame showing tab name and row count.
    Useful for a quick sanity-check after loading.
    """
    rows = [(tab, len(df)) for tab, df in dfs.items()]
    return pd.DataFrame(rows, columns=["Tab", "Rows"])
