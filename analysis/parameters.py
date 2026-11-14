"""
parameters.py
-------------
Evaluation parameters and named scenarios.

The committee's evaluation parameters (annual target, allowance, premium
multiple, availability, candidate queues, ...) are listed in
parameters.json. A *scenario* is one named set of values for them. Scenarios
are saved, never overwritten: saving under an existing name adds a newer
version, and reports record which version they used.

Where scenarios are kept
    Spreadsheet ID (Colab)  -> a 'Scenarios' tab in the response sheet (convener only)
    local folder of CSVs    -> <folder>/Scenarios.csv

    schema = load_schema()
    store = scenario_store(SPREADSHEET_ID)
    sc = store.get('Target 10 lakh, 60 % allowance')      # latest version
    cfg = apply(cfg, schema, sc)                           # cfg['parameters'], cfg['scenario']

Code reads a value with param(cfg, 'availability'); None means not set.
Scenarios saved under an earlier parameter list are read through LEGACY
(e.g. a single 'targetUtilisation' u becomes availability 1 and usable share u),
so an old scenario gives the same figures as when it was saved.
"""

from __future__ import annotations

import copy
import csv
import datetime as dt
import io
import json
import os
import urllib.request

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_RAW = "https://raw.githubusercontent.com/svaradh/hpc-questionnaire"
TAB = "Scenarios"
COLUMNS = ["name", "saved_at", "parameters_version", "note", "values_json"]
DEFAULTS_NAME = "Defaults"

# Parameters replaced in later versions of parameters.json: old id -> function(old value) -> new values.
LEGACY = {
    # 1.0.0 had one target utilisation; 1.1.0 splits it into availability x usable share.
    "targetUtilisation": lambda u: {"availability": 1.0, "schedulableUtilisation": u},
}


def migrate(values: dict) -> dict:
    """Values saved under an earlier parameter list, in the current parameters (new ids win if both are present)."""
    out = {k: v for k, v in values.items() if k not in LEGACY}
    for old, conv in LEGACY.items():
        if values.get(old) is not None:
            for k, v in conv(values[old]).items():
                out.setdefault(k, v)
    return out


# ---------------------------------------------------------------------------
# Parameter list
# ---------------------------------------------------------------------------

def load_schema(source: str | None = None, ref: str = "main") -> dict:
    """parameters.json: next to this module, in the working directory, or from GitHub at `ref`."""
    for c in [source, os.path.join(HERE, "parameters.json"), "parameters.json"]:
        if c and not c.startswith("http") and os.path.exists(c):
            with open(c, encoding="utf-8") as f:
                return json.load(f)
    url = source if source and source.startswith("http") else f"{REPO_RAW}/{ref}/analysis/parameters.json"
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def parameters(schema: dict) -> list[dict]:
    return [p for g in schema["groups"] for p in g["parameters"]]


def defaults(schema: dict) -> dict:
    return {p["id"]: copy.deepcopy(p.get("default")) for p in parameters(schema)}


def label(p: dict) -> str:
    return f"{p['label']} ({p['unit']})" if p.get("unit") else p["label"]


# ---------------------------------------------------------------------------
# Reading and checking values
# ---------------------------------------------------------------------------

def _number(text, where: str, errors: list) -> float | None:
    if text is None or (isinstance(text, str) and text.strip() == ""):
        return None
    try:
        return float(str(text).replace(",", "").replace("₹", "").strip())
    except ValueError:
        errors.append(f"{where}: “{text}” is not a number.")
        return None


