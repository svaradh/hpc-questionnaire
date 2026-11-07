"""
committee_report.py
-------------------
Builds the committee report: one self-contained HTML file (charts embedded),
organised by the committee's priorities. Open it in any browser; use the
browser's Print -> Save as PDF to circulate it.

    python analysis/committee_report.py                        # synthetic test data
    python analysis/committee_report.py path/to/csv_folder -o report.html
    # in Colab: notebook 07_committee_report

Chapters
    1  About this report (sources, coverage, how to read the numbers)
    2  Usage patterns and issues on the present clusters        priority (a)
    3  Queue design and turnaround                              priority (b)  in preparation
    4  Standard and premium queues and charges                  priorities (c), (d)  in preparation
    5  Requirements that may call for expansion                 priority (e)
    Appendices: terms, settings used, how missing answers are handled

The report shows totals only: no group's name or submission ID appears in it.
Every table states how many groups and entries it rests on. The computations
are in hpc_analysis.py; the reasoning behind them in docs/analysis-framework.md.
Nothing here scores, ranks or assigns queues.

Figures come from the questionnaire ("reported"). When Slurm accounting data
become available they will be added as "recorded" figures beside them.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import html
import io
import math
import os

import matplotlib
import pandas as pd

import hpc_analysis as ha
import hpc_plots as hp
from sheets_client import load_config, load_data

TITLE = "HPC workload survey: committee report"
PARAMETER_LABELS = {
    "targetUtilisation": "Target utilisation (share of core-hours deliverable in a year)",
    "maxScratchPerUserTB": "Largest scratch area per user (TB)",
    "homeGuidePerGroupTB": "Home-area guide per group (TB)",
    "scratchPerJobTriggerFraction": "Scratch per job that opens the scratch questions (share of the smallest scratch area)",
    "scratchConcurrentTriggerFraction": "Scratch at once that opens the scratch questions (share of the smallest scratch area)",
}
DEFAULT_LABELS = {
    "jobs_year_unconstrained": "Jobs per year needed (desired)",
    "nodes": "Nodes per job",
    "mem_node_gb": "Peak memory per node",
    "cluster": "Cluster the jobs run on",
    "device": "CPU or GPU",
    "input_read_gb": "Input read per job",
    "residence_after_job": "How long scratch files stay after a job",
    "concurrent": "Jobs at the same time",
    "seq_run_h / seq_jobs": "Running time and jobs of a sequence",
    "measured scaling pairs (optional 3rd pair)": "Measured scaling runs",
    "checkpoint / scaling / evidence level": "Checkpoint, scaling, evidence level",
    "committee parameters not set": "Committee parameters not yet set",
    "share_iiserb_pct": "Share of computing done on IISER Bhopal clusters",
    "growth_3y_factor": "Expected demand in 3 years",
}
CLUSTER_NAMES = {"gargi": "Gargi", "raman": "Raman", ha.UNATTR: "Not tied to a cluster", "combined": "Combined"}


# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------

def _isnan(x) -> bool:
    return x is None or (isinstance(x, float) and math.isnan(x)) or x is pd.NA


def n(x) -> str:
    """Whole number with thousands separators."""
    return "–" if _isnan(x) else f"{x:,.0f}"


def mh(x) -> str:
    """Hours in millions (core-hours, GPU-hours)."""
    return "–" if _isnan(x) else f"{x / 1e6:,.2f} M"


def hours(x) -> str:
    if _isnan(x):
        return "–"
    return f"{x:,.1f} h" if x < 10 else f"{x:,.0f} h"


def pct(x) -> str:
    return "–" if _isnan(x) else f"{x:.0%}"


def ratio(x) -> str:
    return "–" if _isnan(x) else f"{x:,.1f}×"


def tb(x) -> str:
    return "–" if _isnan(x) else f"{x:,.1f} TB"


def plural(k: int, one: str, many: str | None = None) -> str:
    return f"{k} {one if k == 1 else (many or one + 's')}"


def esc(s) -> str:
    return html.escape(str(s))


# ---------------------------------------------------------------------------
# Document builder
# ---------------------------------------------------------------------------

CSS = """
body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0b0b0b;
       max-width: 52rem; margin: 2rem auto; padding: 0 1.2rem; line-height: 1.5; font-size: 15px; }
