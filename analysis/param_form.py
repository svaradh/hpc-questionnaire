"""
param_form.py
-------------
The convener's form for evaluation parameters (notebook 07). It is generated
from parameters.json, so adding a parameter there adds it here.

    import param_form
    param_form.show(dfs, cfg, SPREADSHEET_ID)

Steps in the form: pick a saved scenario (or the defaults) to start from,
change values, give the scenario a name, then Save, or Save and build the
report. A blank box means "not yet decided": chapters that need that value
say so. Saving never overwrites: an existing name gets a newer version.
"""

from __future__ import annotations

import html
import re

import ipywidgets as w

import parameters as pm

NOT_SET = "not yet decided"


def _fmt(v) -> str:
    return "" if v is None else f"{v:g}"


def _slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower() or "scenario"


class ParameterForm:
    def __init__(self, dfs: dict, cfg: dict, source: str, schema: dict | None = None, store=None, download=True):
        self.dfs, self.base_cfg, self.download = dfs, cfg, download
        self.schema = schema or cfg.get("parameterSchema") or pm.load_schema()
        self.store = store or pm.scenario_store(source)
        self.inputs: dict[str, w.Widget] = {}
        self.out = w.Output()
        self.last_report: str | None = None

        self.start = w.Dropdown(description="Start from", style={"description_width": "initial"},
                                layout=w.Layout(width="34rem"))
        self._quiet = False
        self.start.observe(self._on_start, names="value")
        self.name = w.Text(description="Scenario name", placeholder="e.g. Target 10 lakh, 60 % allowance, 2×",
                           style={"description_width": "initial"}, layout=w.Layout(width="34rem"))
        self.note = w.Text(description="Note (optional)", style={"description_width": "initial"},
                           layout=w.Layout(width="34rem"))
        self.save_btn = w.Button(description="Save scenario", icon="save")
        self.build_btn = w.Button(description="Save and build report", button_style="primary", icon="file")
        self.save_btn.on_click(lambda _: self.save())
        self.build_btn.on_click(lambda _: self.save(build=True))

        sections = []
        for g in self.schema["groups"]:
            rows = [w.HTML(f"<h3 style='margin:1.2rem 0 0.3rem'>{html.escape(g['title'])}</h3>")]
            for p in g["parameters"]:
                rows += self._field(p)
            sections.append(w.VBox(rows))
        intro = w.HTML(
            "<p style='max-width:46rem'>Evaluation parameters for the committee report. "
            f"Leave a box empty for <em>{NOT_SET}</em>: chapters that need that value say so instead of guessing. "
            "Saved scenarios are kept in the <code>Scenarios</code> tab of the response sheet; saving under an existing "
            "name keeps the earlier version too. The report names the scenario it used.</p>")
        self.widget = w.VBox([intro, self.start, *sections,
                              w.HTML("<h3 style='margin:1.2rem 0 0.3rem'>Save</h3>"), self.name, self.note,
                              w.HBox([self.save_btn, self.build_btn]), self.out])
        self._quiet = True
        self._refresh_names()
        self._quiet = False
        self._load(pm.DEFAULTS_NAME)

    # -- fields -------------------------------------------------------------

    def _field(self, p: dict) -> list[w.Widget]:
        title = html.escape(pm.label(p)) + (" <span style='color:#b00'>*</span>" if p.get("required") else "")
        if p["type"] == "table":
            cols = ", ".join(c["id"] for c in p["columns"])
            box = w.Textarea(placeholder=f"{cols}\n(one queue per line)", layout=w.Layout(width="46rem", height="9rem"))
            col_help = "; ".join(f"<code>{c['id']}</code>: {html.escape(c['help'])}" for c in p["columns"] if c.get("help"))
            help_html = f"{html.escape(p.get('help', ''))}<br>Columns: <code>{cols}</code>." + (f" {col_help}." if col_help else "")
        else:
            box = w.Text(placeholder=NOT_SET, layout=w.Layout(width="14rem"))
            help_html = html.escape(p.get("help", ""))
        self.inputs[p["id"]] = box
        return [w.HTML(f"<div style='margin-top:0.6rem'><strong>{title}</strong></div>"), box,
                w.HTML(f"<div style='color:#555;font-size:0.85em;max-width:46rem'>{help_html}</div>")]

    def _set_values(self, values: dict):
        for p in pm.parameters(self.schema):
            v = values.get(p["id"])
            self.inputs[p["id"]].value = pm.table_to_text(p, v) if p["type"] == "table" else _fmt(v)

    def values(self) -> dict:
        return {pid: box.value for pid, box in self.inputs.items()}

    # -- scenarios ----------------------------------------------------------

    def _refresh_names(self):
        try:
            names = self.store.names()
        except Exception as e:  # sheet not reachable: the form still works from the defaults
            names = []
            with self.out:
                print(f"Could not read saved scenarios: {e}")
        self.start.options = [pm.DEFAULTS_NAME] + names

    def _on_start(self, change):
        if not self._quiet and change["new"] is not None:
            self._load(change["new"])

    def _load(self, name: str):
        if name == pm.DEFAULTS_NAME:
            self._set_values(pm.defaults(self.schema))
            self.name.value, self.note.value = "", ""
            return
        sc = self.store.get(name)
        self._set_values({**pm.defaults(self.schema), **sc["values"]})
        self.name.value, self.note.value = sc["name"], sc.get("note", "")

    def save(self, build: bool = False):
        self.out.clear_output()
        with self.out:
            try:
                sc = self.store.save(self.schema, self.name.value, self.values(), self.note.value)
            except ValueError as e:
                print("Not saved:\n  - " + str(e).replace(". ", ".\n  - "))
                return None
            print(f"Saved scenario “{sc['name']}” ({sc['saved_at'].replace('T', ' ')}).")
            self._quiet = True        # keep the boxes as entered while the list updates
            self._refresh_names()
            self.start.value = sc["name"]
            self._quiet = False
            if build:
                self.last_report = self.build(sc)
            return sc

    def build(self, scenario: dict) -> str:
        import committee_report as cr
        cfg = pm.apply(self.base_cfg, self.schema, scenario)
        path = f"committee_report_{_slug(scenario['name'])}.html"
        print("Building the report ...")
        with open(path, "w", encoding="utf-8") as f:
            f.write(cr.build(self.dfs, cfg))
        missing = [p["label"] for p in pm.parameters(self.schema) if pm.param(cfg, p["id"]) is None]
        print(f"Wrote {path}." + (f" Not yet decided: {', '.join(missing)}." if missing else ""))
        if self.download:
            try:
                from google.colab import files  # type: ignore
                files.download(path)
            except ModuleNotFoundError:
                pass
        return path


def show(dfs: dict, cfg: dict, source: str, **kw) -> ParameterForm:
    """Display the form in the notebook and return it."""
    from IPython.display import display
    form = ParameterForm(dfs, cfg, source, **kw)
    display(form.widget)
    return form
