"""
hpc_plots.py
------------
Small, consistent matplotlib charts for the committee notebooks.

Colours follow a validated categorical order (colour-blind-safe for adjacent
series); charts use thin bars, light grids and text in neutral ink, never in
series colours. Every chart is accompanied by its table in the notebooks.
"""

from __future__ import annotations

import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
import numpy as np
import pandas as pd

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
NEUTRAL = "#b8b6ad"        # capacity / reference marks
TEXT = "#0b0b0b"
TEXT_2 = "#52514e"
GRID = "#e6e4dc"

plt.rcParams.update({
    "figure.dpi": 110, "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": TEXT_2,
    "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlecolor": TEXT, "axes.titlelocation": "left",
    "xtick.color": TEXT_2, "ytick.color": TEXT_2, "axes.spines.top": False, "axes.spines.right": False,
    "legend.frameon": False,
})


# Notebooks show each chart as it is drawn; the committee report sets SHOW = False and embeds the returned figure.
SHOW = True


def _done(fig):
    if SHOW:
        plt.show()      # returns nothing, so a notebook does not display the chart a second time
        return None
    return fig


def _grid(ax, axis="x"):
    ax.grid(axis=axis, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def pie(labels, values, title: str, max_slices: int = 7):
    """Pie of shares; slices beyond `max_slices` fold into 'Other'. Labels carry the counts."""
    s = pd.Series(np.asarray(values, dtype=float), index=list(labels)).sort_values(ascending=False)
    if len(s) > max_slices:
        s = pd.concat([s.iloc[:max_slices - 1], pd.Series({"Other": s.iloc[max_slices - 1:].sum()})])
    fig, ax = plt.subplots(figsize=(7, 4.6))
    wedges, _ = ax.pie(s.values, colors=SERIES[:len(s)], startangle=90, counterclock=False,
                       wedgeprops={"linewidth": 2, "edgecolor": "white"})
    total = s.sum()
    ax.legend(wedges, [f"{k} — {v:g} ({v / total:.0%})" for k, v in s.items()],
              loc="center left", bbox_to_anchor=(1.0, 0.5), labelcolor=TEXT)
    ax.set_title(title)
    ax.axis("equal")
    plt.tight_layout()
    return _done(fig)


def barh(labels, values, title: str, xlabel: str = "", pct: bool = False, color: str = SERIES[0], integer: bool = False):
    """Horizontal bars in the order given (first on top), value labels at the bar ends."""
    s = pd.Series(np.asarray(values, dtype=float), index=list(labels)).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 0.42 * len(s) + 1.2))
    ax.barh(s.index, s.values, color=color, height=0.6)
    for i, v in enumerate(s.values):
        ax.text(v, i, f" {v:.0%}" if pct else f" {v:g}", va="center", color=TEXT_2, fontsize=9)
    if pct:
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:.0%}"))
    if integer:
        ax.xaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_xlabel(xlabel)
    ax.set_title(title)
    _grid(ax)
    plt.tight_layout()
    return _done(fig)


def balance(df: pd.DataFrame, title: str, measures: dict, capacity_col: str = "capacity",
            ylabel: str = "", scale: float = 1.0):
    """
    Grouped bars per cluster: demand measures (series colours) next to
    capacity (neutral). `measures` maps column -> legend label. A measure given
    as a range (columns <m>_low and <m>_high, see hpc_analysis.cluster_ranges)
    is drawn as a solid bar to its low value with a hatched part up to its high
    value: work that could go to either cluster.
    """
    d = df.set_index("cluster")
    cols = [capacity_col] + list(measures)
    names = ["Capacity"] + list(measures.values())
    colors = [NEUTRAL] + SERIES[:len(measures)]
    x = np.arange(len(d))
    width = 0.8 / len(cols)
    fig, ax = plt.subplots(figsize=(8.5, 4))
    hatched = False
    for i, (c, n, col) in enumerate(zip(cols, names, colors)):
        xs = x + (i - (len(cols) - 1) / 2) * width
        if c in d:
            lo = hi = pd.to_numeric(d[c], errors="coerce").values / scale
        else:
            lo = pd.to_numeric(d[f"{c}_low"], errors="coerce").values / scale
            hi = pd.to_numeric(d[f"{c}_high"], errors="coerce").values / scale
        ax.bar(xs, np.nan_to_num(lo), width * 0.92, label=n, color=col)
        extra = np.nan_to_num(hi - lo)
        if (extra > 0).any():
            hatched = True
            ax.bar(xs, extra, width * 0.92, bottom=np.nan_to_num(lo), color=col, alpha=0.35, hatch="///", edgecolor=col, linewidth=0)
        for xi, v in zip(xs, lo):
            if np.isnan(v):
                ax.text(xi, 0, "n/a", ha="center", va="bottom", color=TEXT_2, fontsize=8)
    if hatched:
        ax.bar([np.nan], [np.nan], color="white", hatch="///", edgecolor=TEXT_2, label="Could go to either cluster")
    ax.set_xticks(x, d.index)
    ax.set_ylabel(ylabel)
    ax.legend(ncols=min(len(cols) + hatched, 4), loc="lower left", bbox_to_anchor=(0, 1.02))
    ax.set_title(title, pad=28 if len(cols) + hatched <= 4 else 44)
    _grid(ax, "y")
    plt.tight_layout()
    return _done(fig)


def counts(series: pd.Series, title: str, xlabel: str = "Workloads", order: list | None = None):
    """Bar chart of category counts (a split): largest on top, or in the given order."""
    s = series.value_counts()
    if order:
        s = s.reindex([o for o in order if o in s.index])
    return barh(s.index, s.values, title, xlabel, integer=True)


def paired(df: pd.DataFrame, label_col: str, a: str, b: str, a_label: str, b_label: str, title: str, xlabel: str):
    """Two values per row (e.g. wanted vs allowed cores) as paired horizontal bars."""
    d = df.iloc[::-1]
    y = np.arange(len(d))
    fig, ax = plt.subplots(figsize=(8, 0.6 * len(d) + 1.4))
    ax.barh(y + 0.2, pd.to_numeric(d[a], errors="coerce"), 0.38, color=SERIES[0], label=a_label)
    ax.barh(y - 0.2, pd.to_numeric(d[b], errors="coerce"), 0.38, color=NEUTRAL, label=b_label)
    ax.set_yticks(y, d[label_col])
    ax.set_xlabel(xlabel)
    ax.set_title(title)
    ax.legend(ncols=2, loc="lower left", bbox_to_anchor=(0, 1.02))
    ax.set_title(title, pad=28)
    _grid(ax)
    plt.tight_layout()
    return _done(fig)