def table_from_text(p: dict, text: str, errors: list) -> list[dict] | None:
    """Comma-separated lines, one row each, in the column order of the parameter. Blank = not set."""
    lines = [ln for ln in (text or "").splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    if not lines:
        return None
    cols = p["columns"]
    rows = []
    for i, row in enumerate(csv.reader(lines), 1):
        row = [c.strip() for c in row]
        if [c.lower() for c in row[:len(cols)]] == [c["id"].lower() for c in cols][:len(row)]:
            continue  # header line
        if len(row) > len(cols):
            errors.append(f"{p['label']}, line {i}: {len(row)} values, expected at most {len(cols)}.")
            continue
        row += [""] * (len(cols) - len(row))
        out = {}
        for c, v in zip(cols, row):
            out[c["id"]] = _number(v, f"{p['label']}, line {i}, {c['id']}", errors) if c["type"] == "number" else (v or None)
        rows.append(out)
    return rows or None


def table_to_text(p: dict, rows: list[dict] | None) -> str:
    if not rows:
        return ""
    def fmt(v):
        return "" if v is None else (f"{v:g}" if isinstance(v, float) else str(v))
    return "\n".join(", ".join(fmt(r.get(c["id"])) for c in p["columns"]) for r in rows)


def check(schema: dict, values: dict) -> tuple[dict, list[str]]:
    """Values as entered (numbers, numeric text, table text or row lists) -> clean values and a list of problems."""
    errors: list[str] = []
    out = {}
    for p in parameters(schema):
        v = values.get(p["id"], p.get("default"))
        if p["type"] == "table":
            v = table_from_text(p, v, errors) if isinstance(v, str) else (v or None)
        else:
            v = _number(v, p["label"], errors)
            if v is not None:
                if "min" in p and v < p["min"]:
                    errors.append(f"{p['label']}: {v:g} is below the smallest allowed value, {p['min']:g}.")
                if "max" in p and v > p["max"]:
                    errors.append(f"{p['label']}: {v:g} is above the largest allowed value, {p['max']:g}.")
        if v is None and p.get("required"):
            errors.append(f"{p['label']}: a value is needed.")
        out[p["id"]] = v
    return out, errors


# ---------------------------------------------------------------------------
# Applying a scenario
# ---------------------------------------------------------------------------

def apply(cfg: dict, schema: dict, scenario: dict | None = None) -> dict:
    """A copy of the cluster config with cfg['parameters'] (all ids, None = not set) and cfg['scenario']."""
    out = copy.deepcopy(cfg)
    if scenario is None:
        scenario = {"name": DEFAULTS_NAME, "saved_at": None, "note": "", "values": defaults(schema)}
    vals, errors = check(schema, {**defaults(schema), **migrate(scenario["values"])})
    if errors:
        raise ValueError(f"Scenario “{scenario['name']}”: " + " ".join(errors))
    out["parameters"] = vals
    out["scenario"] = {k: scenario.get(k) for k in ("name", "saved_at", "note")} | {
        "parameters_version": schema.get("version")}
    out["parameterSchema"] = schema
    return out


def param(cfg: dict, pid: str):
    """A parameter value from an applied config; None = not set."""
    return cfg["parameters"].get(pid)


def missing_for(cfg: dict, chapter: str) -> list[dict]:
    """Parameters a report chapter uses that are not set."""
    return [p for p in parameters(cfg["parameterSchema"]) if chapter in p.get("chapters", []) and param(cfg, p["id"]) is None]


def summary_table(cfg: dict) -> pd.DataFrame:
    """One row per parameter: group, label, value as text."""
    rows = []
    for g in cfg["parameterSchema"]["groups"]:
        for p in g["parameters"]:
            v = param(cfg, p["id"])
            if v is None:
                txt = "not yet set"
            elif p["type"] == "table":
                txt = f"{len(v)} queues"
            else:
                txt = f"{v:,.6g}"
            rows.append({"group": g["title"], "parameter": label(p), "value": txt})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Scenario store
# ---------------------------------------------------------------------------

class ScenarioStore:
    """Saved scenarios as rows of a table (see COLUMNS). Subclasses read and append rows."""

    def _rows(self) -> pd.DataFrame:
        raise NotImplementedError

    def _append(self, row: list[str]) -> None:
        raise NotImplementedError

    def names(self) -> list[str]:
        """Saved scenario names, most recently saved first."""
        df = self._rows()
        if df.empty:
            return []
        return list(df.sort_values("saved_at", ascending=False)["name"].drop_duplicates())

    def get(self, name: str, saved_at: str | None = None) -> dict:
        """The latest version of a scenario, or the one saved at `saved_at`."""
        df = self._rows()
        df = df[df["name"] == name] if not df.empty else df
        if saved_at:
            df = df[df["saved_at"] == saved_at]
        if df.empty:
            raise KeyError(f"No saved scenario named “{name}”.")
        r = df.sort_values("saved_at").iloc[-1]
        return {"name": r["name"], "saved_at": r["saved_at"], "note": r.get("note", ""),
                "parameters_version": r.get("parameters_version"), "values": json.loads(r["values_json"])}

    def save(self, schema: dict, name: str, values: dict, note: str = "") -> dict:
        """Check and save; raises ValueError listing every problem. Returns the saved scenario."""
        name = (name or "").strip()
        problems = [] if name else ["Give the scenario a name."]
        if name == DEFAULTS_NAME:
            problems.append(f"“{DEFAULTS_NAME}” is reserved for the values in parameters.json.")
        clean, errors = check(schema, values)
        problems += errors
        if problems:
            raise ValueError(" ".join(problems))
        saved_at = dt.datetime.now().isoformat(timespec="seconds")
        self._append([name, saved_at, schema.get("version", ""), note or "", json.dumps(clean, ensure_ascii=False)])
        return {"name": name, "saved_at": saved_at, "note": note or "", "values": clean}


class CsvScenarioStore(ScenarioStore):
    def __init__(self, path: str):
        self.path = path

    def _rows(self) -> pd.DataFrame:
        if not os.path.exists(self.path):
            return pd.DataFrame(columns=COLUMNS)
        return pd.read_csv(self.path, dtype=str, keep_default_na=False)

    def _append(self, row):
        new = not os.path.exists(self.path)
        with open(self.path, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if new:
                w.writerow(COLUMNS)
            w.writerow(row)


class SheetScenarioStore(ScenarioStore):
    """The 'Scenarios' tab of the response sheet (created on first save). Needs Colab."""

    def __init__(self, spreadsheet_id: str):
        from sheets_client import gspread_client
        self.ss = gspread_client().open_by_key(spreadsheet_id)

    def _sheet(self, create: bool):
        import gspread
        try:
            return self.ss.worksheet(TAB)
        except gspread.WorksheetNotFound:
            if not create:
                return None
            ws = self.ss.add_worksheet(TAB, rows=100, cols=len(COLUMNS))
            ws.append_row(COLUMNS)
            return ws

    def _rows(self) -> pd.DataFrame:
        ws = self._sheet(create=False)
        values = ws.get_all_values() if ws else []
        return pd.DataFrame(values[1:], columns=values[0]) if len(values) > 1 else pd.DataFrame(columns=COLUMNS)

    def _append(self, row):
        self._sheet(create=True).append_row(row, value_input_option="RAW")


def scenario_store(source: str) -> ScenarioStore:
    """Where scenarios for this data source are kept (same rule as load_data; HPC_DATA_DIR overrides)."""
    folder = os.environ.get("HPC_DATA_DIR") or (source if os.path.isdir(source) else None)
    if folder:
        return CsvScenarioStore(os.path.join(folder, f"{TAB}.csv"))
    return SheetScenarioStore(source)