h1 { font-size: 1.7rem; margin-bottom: 0.2rem; }
h2 { font-size: 1.3rem; margin-top: 2.6rem; border-bottom: 2px solid #1d4f91; padding-bottom: 0.25rem; }
h3 { font-size: 1.05rem; margin-top: 1.8rem; }
.subtitle { color: #52514e; margin-top: 0; }
.question { background: #f2f6fb; border-left: 4px solid #1d4f91; padding: 0.6rem 0.9rem; margin: 1rem 0; }
.limits { background: #faf8f2; border-left: 4px solid #b8b6ad; padding: 0.6rem 0.9rem; margin: 1rem 0; }
.pending { background: #fdf6e3; border: 1px dashed #c9a227; padding: 0.8rem 1rem; margin: 1rem 0; }
.basis { color: #52514e; font-size: 0.85rem; margin-top: 0.3rem; }
table { border-collapse: collapse; margin: 0.6rem 0; font-size: 0.88rem; }
th, td { border-bottom: 1px solid #e6e4dc; padding: 0.3rem 0.6rem; text-align: right; vertical-align: top; }
th { background: #f5f4ef; font-weight: 600; }
th:first-child, td:first-child, td.text, th.text { text-align: left; }
caption { text-align: left; font-weight: 600; padding-bottom: 0.3rem; }
img { max-width: 100%; }
nav ol { padding-left: 1.4rem; }
.small { font-size: 0.85rem; color: #52514e; }
@media print {
  body { margin: 0; max-width: none; font-size: 11pt; }
  h2 { page-break-before: always; }
  h2.first { page-break-before: avoid; }
  table, figure, .question, .limits, .pending { page-break-inside: avoid; }
}
"""


TEXT_CLASS = " class='text'"


class Doc:
    def __init__(self):
        self.parts: list[str] = []

    def add(self, s: str):
        self.parts.append(s)

    def h2(self, text: str, anchor: str, first: bool = False):
        """A chapter heading; in print, each starts a new page unless `first` (no page break) is set."""
        cls = ' class="first"' if first else ""
        self.add(f'<h2 id="{anchor}"{cls}>{esc(text)}</h2>')

    def h3(self, text: str):
        self.add(f"<h3>{esc(text)}</h3>")

    def p(self, text: str):
        self.add(f"<p>{text}</p>")

    def ul(self, items: list[str]):
        self.add("<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>")

    def box(self, kind: str, title: str, body: str):
        self.add(f'<div class="{kind}"><strong>{esc(title)}</strong> {body}</div>')

    def basis(self, text: str):
        self.add(f'<p class="basis">Basis: {text}</p>')

    def table(self, df: pd.DataFrame, columns: dict, caption: str = "", formats: dict | None = None, index: bool = False):
        """columns maps column -> heading (in display order); formats maps column -> formatter."""
        formats = formats or {}
        d = df.reset_index() if index else df
        text = {c for c in columns if c not in formats and not pd.api.types.is_numeric_dtype(d[c])
                and not pd.to_numeric(d[c], errors="coerce").notna().all()}
        head = "".join(f"<th{TEXT_CLASS if c in text else ''}>{esc(h)}</th>" for c, h in columns.items())
        rows = []
        for _, r in d.iterrows():
            cells = []
            for c in columns:
                v = r[c]
                f = formats.get(c)
                cls = TEXT_CLASS if c in text else ""
                cells.append(f"<td{cls}>{esc(f(v) if f else ('–' if _isnan(v) else v))}</td>")
            rows.append("<tr>" + "".join(cells) + "</tr>")
        cap = f"<caption>{esc(caption)}</caption>" if caption else ""
        self.add(f"<table>{cap}<thead><tr>{head}</tr></thead><tbody>{''.join(rows)}</tbody></table>")

    def figure(self, fig, alt: str):
        if fig is None:
            return
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        matplotlib.pyplot.close(fig)
        data = base64.b64encode(buf.getvalue()).decode()
        self.add(f'<figure><img alt="{esc(alt)}" src="data:image/png;base64,{data}"></figure>')

    def html(self, title: str) -> str:
        return (f"<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><title>{esc(title)}</title>"
                f"<style>{CSS}</style></head><body>{''.join(self.parts)}</body></html>")


def _capacity_sentence(cl: str, demand: float, capacity: float, what: str) -> str:
    """Neutral comparison of a demand figure with deliverable capacity."""
    if _isnan(capacity) or not capacity:
        return f"{CLUSTER_NAMES.get(cl, cl)}: {what} {mh(demand)} core-hours; capacity not set."
    gap = demand - capacity
    rel = f"{demand / capacity:.0%} of deliverable capacity"
    if gap > 0:
        return f"{CLUSTER_NAMES.get(cl, cl)}: {what} {mh(demand)} core-hours, {rel}, above it by {mh(gap)}."
    return f"{CLUSTER_NAMES.get(cl, cl)}: {what} {mh(demand)} core-hours, {rel}."


# ---------------------------------------------------------------------------
# Chapters
# ---------------------------------------------------------------------------

def chapter_about(d: Doc, ctx: dict):
    dfs, cfg, cov = ctx["dfs"], ctx["cfg"], ctx["cov"]
    sub = dfs["Submissions"]
    d.h2("1. About this report", "about", first=True)
    d.p("This report summarises the answers to the HPC workload questionnaire for the HPC Users' Committee. "
        "It is organised by the committee's priorities: usage patterns and their issues on the present clusters, "
        "queue design and turnaround, standard and premium queues with their charges, and requirements that may "
        "call for expansion. It presents evidence; the committee draws the conclusions.")
    d.h3("How to read the numbers")
    u = cfg["committeeParameters"]["targetUtilisation"]
    d.ul([
        "<strong>Totals only.</strong> No group is named. Tables count groups and job entries.",
        "<strong>Nothing is scored or ranked.</strong> No figure here assigns a queue or judges a group's work.",
        "<strong>“Don't know” is never counted as zero.</strong> Entries with unknown inputs are left out of totals, "
        "and each table says how many.",
        "<strong>An entry</strong> is one code and kind of job described in Section C of the form. "
        "Each entry describes its <em>heaviest</em> job, so yearly totals built from it are upper bounds.",
        "<strong>Reported</strong> figures come from the questionnaire. <strong>Recorded</strong> figures will come "
        "from the clusters' accounting (Slurm) when available; the two will be shown side by side.",
        f"<strong>Deliverable capacity</strong> = cores × 8,760 h × target utilisation ({u:.0%}, a committee parameter). "
        "Above roughly 80 % use, queue waits grow steeply, so demand above this line is a real pressure even if it "
        "would fit at 100 %.",
        "<strong>Coverage.</strong> Only responding groups are counted, so every total is a lower bound for the institute.",
    ])
    d.h3("Sources")
    dates = pd.to_datetime(sub["submitted_at"], errors="coerce") if "submitted_at" in sub else pd.Series(dtype="datetime64[ns]")
    versions = ", ".join(sorted(sub["questionnaire_version"].dropna().unique())) if "questionnaire_version" in sub else "–"
    span = f"{dates.min():%d %b %Y} to {dates.max():%d %b %Y}" if dates.notna().any() else "–"
    src = pd.DataFrame([
        {"source": "Reported: questionnaire responses",
         "status": f"{cov['groups']} groups, {cov['workloads']} job entries; submitted {span}; form version {versions}"},
        {"source": "Recorded: cluster accounting (Slurm)",
         "status": "Not yet available" if ctx.get("records") is None else "Included"},
    ])
    d.table(src, {"source": "Source", "status": "Status"})

    d.h3("Who responded")
    g = dfs["Group"]
    dept = g["department"].map(lambda v: ha.DEPARTMENT_LABELS.get(v, v)).value_counts()
    role = g["completed_by_role"].map(lambda v: ha.ROLE_LABELS.get(v, v)).value_counts()
    d.table(dept.rename_axis("department").reset_index(name="groups"), {"department": "Department / School", "groups": "Groups"})
    d.table(role.rename_axis("role").reset_index(name="groups"), {"role": "Form completed by", "groups": "Groups"})
    su = ha.systems_used(dfs)
    d.table(su, {"system": "Systems run on in the last 3 years", "groups": "Groups", "share_of_groups": "Share of groups"},
            formats={"share_of_groups": pct})
    d.basis(f"{cov['groups']} groups. A group may name several systems.")
    es = ha.evidence_sources(ctx["wl"])
    d.table(es, {"source_label": "Where an entry's numbers come from", "entries": "Entries", "groups": "Groups"})
    d.basis(f"{cov['workloads']} job entries from {cov['groups_with_workloads']} groups. "
            "Lack of usage on the present clusters is not, by itself, evidence of lack of need: "
            "numbers from other systems, benchmarks and estimates are all valid sources.")


def chapter_patterns(d: Doc, ctx: dict):
    dfs, cfg, wl, cov = ctx["dfs"], ctx["cfg"], ctx["wl"], ctx["cov"]
    d.h2("2. Usage patterns and issues on the present clusters", "patterns")
    d.box("question", "Priority (a).", "What kinds of workload do groups run, and which problems do they meet on Gargi and Raman?")

    d.h3("2.1 How jobs are organised")
    ps = ha.pattern_summary(wl)
    d.figure(hp.barh(ps["pattern"], ps["entries"], "Job entries by pattern", "Entries", integer=True),
             "Bar chart of job entries by pattern")
    d.table(ps, {"pattern": "Pattern", "entries": "Entries", "groups": "Groups", "gpu_entries": "of which GPU",
                 "median_cores": "Middle job size (cores, CPU)", "median_walltime_h": "Middle wall time",
                 "cpu_h_used": "CPU core-hours, last 12 months", "share_of_cpu_h": "Share of core-hours"},
            formats={"median_cores": n, "median_walltime_h": hours, "cpu_h_used": mh, "share_of_cpu_h": pct})
    d.basis(f"{cov['workloads']} entries. An entry can follow several patterns and is then counted under each, "
            "so shares can add up to more than 100 %. “Middle” is the median. Core-hours count any system "
            "and use the heaviest job of each entry.")

    d.h3("2.2 Job size and wall time")
    d.p("CPU entries by the size and wall time of their heaviest job. The bands follow the present limits: "
        "24 cores is a Raman node, 128 a Gargi node, 384 the largest multi-node job on Gargi; "
        "36 h, 72 h and 168 h are the Gargi short, medium and longest queues.")
    t = ha.size_walltime_table(wl)
    d.table(t, {"size_band": "Cores per job", **{c: c for c in t.columns}}, caption="Entries", index=True)
    s = ha.size_walltime_table(wl, "share")
    d.table(s, {"size_band": "Cores per job", **{c: c for c in s.columns}},
            caption="Share of reported CPU core-hours (last 12 months)", formats={c: pct for c in s.columns}, index=True)
    d.basis(f"{int((wl['device'] != 'gpu').sum())} CPU entries; GPU entries are in Chapter 5.")

    d.h3("2.3 Problems reported")
    pr = ha.problems(dfs)
    pr = pr[~pr["problem"].isin(["no_problems_observed", "no_hpc_experience", "dont_know"])].sort_values("groups", ascending=False)
    if not pr.empty:
        d.figure(hp.barh(pr["label"], pr["share_of_groups"], "Groups reporting each problem (any system)", pct=True),
                 "Bar chart of the share of groups reporting each problem")
        d.table(pr, {"label": "Problem", "groups": "Groups (any system)", "on_gargi": "On Gargi", "on_raman": "On Raman",
                     "elsewhere_only": "Elsewhere only"}, formats={"elsewhere_only": n})
    other = ha.problems(dfs).set_index("problem")["groups"]
    d.basis(f"{cov['groups']} groups. Also reported: no problems observed ({int(other.get('no_problems_observed', 0))}), "
            f"no HPC experience yet ({int(other.get('no_hpc_experience', 0))}), don't know ({int(other.get('dont_know', 0))}). "
            "Gargi and Raman are asked about separately because their queue policies differ.")
    ce = ha.cluster_engagement(dfs)
    ce["cluster"] = ce["cluster"].map(CLUSTER_NAMES)
    d.table(ce, {"cluster": "Cluster", "faced_problems": "Faced problems", "no_problems": "No problems",
                 "not_used_or_considered": "Not used or considered", "work_kept_off_some": "Some work kept off",
                 "work_kept_off_all": "All work kept off"},
            caption="Groups by their experience of each cluster")
    d.basis("“Work kept off” counts groups whose problems on a cluster led them to run some or all of their work "
            "elsewhere, or not at all.")

    d.h3("2.4 Which patterns meet which problems")
    pp = ha.problems_by_pattern(wl)
    d.table(pp, {"problem": "Problem linked to the entry", **{c: c for c in pp.columns}}, index=True)
    d.basis("Entries, using the problems each entry was linked to in Section C. Columns are the job patterns of 2.1, "
            "shortened (“Longer than limit”: calculations longer than the wall-time limit). An entry linked to several "
            "problems, or following several patterns, counts in each.")

    d.h3("2.5 Fit with the present queues")
    qf = ha.queue_fit_summary(wl)
    d.table(qf, {"cluster": "Cluster named", **{c: c for c in qf.columns}}, index=True)
    d.basis("Entries, by whether the heaviest job (its nodes, wall time and memory) fits the limits of any present queue "
            "on the cluster named. A job that fits no queue may still be run in parts, by restarting from checkpoints; "
            "Chapter 3 will look at this.")

    tw = ha.turnaround_summary(dfs, wl, cfg)
    if not tw.empty:
        d.h3("2.6 Queue waits reported")
        d.table(tw, {"queue": "Queue", "entries": "Entries", "groups": "Groups",
                     "median_typical_wait_h": "Middle typical wait", "median_longest_wait_h": "Middle longest wait",
                     "median_expansion_factor": "Middle expansion factor"},
                formats={"median_typical_wait_h": hours, "median_longest_wait_h": hours, "median_expansion_factor": ratio})
        d.basis("Section F entries (asked only of groups reporting queue-wait or capacity problems). "
                "Expansion factor = (typical wait + wall time requested) ÷ wall time requested; 1× means no wait.")

    d.box("limits", "What these data cannot show.",
          "They are what groups report, mostly from memory, and cover responding groups only. Waits depend on "
          "load at the time, so a few entries per queue describe experience rather than measure it. "
          "Accounting records would show actual job sizes, wall times and waits.")


def chapter_pending(d: Doc, number: str, title: str, anchor: str, priority: str, question: str,
                    contents: list[str], inputs: list[str]):
    d.h2(f"{number}. {title}", anchor)
    d.box("question", priority, question)
    d.box("pending", "In preparation.", "This chapter is not yet written. It will contain:")
    d.ul(contents)
    d.p("<strong>It will need:</strong>")
    d.ul(inputs)


def chapter_expansion(d: Doc, ctx: dict):
    dfs, cfg, wl = ctx["dfs"], ctx["cfg"], ctx["wl"]
    d.h2("5. Requirements that may call for expansion", "expansion")
    d.box("question", "Priority (e).",
          "Is there more demand than the clusters can deliver, now or in three years, and are there needs the present "
          "hardware cannot meet under any queue policy?")
    d.p("Two different things can call for expansion, and they need different remedies. "
        "<strong>Volume</strong>: more core-hours than the clusters can deliver, which only more hardware, or moving work "
        "elsewhere, can meet. <strong>Capability</strong>: needs the present nodes cannot meet at all, such as more memory "
        "per node than any node has. Needs that the hardware could meet but the queue limits do not allow are a question of "
        "policy and belong to Chapter 3.")

    d.h3("5.1 CPU core-hours per year")
    co = ha.cpu_outlook(dfs, wl, cfg)
    show = co[(co["cluster"] != ha.UNATTR) | (co["used_any"] > 0)].copy()
    show["cluster"] = show["cluster"].map(CLUSTER_NAMES)
    d.figure(hp.balance(show.assign(cluster=show["cluster"]), "CPU core-hours per year",
                        {"used_iiser": "Used, IISER share", "used_any": "Used, any system",
                         "desired": "Desired", "in_3y_high": "In 3 years (from desired)"},
                        ylabel="million core-hours", scale=1e6),
             "Grouped bar chart of CPU core-hour demand against capacity per cluster")
    d.table(show, {"cluster": "Cluster", "capacity": "Deliverable capacity", "used_iiser": "Used, IISER share",
                   "used_any": "Used, any system", "desired": "Desired", "in_3y_low": "In 3 years, low",
                   "in_3y_high": "In 3 years, high"},
            formats={c: mh for c in ["capacity", "used_iiser", "used_any", "desired", "in_3y_low", "in_3y_high"]})
    comb = co.set_index("cluster").loc["combined"]
    d.ul([_capacity_sentence("combined", comb["used_any"], comb["capacity"], "used in the last 12 months (any system),"),
          _capacity_sentence("combined", comb["desired"], comb["capacity"], "desired,"),
          _capacity_sentence("combined", comb["in_3y_high"], comb["capacity"], "in 3 years (high),")]
         + [_capacity_sentence(r["cluster"], r["desired"], r["capacity"], "desired,")
            for _, r in co[co["cluster"].isin(ha.CLUSTERS)].iterrows()])
    a = co.attrs
    d.basis(f"{a['entries']} CPU entries from {a['groups']} groups; {plural(a['entries_unknown'], 'entry', 'entries')} left out for unknown "
            f"inputs. <em>Used, IISER share</em> scales each group's figures by the share of its computing done on IISER "
            f"Bhopal clusters ({plural(a['groups_share_unknown'], 'group')} did not give it and {'is' if a['groups_share_unknown'] == 1 else 'are'} not scaled). "
            f"<em>Desired</em> is what groups would run if wall time, queue wait and capacity did not limit them. "
            f"<em>In 3 years</em> multiplies used (low) and desired (high) by each group's expected growth "
            f"({plural(a['groups_growth_unknown'], 'group')} did not give it: no growth assumed). Entries naming both clusters "
            f"are split equally; entries naming neither are counted only in the combined total.")

    po = ha.people_outlook(dfs)
    wn = ha.work_not_run(dfs)
    d.h3("5.2 People and unmet work")
    d.ul([f"Group members submitting HPC jobs: {n(po['now'])} now, {n(po['in_3y'])} expected in 3 years "
          f"({po['groups']} groups gave both figures).",
          f"Planned calculations not run in the last 12 months because of queue wait or capacity: "
          f"{wn['groups']} groups gave a share; the middle answer is {n(wn['median_pct'])} %, "
          f"and {wn['groups_over_25pct']} groups put it above 25 %." if wn["groups"] else
          "No group gave a share of planned calculations not run (asked only after queue-wait or capacity problems)."])

    d.h3("5.3 GPUs")
    gb = ha.gpu_balance(wl, cfg)
    g = gb.set_index("cluster").loc["combined"]
    gl = ha.gpu_latent_demand(wl, cfg)
    via = ha.cpu_viability(wl)
    ver = ha.gpu_version_availability(wl)
    items = [f"GPU entries: {int((wl['device'] == 'gpu').sum())}. Reported GPU-hours per year: {n(g['used'])} used, "
             f"{n(g['desired'])} desired. GPU capacity is not yet set in the configuration (the Raman GPU count is to be confirmed), "
             "so no comparison with capacity is made."]
    if not gl.empty:
        items.append(f"CPU entries whose code has a GPU version already tested: {len(gl)}. Moved to GPUs, they would need "
                     f"{n(gl['gpu_node_h_low'].sum())}–{n(gl['gpu_node_h_high'].sum())} GPU node-hours a year, "
                     "from the speed-up they reported.")
    d.ul(items)
    if not via.empty:
        via.index = via.index.map(lambda v: ha.CPU_VIABLE_LABELS.get(v, v))
        d.table(via.rename_axis("answer").reset_index(name="entries"),
                {"answer": "GPU entries: could they run on CPU-only nodes?", "entries": "Entries"})
    if not ver.empty:
        ver.index = ver.index.map(lambda v: ha.GPU_VERSION_LABELS.get(v, v))
        d.table(ver.rename_axis("answer").reset_index(name="entries"),
                {"answer": "CPU entries: does a GPU version of the code exist?", "entries": "Entries"})

    d.h3("5.4 Needs beyond the present hardware")
    bh = ha.beyond_hardware(dfs, wl, cfg)
    d.table(bh, {"requirement": "Requirement", "entries": "Entries", "groups": "Groups"}, formats={"entries": n})
    d.basis("Memory and job size are compared with the nodes of the cluster each entry names (both clusters where none is named).")

    d.h3("5.5 Storage")
    hb, _ = ha.home_balance(dfs, wl, cfg)
    sb, _ = ha.scratch_balance(dfs, wl, cfg)
    hb["cluster"] = hb["cluster"].map(CLUSTER_NAMES)
    sb["cluster"] = sb["cluster"].map(CLUSTER_NAMES)
    d.table(hb, {"cluster": "Cluster", "capacity_tb": "Home capacity", "demand_now_tb": "Needed now",
                 "demand_3y_tb": "Needed in 3 years"},
            caption="Home area", formats={c: tb for c in ["capacity_tb", "demand_now_tb", "demand_3y_tb"]})
    d.table(sb, {"cluster": "Cluster", "capacity_tb": "Scratch capacity", "peak_sum_tb": "Sum of peaks",
                 "average_tb": "Time-averaged"},
            caption="Scratch", formats={c: tb for c in ["capacity_tb", "peak_sum_tb", "average_tb"]})
    frac = {c["name"]: c["storage"]["scratchFraction"] for c in cfg["clusters"]}
    d.basis("Home and scratch capacities split each cluster's usable storage by the committee's home:scratch fraction "
            f"({', '.join(f'{k} {v:.0%} scratch' for k, v in frac.items())}; a placeholder until set). "
            "Sum of peaks assumes every group's largest scratch use at once; time-averaged uses how long jobs run. "
            "Group home needs are split between clusters by each group's mix of entries.")

    d.box("limits", "What these data cannot show.",
          "Reported and desired figures are self-estimates; desired demand is an upper bound, and charges would lower it. "
          "Jobs per year count any system, and each entry describes its heaviest job, so used figures are upper bounds too. "
          "Totals cover responding groups only. Accounting records would replace the used figures with measured ones.")


def appendices(d: Doc, ctx: dict):
    cfg = ctx["cfg"]
    d.h2("Appendix A. Terms", "terms")
    d.ul([
        "<strong>Wall time</strong>: time a job runs, from start to finish, not counting time waiting in the queue.",
        "<strong>Core-hours</strong>: CPU cores × hours. A 128-core job running 10 hours uses 1,280 core-hours.",
        "<strong>Entry</strong>: one code and kind of job described in Section C of the form.",
        "<strong>Expansion factor</strong>: (queue wait + wall time) ÷ wall time. 1× means the job started at once.",
        "<strong>Deliverable capacity</strong>: cores × 8,760 h × target utilisation.",
        "<strong>Desired</strong>: what a group would run if wall time, queue wait and capacity did not limit it.",
    ])
    d.h2("Appendix B. Settings used", "settings", first=True)
    rows = [{"cluster": c["name"], "cores": c["cpuCores"], "capacity": ha.cpu_capacity_hours(cfg)[c["id"]],
             "gpus": c.get("gpuCount"), "home": c["storage"]["homeTB"], "scratch": c["storage"]["scratchTB"]}
            for c in cfg["clusters"]]
    d.table(pd.DataFrame(rows), {"cluster": "Cluster", "cores": "CPU cores", "capacity": "Deliverable core-hours / year",
                                 "gpus": "GPUs", "home": "Home", "scratch": "Scratch"},
            formats={"cores": n, "capacity": mh, "gpus": lambda x: "to be confirmed" if _isnan(x) else n(x), "home": tb, "scratch": tb})
    cp = {k: v for k, v in cfg["committeeParameters"].items() if not k.startswith("_")}
    d.table(pd.DataFrame([{"parameter": PARAMETER_LABELS.get(k, k), "value": "not yet set" if v is None else v}
                          for k, v in cp.items()]),
            {"parameter": "Committee parameter (src/config/clusters.json)", "value": "Value"})
    d.h2("Appendix C. How missing answers are handled", "missing", first=True)
    d.p("A blank, optional or “don't know” answer is given a neutral meaning: one that neither adds demand nor raises a flag. "
        "The cases are still counted as unknown in each table's basis line.")
    plain = lambda s: s.replace("give <NA>, not False", "are shown as unknown, not as no").replace("give <NA>", "are shown as unknown") \
                      .replace("unattributed pool", "not tied to a cluster").replace(" -> ", " → ")
    d.table(pd.DataFrame([{"answer": DEFAULT_LABELS.get(k, k), "meaning": plain(v)} for k, v in ha.NEUTRAL_DEFAULTS.items()]),
            {"answer": "Answer missing", "meaning": "Treated as"})


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(dfs: dict, cfg: dict, records=None) -> str:
    """The report as one HTML string. `records` will take Slurm accounting data (not yet used)."""
    matplotlib.use("Agg")
    hp.SHOW = False
    wl = ha.workloads(dfs, cfg)
    ctx = {"dfs": dfs, "cfg": cfg, "wl": wl, "cov": ha.coverage(dfs), "records": records}
    d = Doc()
    d.add(f"<h1>{esc(TITLE)}</h1><p class='subtitle'>HPC Users' Committee · generated {dt.date.today():%d %B %Y} · "
          f"{ctx['cov']['groups']} groups responded</p>")
    d.add("<nav><strong>Contents</strong><ol>"
          "<li><a href='#about'>About this report</a></li>"
          "<li><a href='#patterns'>Usage patterns and issues on the present clusters</a> (a)</li>"
          "<li><a href='#queues'>Queue design and turnaround</a> (b), in preparation</li>"
          "<li><a href='#charging'>Standard and premium queues and charges</a> (c, d), in preparation</li>"
          "<li><a href='#expansion'>Requirements that may call for expansion</a> (e)</li>"
          "</ol><p class='small'>Appendices: <a href='#terms'>terms</a> · <a href='#settings'>settings used</a> · "
          "<a href='#missing'>missing answers</a></p></nav>")
    chapter_about(d, ctx)
    chapter_patterns(d, ctx)
    chapter_pending(
        d, "3", "Queue design and turnaround", "queues", "Priority (b).",
        "How could queues and fair-share be arranged for faster turnaround across the workloads described?",
        ["Each workload's fit under the present queue table and under candidate tables the committee drafts "
         "(share of entries and of core-hours that fit each).",
         "Long jobs by checkpoint/restart and by how they scale: whether they could run in parts, or wider, "
         "instead of longer.",
         "Throughput: wanted concurrency against per-user limits, and how long a year of each workload takes at those limits.",
         "Debug and interactive use against the debug queues.",
         "How usage is spread across groups, for fair-share design."],
        ["Candidate queue tables from the committee (added to clusters.json).",
         "Cluster accounting (Slurm) for actual waits and usage per group: the survey can show fit, but not predict waits."])
    chapter_pending(
        d, "4", "Standard and premium queues and charges", "charging", "Priorities (c) and (d).",
        "What standard and premium charges would meet the annual target, given a free annual allowance for a share of groups?",
        ["Typical annual usage of standard and premium queues, as estimated from the survey.",
         "The standard rate needed to meet the target, for the allowance and premium multiple the committee chooses, "
         "shown as a range (which groups receive the allowance, how far usage falls when charged).",
         "Interest in premium services and the charge multiples groups would accept (Section H).",
         "Totals of the annual budgets groups could plan for (Section H), against estimated charges. Totals only."],
        ["The annual target, the share of groups receiving the allowance, its size and the premium multiple, from the committee.",
         "Section H answers (the form's Charging tab).",
         "Cluster accounting and billing records, since the survey overstates yearly usage."])
    chapter_expansion(d, ctx)
    appendices(d, ctx)
    return d.html(TITLE)


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data", nargs="?", default=os.path.join(here, "fixtures", "synthetic_v3"),
                    help="folder of <Tab>.csv files, or a Spreadsheet ID (in Colab)")
    ap.add_argument("-o", "--output", default="committee_report.html")
    args = ap.parse_args()
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(build(load_data(args.data), load_config()))
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
