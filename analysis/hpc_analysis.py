"""
hpc_analysis.py
---------------
Computations behind the committee notebooks (schema 2.0.0 responses).
The principles they implement are in docs/analysis-framework.md.

Everything here produces *evidence tables*. Nothing scores, ranks or assigns
queues; flags are candidates for the committee to look at.

Conventions
- num() turns a column into numbers; 'dont_know' and blanks become NaN.
  NaN is never treated as 0: totals report how many inputs were unknown.
- Hours per year = 8,760.
- Demand on a cluster: W_cluster 'gargi' / 'raman' -> that cluster, 'both' ->
  split 50:50, anything else -> the 'unattributed' pool. GPU workloads go to
  Raman (the only GPUs).
- "used" demand = jobs in the last 12 months; "desired" = jobs the group would
  run if limits did not bind (falls back to "used" when not given).

Typical use
    from sheets_client import load_data, load_config
    import hpc_analysis as ha
    dfs, cfg = load_data(SOURCE), load_config()
    wl = ha.workloads(dfs, cfg)
    ha.cpu_balance(wl, cfg)
"""

from __future__ import annotations

import json
import math
import os
import re

import numpy as np
import pandas as pd

from sheets_client import explode_semicolons, split_semicolons

HOURS_PER_YEAR = 8760
CLUSTERS = ["gargi", "raman"]
UNATTR = "unattributed"

PROBLEM_LABELS = {
    "wall_time_termination": "Jobs stopped by wall-time limit",
    "excessive_queue_wait": "Long queue waits",
    "insufficient_node_count": "Needed more nodes/cores than allowed",
    "insufficient_memory": "Out of memory",
    "insufficient_gpu_access": "Insufficient GPU access",
    "insufficient_total_capacity": "Not enough total capacity",
    "scratch_insufficient": "Insufficient scratch",
    "debug_wait": "Debug jobs wait too long",
    "other": "Other",
    "no_problems_observed": "No problems observed",
    "no_hpc_experience": "No HPC experience yet",
    "dont_know": "Don't know",
}

# Ratio of new/old wall time when the cores (or GPUs) are doubled.
DOUBLING_RATIO = {"le_0_6": 0.6, "0_6_0_8": 0.7, "gt_0_8": 0.9, "longer": 1.1}
# GPU-node vs CPU-node speed-up bins -> (low, high) multipliers
SPEEDUP_RANGE = {"lt_2": (1.0, 2.0), "2_5": (2.0, 5.0), "5_20": (5.0, 20.0), "gt_20": (20.0, 50.0)}
# Scratch residence after a job, in hours (bin -> representative value)
RESIDENCE_H = {"none": 0, "lt_1d": 12, "1_7d": 96, "gt_7d": 240}


# ---------------------------------------------------------------------------
# Basic helpers
# ---------------------------------------------------------------------------

def num(s: pd.Series) -> pd.Series:
    """Numbers from a column; 'dont_know', blanks and text -> NaN."""
    return pd.to_numeric(s.replace({"dont_know": np.nan, "": np.nan}), errors="coerce")


def is_unknown(s: pd.Series) -> pd.Series:
    return s.astype(str).str.strip().isin(["dont_know"])


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df else pd.Series([""] * len(df), index=df.index, dtype=object)


def norm_code(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def load_capabilities(path: str | None = None) -> dict:
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "code_capabilities.json")
    if not os.path.exists(path):
        return {"restart_supported": [], "aliases": {}}
    with open(path) as f:
        return json.load(f)


def restart_supported(code: str, caps: dict) -> bool:
    n = norm_code(code)
    n = caps.get("aliases", {}).get(n, n)
    return any(n == k or n.startswith(k) for k in caps.get("restart_supported", []))


def coverage(dfs: dict) -> dict:
    """How many groups / workloads the numbers below rest on."""
    sub = dfs["Submissions"]
    wl = dfs["Workloads"]
    return {"groups": len(sub), "workloads": len(wl),
            "groups_with_workloads": wl["submission_id"].nunique() if not wl.empty else 0}


def fmt(x, unit: str = "", digits: int = 0) -> str:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "n/a"
    for div, suf in ((1e9, "G"), (1e6, "M"), (1e3, "k")):
        if abs(x) >= div:
            return f"{x / div:.{max(digits, 1)}f}{suf}{unit}"
    return f"{x:.{digits}f}{unit}"


# ---------------------------------------------------------------------------
# Cluster configuration helpers
# ---------------------------------------------------------------------------

def cluster(cfg: dict, cid: str) -> dict:
    return next(c for c in cfg["clusters"] if c["id"] == cid)


def cores_per_node(cfg: dict, cid: str, node_type: str = "compute") -> int:
    c = cluster(cfg, cid)
    if node_type == "gpu" and c.get("gpuNodes"):
        return c["gpuNodes"][0]["coresPerNode"]
    return next(n["coresPerNode"] for n in c["nodeTypes"] if n["id"] == node_type)


def standard_memory_gb(cfg: dict, cid: str) -> float:
    return next(n["memoryGB"] for n in cluster(cfg, cid)["nodeTypes"] if n["id"] == "compute")


def _queue_kind(q: dict) -> str:
    return q.get("nodeType", "compute")


def eligible_queues(cfg: dict, cid: str, device: str, mem_gb: float | None = None, include_debug: bool = False) -> list[dict]:
    """Production queues a job could use on a cluster, given CPU/GPU and memory per node."""
    qs = []
    std = standard_memory_gb(cfg, cid)
    for q in cluster(cfg, cid)["queues"]:
        kind = _queue_kind(q)
        if q["id"] == "debug" and not include_debug:
            continue
        if device == "gpu":
            if kind != "gpu":
                continue
        else:
            if kind == "gpu":
                continue
            needs_highmem = mem_gb is not None and not math.isnan(mem_gb) and mem_gb > std
            if needs_highmem != (kind == "highmem"):
                continue
        qs.append({**q, "cluster": cid})
    return qs


def candidate_clusters(cluster_raw: str, device: str) -> list[str]:
    if device == "gpu":
        return ["raman"]
    if cluster_raw in CLUSTERS:
        return [cluster_raw]
    return list(CLUSTERS)


def fit_queue(cfg: dict, cluster_raw: str, device: str, nodes: float, walltime_h: float, mem_gb: float | None) -> dict | None:
    """The shortest-wall-time queue the job fits in (nodes and wall time), or None."""
    if pd.isna(nodes) or pd.isna(walltime_h):
        return None
    fits = []
    for cid in candidate_clusters(cluster_raw, device):
        for q in eligible_queues(cfg, cid, device, mem_gb, include_debug=walltime_h <= 0.5):
            if q["minNodes"] <= nodes <= q["maxNodes"] and walltime_h <= q["walltimeHours"]:
                fits.append(q)
    return min(fits, key=lambda q: q["walltimeHours"]) if fits else None


def walltime_limit(cfg: dict, cluster_raw: str, device: str, nodes: float, mem_gb: float | None) -> float | None:
    """Longest wall time any queue allows for this node count (most generous candidate cluster)."""
    if pd.isna(nodes):
        nodes = 1
    lims = [q["walltimeHours"] for cid in candidate_clusters(cluster_raw, device)
            for q in eligible_queues(cfg, cid, device, mem_gb) if q["minNodes"] <= nodes <= q["maxNodes"]]
    return max(lims) if lims else None


def max_cores_per_job(cfg: dict, cid: str) -> int:
    """Largest CPU job policy allows on a cluster (production queues)."""
    cpn = cores_per_node(cfg, cid)
    return max(q["maxNodes"] * cpn for q in eligible_queues(cfg, cid, "cpu"))


def max_concurrent_cores(cfg: dict, cid: str) -> int:
    """Largest number of cores one user can hold at once within a single CPU queue."""
    cpn = cores_per_node(cfg, cid)
    return max(q["maxNodes"] * cpn * q["maxConcurrentJobs"] for q in eligible_queues(cfg, cid, "cpu"))


def cpu_capacity_hours(cfg: dict) -> dict:
    u = cfg["committeeParameters"]["targetUtilisation"]
    return {c["id"]: c["cpuCores"] * HOURS_PER_YEAR * u for c in cfg["clusters"]}


def gpu_capacity_hours(cfg: dict) -> dict:
    u = cfg["committeeParameters"]["targetUtilisation"]
    return {c["id"]: (c["gpuCount"] * HOURS_PER_YEAR * u if c.get("gpuCount") is not None else None) for c in cfg["clusters"]}


# ---------------------------------------------------------------------------
# The enriched workload table
# ---------------------------------------------------------------------------

def _scaling_ratio(row: pd.Series) -> float:
    """Per-doubling wall-time ratio from measured pairs (first vs last), else NaN."""
    pts = []
    for i in (1, 2, 3):
        c = row.get(f"_c{i}")
        t = row.get(f"_t{i}")
        if pd.notna(c) and pd.notna(t) and c > 0 and t > 0:
            pts.append((c, t))
    if len(pts) < 2:
        return np.nan
    pts.sort()
    (c1, t1), (c2, t2) = pts[0], pts[-1]
    if c2 <= c1:
        return np.nan
    return (t2 / t1) ** (1 / math.log2(c2 / c1))


def workloads(dfs: dict, cfg: dict, caps: dict | None = None) -> pd.DataFrame:
    """
    One row per workload, numbers parsed, with demand, cluster attribution,
    long-job / checkpoint / scaling information joined from the follow-ups,
    queue fit and policy comparisons.
    """
    caps = caps or load_capabilities()
    w = dfs["Workloads"].copy()
    if w.empty:
        return w
    for c in ["nodes", "cores", "gpus", "mem_node_gb", "walltime_h", "scratch_write_gb", "jobs_year",
              "jobs_year_unconstrained", "concurrent", "long_total_h", "campaign_cores", "campaign_gpus",
              "campaign_duration_h", "campaigns_year", "evidence_level"]:
        w[c] = num(_col(w, c))
    w["device"] = _col(w, "device").replace("", "unknown")
    w["cluster"] = _col(w, "cluster").replace("", "unknown")
    w["org"] = split_semicolons(_col(w, "organisation"))

    # Nodes: given, else estimated from cores and the cluster's node size
    def _nodes(r):
        if pd.notna(r["nodes"]):
            return r["nodes"]
        if pd.isna(r["cores"]):
            return np.nan
        cid = candidate_clusters(r["cluster"], r["device"])[0]
        return math.ceil(r["cores"] / cores_per_node(cfg, cid, "gpu" if r["device"] == "gpu" else "compute"))
    w["nodes_est"] = w.apply(_nodes, axis=1)

    jobs_des = w["jobs_year_unconstrained"].fillna(w["jobs_year"])
    cpu = w["device"] != "gpu"
    w["cpu_h_used"] = np.where(cpu, w["cores"] * w["walltime_h"] * w["jobs_year"], 0.0)
    w["cpu_h_desired"] = np.where(cpu, w["cores"] * w["walltime_h"] * jobs_des, 0.0)
    w.loc[cpu & (w["cores"].isna() | w["walltime_h"].isna() | w["jobs_year"].isna()), "cpu_h_used"] = np.nan
    w.loc[cpu & (w["cores"].isna() | w["walltime_h"].isna() | jobs_des.isna()), "cpu_h_desired"] = np.nan
    gpu = w["device"] == "gpu"
    w["gpu_h_used"] = np.where(gpu, w["gpus"] * w["walltime_h"] * w["jobs_year"], 0.0)
    w["gpu_h_desired"] = np.where(gpu, w["gpus"] * w["walltime_h"] * jobs_des, 0.0)
    w.loc[gpu & (w["gpus"].isna() | w["walltime_h"].isna() | w["jobs_year"].isna()), "gpu_h_used"] = np.nan
    w.loc[gpu & (w["gpus"].isna() | w["walltime_h"].isna() | jobs_des.isna()), "gpu_h_desired"] = np.nan
    # Little's law: time-averaged number of running jobs
    w["avg_running"] = (jobs_des * w["walltime_h"] / HOURS_PER_YEAR)

    # Cluster attribution weights
    def _weights(r):
        if r["device"] == "gpu":
            return pd.Series({"w_gargi": 0.0, "w_raman": 1.0, "w_unattr": 0.0})
        return pd.Series({"gargi": {"w_gargi": 1.0, "w_raman": 0.0, "w_unattr": 0.0},
                          "raman": {"w_gargi": 0.0, "w_raman": 1.0, "w_unattr": 0.0},
                          "both": {"w_gargi": 0.5, "w_raman": 0.5, "w_unattr": 0.0}}
                         .get(r["cluster"], {"w_gargi": 0.0, "w_raman": 0.0, "w_unattr": 1.0}))
    w = pd.concat([w, w.apply(_weights, axis=1)], axis=1)

    # Join follow-ups on (submission, workload name)
    key = ["submission_id", "code"]
    lj = dfs["LongJobs"].rename(columns={"workload": "code"}) if not dfs["LongJobs"].empty else pd.DataFrame(columns=key)
    if not lj.empty:
        lj = lj.assign(longest_run_h=num(_col(lj, "longest_run_h")))
        lj = lj.groupby(key, as_index=False).agg(longest_run_h=("longest_run_h", "max"),
                                                 checkpoint=("checkpoint", "first"),
                                                 l_doubling=("doubling_effect", "first"),
                                                 terminations_12m=("terminations_12m", "first"))
    sc = dfs["Scaling"].rename(columns={"workload": "code"}) if not dfs["Scaling"].empty else pd.DataFrame(columns=key)
    if not sc.empty:
        over_gpu = _col(sc, "scale_over") == "gpu"
        for i in (1, 2, 3):
            sc[f"_c{i}"] = np.where(over_gpu, num(_col(sc, f"gpus_{i}")), num(_col(sc, f"cores_{i}")))
            sc[f"_t{i}"] = num(_col(sc, f"walltime_{i}_h"))
        sc["measured_ratio"] = sc.apply(_scaling_ratio, axis=1)
        sc["max_cores_useful"] = num(_col(sc, "max_cores_useful"))
        sc = sc.groupby(key, as_index=False).agg(measured_ratio=("measured_ratio", "first"),
                                                 p_doubling=("doubling_effect", "first"),
                                                 max_cores_useful=("max_cores_useful", "max"))
    w = w.merge(lj, on=key, how="left") if not lj.empty else w.assign(longest_run_h=np.nan, checkpoint="", l_doubling="", terminations_12m="")
    w = w.merge(sc, on=key, how="left") if not sc.empty else w.assign(measured_ratio=np.nan, p_doubling="", max_cores_useful=np.nan)
    for c in ("checkpoint", "l_doubling", "p_doubling"):
        w[c] = w[c].fillna("")

    # Scaling: measured pairs first, then the reported doubling effect
    def _ratio(r):
        if pd.notna(r["measured_ratio"]):
            return r["measured_ratio"], "measured"
        for c in ("p_doubling", "l_doubling"):
            if r[c] in DOUBLING_RATIO:
                return DOUBLING_RATIO[r[c]], "reported"
        return np.nan, "unknown"
    rs = w.apply(lambda r: pd.Series(_ratio(r), index=["doubling_ratio", "scaling_source"]), axis=1)
    w[["doubling_ratio", "scaling_source"]] = rs
    w["scaling_class"] = np.select([w["doubling_ratio"] <= 0.8, w["doubling_ratio"] > 0.8], ["high", "low"], default="unknown")

    # Long-job requirement
    w["time_needed_h"] = w[["walltime_h", "long_total_h", "longest_run_h"]].max(axis=1)
    w["walltime_limit_h"] = w.apply(lambda r: walltime_limit(cfg, r["cluster"], r["device"], r["nodes_est"], r["mem_node_gb"]), axis=1)
    over = w["time_needed_h"] > w["walltime_limit_h"].astype(float)
    w["long_job"] = over.fillna(False) | w["org"].apply(lambda o: "long_calc" in o) | w["longest_run_h"].notna()

    def _ckpt(r):
        c = r["checkpoint"]
        if c == "yes":
            return "checkpoint available"
        if c == "no":
            return "no checkpoint"
        return "unknown — code supports restart" if restart_supported(r["code"], caps) else "unknown"
    w["checkpoint_class"] = w.apply(_ckpt, axis=1)

    # Queue fit and throughput under per-user concurrency limits
    def _fit(r):
        q = fit_queue(cfg, r["cluster"], r["device"], r["nodes_est"], r["walltime_h"], r["mem_node_gb"])
        return pd.Series({"queue": f"{q['cluster']}.{q['id']}" if q else "none fits",
                          "queue_max_concurrent": q["maxConcurrentJobs"] if q else np.nan})
    w = pd.concat([w, w.apply(_fit, axis=1)], axis=1)
    w["years_to_finish"] = (jobs_des * w["walltime_h"]) / (w["queue_max_concurrent"] * HOURS_PER_YEAR)

    # Policy comparison for CPU jobs: largest job allowed vs wanted
    def _cap(r):
        if r["device"] == "gpu":
            return np.nan
        return max(max_cores_per_job(cfg, cid) for cid in candidate_clusters(r["cluster"], "cpu"))
    w["policy_max_cores"] = w.apply(_cap, axis=1)
    w["wanted_cores"] = w[["cores", "max_cores_useful"]].max(axis=1)
    return w


# ---------------------------------------------------------------------------
# 1. Problems
# ---------------------------------------------------------------------------

def problems(dfs: dict) -> pd.DataFrame:
    """Problem mentions and share of groups reporting each (multi-select)."""
    exp = dfs["Experience"]
    n = len(exp)
    counts = explode_semicolons(exp, "problems").value_counts()
    out = pd.DataFrame({"problem": counts.index, "groups": counts.values})
    out["label"] = out["problem"].map(PROBLEM_LABELS).fillna(out["problem"])
    out["share_of_groups"] = out["groups"] / n if n else np.nan
    out["share_of_mentions"] = out["groups"] / out["groups"].sum() if len(out) else np.nan
    return out.reset_index(drop=True)


def problems_where(dfs: dict) -> pd.Series:
    """Where reported problems occurred (groups per system)."""
    return explode_semicolons(dfs["Experience"], "problems_where").value_counts()


# ---------------------------------------------------------------------------
# 2. CPU-hour and GPU-hour balance
# ---------------------------------------------------------------------------

def _attributed(wl: pd.DataFrame, col: str) -> dict:
    vals = wl[col]
    return {"gargi": (vals * wl["w_gargi"]).sum(), "raman": (vals * wl["w_raman"]).sum(), UNATTR: (vals * wl["w_unattr"]).sum()}


def cpu_balance(wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """CPU core-hours per year: used and desired demand vs deliverable capacity, per cluster and combined."""
    cap = cpu_capacity_hours(cfg)
    cpu = wl[wl["device"] != "gpu"]
    used, des = _attributed(cpu, "cpu_h_used"), _attributed(cpu, "cpu_h_desired")
    unknown = int(cpu["cpu_h_desired"].isna().sum())
    rows = []
    for cid in CLUSTERS + [UNATTR]:
        rows.append({"cluster": cid, "capacity": cap.get(cid, np.nan), "used": used[cid], "desired": des[cid]})
    rows.append({"cluster": "combined", "capacity": sum(cap.values()), "used": sum(used.values()), "desired": sum(des.values())})
    out = pd.DataFrame(rows)
    out["deficit_used"] = out["used"] - out["capacity"]
    out["deficit_desired"] = out["desired"] - out["capacity"]
    out.attrs["workloads_with_unknown_inputs"] = unknown
    return out


def deficit_summary(df: pd.DataFrame, demand: str, capacity: str, unit: str, label: str) -> str:
    """One sentence per cluster: demand vs capacity, as a shortfall or headroom."""
    lines = []
    for _, r in df.iterrows():
        d, c = r[demand], pd.to_numeric(r[capacity], errors="coerce")
        if r["cluster"] == UNATTR:
            if d and not pd.isna(d):
                lines.append(f"Unattributed ({label}): {fmt(d, unit, 1)} — not tied to a cluster; included in 'combined'.")
            continue
        if pd.isna(c):
            lines.append(f"{r['cluster'].title()} ({label}): demand {fmt(d, unit, 1)}; capacity not set in clusters.json.")
            continue
        gap = d - c
        word = "SHORTFALL" if gap > 0 else "headroom"
        lines.append(f"{r['cluster'].title()} ({label}): demand {fmt(d, unit, 1)} vs capacity {fmt(c, unit, 1)} "
                     f"-> {word} of {fmt(abs(gap), unit, 1)} ({abs(gap) / c:.0%} of capacity)" if c else
                     f"{r['cluster'].title()} ({label}): demand {fmt(d, unit, 1)}; no capacity.")
    return "\n".join(lines)


def gpu_balance(wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """GPU-hours per year: demand vs capacity (capacity n/a while GPU counts are not set)."""
    cap = gpu_capacity_hours(cfg)
    g = wl[wl["device"] == "gpu"]
    used, des = _attributed(g, "gpu_h_used"), _attributed(g, "gpu_h_desired")
    rows = [{"cluster": cid, "capacity": cap.get(cid), "used": used[cid], "desired": des[cid]} for cid in CLUSTERS + [UNATTR]]
    caps_known = [v for v in cap.values() if v is not None]
    rows.append({"cluster": "combined", "capacity": sum(caps_known) if len(caps_known) == len(cap) else None,
                 "used": sum(used.values()), "desired": sum(des.values())})
    out = pd.DataFrame(rows)
    out["deficit_desired"] = out["desired"] - pd.to_numeric(out["capacity"], errors="coerce")
    out.attrs["workloads_with_unknown_inputs"] = int(g["gpu_h_desired"].isna().sum())
    return out


def gpu_latent_demand(wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """
    CPU workloads whose code has a tested GPU version: GPU node-hours per year
    they would need if moved to GPUs (range from the speed-up bin), and the
    CPU core-hours that would be freed.
    """
    cand = wl[(wl["device"] != "gpu") & wl["gpu_speedup"].isin(SPEEDUP_RANGE.keys())].copy()
    if cand.empty:
        return cand
    cpn = cand["cluster"].map(lambda c: cores_per_node(cfg, c) if c in CLUSTERS else cores_per_node(cfg, "gargi"))
    cpu_node_h = cand["cpu_h_desired"] / cpn
    lo = cand["gpu_speedup"].map(lambda b: SPEEDUP_RANGE[b][0])
    hi = cand["gpu_speedup"].map(lambda b: SPEEDUP_RANGE[b][1])
    cand["gpu_node_h_low"] = cpu_node_h / hi
    cand["gpu_node_h_high"] = cpu_node_h / lo
    return cand[["submission_id", "code", "gpu_version", "gpu_speedup", "cpu_h_desired", "gpu_node_h_low", "gpu_node_h_high"]]


def cpu_viability(wl: pd.DataFrame) -> pd.Series:
    """For GPU workloads: could they run on CPU-only nodes?"""
    return wl.loc[wl["device"] == "gpu", "cpu_viable"].replace("", "not answered").value_counts()


def gpu_version_availability(wl: pd.DataFrame) -> pd.Series:
    """For CPU workloads: does a GPU version of the code exist?"""
    return wl.loc[wl["device"] != "gpu", "gpu_version"].replace("", "not answered").value_counts()


# ---------------------------------------------------------------------------
# 3. Storage
# ---------------------------------------------------------------------------

def _group_weights(wl: pd.DataFrame) -> pd.DataFrame:
    """Each group's cluster split for group-level home storage: its workloads' attributions, averaged."""
    g = wl.groupby("submission_id")[["w_gargi", "w_raman", "w_unattr"]].sum()
    return g.div(g.sum(axis=1), axis=0)


def home_balance(dfs: dict, wl: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Home-area working space: demand now and in 3 years vs the home share of
    each cluster. Returns (per-cluster table, per-group table with flags).
    Group demand is attributed to clusters by the group's workload mix.
    """
    st = dfs["StorageTesting"].copy()
    st["home_now_gb"] = num(_col(st, "home_now_gb"))
    st["home_3y_gb"] = num(_col(st, "home_3y_gb"))
    wts = _group_weights(wl) if not wl.empty else pd.DataFrame()
    st = st.merge(wts, left_on="submission_id", right_index=True, how="left")
    st[["w_gargi", "w_raman"]] = st[["w_gargi", "w_raman"]].fillna(0)
    st["w_unattr"] = st["w_unattr"].fillna(1)
    rows = []
    for cid, wcol in (("gargi", "w_gargi"), ("raman", "w_raman"), (UNATTR, "w_unattr")):
        cap = cluster(cfg, cid)["storage"]["homeTB"] if cid in CLUSTERS else np.nan
        rows.append({"cluster": cid, "capacity_tb": cap,
                     "demand_now_tb": (st["home_now_gb"] * st[wcol]).sum() / 1024,
                     "demand_3y_tb": (st["home_3y_gb"] * st[wcol]).sum() / 1024})
    out = pd.DataFrame(rows)
    out.loc[len(out)] = {"cluster": "combined", "capacity_tb": out["capacity_tb"].sum(),
                         "demand_now_tb": out["demand_now_tb"].sum(), "demand_3y_tb": out["demand_3y_tb"].sum()}
    out["deficit_now_tb"] = out["demand_now_tb"] - out["capacity_tb"]
    out["deficit_3y_tb"] = out["demand_3y_tb"] - out["capacity_tb"]
    out.attrs["groups_unknown"] = int(st["home_now_gb"].isna().sum())

    guide = cfg["committeeParameters"].get("homeGuidePerGroupTB")
    per = st[["submission_id", "pi_name", "home_now_gb", "home_3y_gb", "output_stay"]].copy()
    per["over_guide"] = (per["home_now_gb"] / 1024 > guide) if guide else False
    per["outputs_kept_over_3_months"] = per["output_stay"] == "gt_3m"
    return out, per.sort_values("home_now_gb", ascending=False)


def scratch_balance(dfs: dict, wl: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Scratch demand per cluster in two forms:
      peak    = files written per job x largest number of concurrent jobs (worst case, all groups at once)
      average = files written per job x time-averaged running jobs, including residence after the job
    Returns (per-cluster table, per-workload table with flags).
    """
    t = wl.copy()
    sc = dfs["Scratch"].rename(columns={"workload": "code"})
    if not sc.empty:
        sc = sc.assign(residence_h=sc["residence_after_job"].map(RESIDENCE_H))
        t = t.merge(sc[["submission_id", "code", "residence_h", "io_time_share", "rereads_own_output", "local_disk_possible"]],
                    on=["submission_id", "code"], how="left")
    else:
        t["residence_h"] = np.nan
    jobs_des = t["jobs_year_unconstrained"].fillna(t["jobs_year"])
    occupancy = jobs_des * (t["walltime_h"] + t["residence_h"].fillna(0)) / HOURS_PER_YEAR
    t["scratch_peak_gb"] = t["scratch_write_gb"] * t["concurrent"]
    t["scratch_avg_gb"] = t["scratch_write_gb"] * np.minimum(occupancy, t["concurrent"].fillna(np.inf))
    rows = []
    for cid, wcol in (("gargi", "w_gargi"), ("raman", "w_raman"), (UNATTR, "w_unattr")):
        cap = cluster(cfg, cid)["storage"]["scratchTB"] if cid in CLUSTERS else np.nan
        rows.append({"cluster": cid, "capacity_tb": cap,
                     "peak_sum_tb": (t["scratch_peak_gb"] * t[wcol]).sum() / 1024,
                     "average_tb": (t["scratch_avg_gb"] * t[wcol]).sum() / 1024})
    out = pd.DataFrame(rows)
    out.loc[len(out)] = {"cluster": "combined", "capacity_tb": out["capacity_tb"].sum(),
                         "peak_sum_tb": out["peak_sum_tb"].sum(), "average_tb": out["average_tb"].sum()}
    out["deficit_peak_tb"] = out["peak_sum_tb"] - out["capacity_tb"]
    out["deficit_average_tb"] = out["average_tb"] - out["capacity_tb"]

    cap_user = cfg["committeeParameters"].get("maxScratchPerUserTB")
    per = t[["submission_id", "pi_name", "code", "cluster", "scratch_write_gb", "concurrent", "scratch_peak_gb", "scratch_avg_gb"]].copy()
    per["over_trigger"] = per["scratch_peak_gb"] > cfg["thresholds"]["scratchConcurrentTriggerGB"]
    per["over_user_cap"] = (per["scratch_peak_gb"] / 1024 > cap_user) if cap_user else False
    return out, per.sort_values("scratch_peak_gb", ascending=False)


# ---------------------------------------------------------------------------
# 4. Long jobs: checkpoint and scaling splits
# ---------------------------------------------------------------------------

def long_jobs(wl: pd.DataFrame) -> pd.DataFrame:
    """Workloads with a long-job requirement, with checkpoint and scaling classes and the suggested test."""
    lj = wl[wl["long_job"]].copy()
    if lj.empty:
        return lj

    def _scaling_split(r):
        if r["checkpoint_class"] == "checkpoint available":
            return "excluded (checkpoint available)"
        return {"high": "high-scaling: could run wider instead of longer",
                "low": "low-scaling: needs time, not nodes"}.get(r["scaling_class"], "scaling unknown")
    lj["scaling_split"] = lj.apply(_scaling_split, axis=1)
    lj["long_walltime_test"] = ((lj["time_needed_h"] > lj["walltime_limit_h"].astype(float))
                                & (lj["checkpoint_class"] == "no checkpoint")
                                & (lj["scaling_class"] != "high")
                                & (lj["evidence_level"] <= 3))
    return lj[["submission_id", "pi_name", "code", "device", "cluster", "nodes_est", "cores", "walltime_h", "time_needed_h",
               "walltime_limit_h", "checkpoint_class", "scaling_class", "doubling_ratio", "scaling_source",
               "scaling_split", "evidence_level", "long_walltime_test"]]


# ---------------------------------------------------------------------------
# 5. Parallel and throughput: requirement vs policy
# ---------------------------------------------------------------------------

def high_scalers(wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """
    CPU workloads that scale (wall time <= 0.8x per doubling): cores wanted vs
    the largest job policy allows, and the estimated wall time at each size,
    plus campaign cores vs what one user can hold at once.
    """
    h = wl[(wl["device"] != "gpu") & (wl["scaling_class"] == "high")].copy()
    if h.empty:
        return h

    def _t_at(r, cores):
        if pd.isna(r["walltime_h"]) or pd.isna(r["cores"]) or pd.isna(cores) or r["cores"] <= 0:
            return np.nan
        return r["walltime_h"] * r["doubling_ratio"] ** math.log2(cores / r["cores"])
    h["walltime_at_policy_max_h"] = h.apply(lambda r: _t_at(r, r["policy_max_cores"]), axis=1)
    h["walltime_at_wanted_h"] = h.apply(lambda r: _t_at(r, r["wanted_cores"]), axis=1)
    h["multi_node_limit_h"] = h.apply(lambda r: walltime_limit(cfg, r["cluster"], "cpu", 2, r["mem_node_gb"]), axis=1)
    h["held_back_by_job_size"] = h["wanted_cores"] > h["policy_max_cores"]
    h["user_concurrent_core_ceiling"] = h["cluster"].map(
        lambda c: max(max_concurrent_cores(cfg, cid) for cid in candidate_clusters(c, "cpu")))
    h["campaign_over_ceiling"] = h["campaign_cores"] > h["user_concurrent_core_ceiling"]
    return h[["submission_id", "pi_name", "code", "cluster", "cores", "walltime_h", "doubling_ratio", "scaling_source",
              "wanted_cores", "policy_max_cores", "walltime_at_policy_max_h", "walltime_at_wanted_h", "multi_node_limit_h",
              "held_back_by_job_size", "campaign_cores", "user_concurrent_core_ceiling", "campaign_over_ceiling"]]


def throughput(wl: pd.DataFrame) -> pd.DataFrame:
    """
    Low/intermediate scalers (and workloads with unknown scaling): which queue
    the typical job fits, wanted concurrency vs the per-user limit, and how long
    a year of the workload would take at that limit.
    """
    t = wl[wl["scaling_class"] != "high"].copy()
    if t.empty:
        return t
    t["concurrency_gap"] = t["concurrent"] - t["queue_max_concurrent"]
    t["throttled"] = (t["years_to_finish"] > 0.5) | (t["concurrency_gap"] > 0)
    return t[["submission_id", "pi_name", "code", "device", "cluster", "nodes_est", "cores", "gpus", "walltime_h",
              "jobs_year", "jobs_year_unconstrained", "concurrent", "queue", "queue_max_concurrent",
              "concurrency_gap", "years_to_finish", "throttled"]]


def queue_waits(dfs: dict, wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Queue-wait entries with the requested resources (from the typical job when so stated) and expansion factor."""
    q = dfs["Queue"].copy()
    if q.empty:
        return q
    for c in ("req_nodes", "req_cores", "req_gpus", "req_walltime_h", "typical_wait_h", "longest_wait_h"):
        q[c] = num(_col(q, c))
    typ = wl.set_index(["submission_id", "code"])[["nodes_est", "cores", "gpus", "walltime_h"]]
    def _fill(r):
        if r.get("same_as_typical_job") == "yes" and (r["submission_id"], r["workload"]) in typ.index:
            t = typ.loc[(r["submission_id"], r["workload"])]
            return pd.Series({"req_nodes": t["nodes_est"], "req_cores": t["cores"], "req_gpus": t["gpus"], "req_walltime_h": t["walltime_h"]})
        return r[["req_nodes", "req_cores", "req_gpus", "req_walltime_h"]]
    q[["req_nodes", "req_cores", "req_gpus", "req_walltime_h"]] = q.apply(_fill, axis=1)
    q["expansion_factor"] = (q["typical_wait_h"] + q["req_walltime_h"]) / q["req_walltime_h"]
    return q[["submission_id", "pi_name", "queue", "other_system", "workload", "req_nodes", "req_cores", "req_gpus",
              "req_walltime_h", "typical_wait_h", "longest_wait_h", "expansion_factor"]]


def debug_demand(dfs: dict, cfg: dict) -> pd.DataFrame:
    """Debug/interactive sessions vs the debug queues (30 min; up to 2 Gargi or 4 Raman nodes)."""
    st = dfs["StorageTesting"]
    d = st[st["uses_debug"] == "yes"].copy()
    if d.empty:
        return d
    for c in ("sessions_week", "session_cores", "session_gpus", "session_length_h"):
        d[c] = num(_col(d, c))
    debug_h = max(q["walltimeHours"] for c in cfg["clusters"] for q in c["queues"] if q["id"] == "debug")
    d["longer_than_debug_queue"] = d["session_length_h"] > debug_h
    d["core_hours_week"] = d["sessions_week"] * d["session_cores"] * d["session_length_h"]
    return d[["submission_id", "pi_name", "sessions_week", "session_device", "session_cores", "session_gpus",
              "session_length_h", "purpose", "longer_than_debug_queue", "core_hours_week"]]


# ---------------------------------------------------------------------------
# 6. Triage candidates (CLAUDE.md §8) — suggestions for the committee
# ---------------------------------------------------------------------------

FOLLOW_UP_FOR_PROBLEM = {
    "wall_time_termination": ("LongJobs", "NA_long_jobs", "long_jobs"),
    "insufficient_node_count": ("Scaling", "NA_scaling", "scaling"),
    "insufficient_memory": ("Memory", "NA_memory", "memory"),
    "insufficient_gpu_access": ("Gpu", "NA_gpu", "gpu"),
    "scratch_insufficient": ("Scratch", "NA_scratch", "scratch"),
    "excessive_queue_wait": ("Queue", "NA_queue", "queue"),
}


def triage(dfs: dict, wl: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """
    Per submission: reasons a follow-up may help (category 2: clarification)
    or a deeper technical look is warranted (category 3). Category 1 = no flags.
    Suggestions only; the committee assigns categories.
    """
    caps = load_capabilities()
    exp = dfs["Experience"].set_index("submission_id")
    reasons: dict[str, list[tuple[int, str]]] = {s: [] for s in dfs["Submissions"]["submission_id"]}
    add = lambda sid, cat, msg: reasons.setdefault(sid, []).append((cat, msg))

    for sid in reasons:
        probs = split_semicolons(pd.Series([exp.loc[sid, "problems"] if sid in exp.index else ""]))[0]
        not_aware = split_semicolons(pd.Series([exp.loc[sid, "not_aware_sections"] if sid in exp.index else ""]))[0]
        for na in not_aware:
            add(sid, 2, f"declared 'not aware' for {na.replace('_', ' ')}")
        for p in probs:
            if p in FOLLOW_UP_FOR_PROBLEM:
                tab, _, topic = FOLLOW_UP_FOR_PROBLEM[p]
                t = dfs[tab]
                if topic not in not_aware and (t.empty or (t["submission_id"] == sid).sum() == 0):
                    add(sid, 2, f"reported '{PROBLEM_LABELS[p]}' but gave no {topic.replace('_', ' ')} details")
        if (wl.empty or (wl["submission_id"] == sid).sum() == 0) and "no_hpc_experience" not in probs:
            add(sid, 2, "no workloads described")

    names = set(zip(wl["submission_id"], wl["code"])) if not wl.empty else set()
    for tab in ("LongJobs", "Scaling", "Memory", "Gpu", "Scratch", "Queue"):
        t = dfs[tab]
        if t.empty or "workload" not in t:
            continue
        for _, r in t.iterrows():
            if r["workload"] and (r["submission_id"], r["workload"]) not in names:
                add(r["submission_id"], 2, f"{tab} entry refers to '{r['workload']}', not in the workload list")

    for _, r in wl.iterrows():
        sid, code = r["submission_id"], r["code"]
        missing = [c for c in ("cores", "walltime_h", "jobs_year") if pd.isna(r[c])]
        if missing:
            add(sid, 2, f"{code}: unknown {', '.join(m.replace('_h', '') for m in missing)}")
        if r["long_job"] and r["checkpoint_class"] == "unknown — code supports restart":
            add(sid, 2, f"{code}: checkpoint status unknown, but the code supports restart (support / awareness)")
        if r["long_job"] and r["scaling_class"] == "unknown" and r["checkpoint_class"] != "checkpoint available":
            add(sid, 2, f"{code}: long jobs, scaling never tested")
        if (r["long_job"] and r["checkpoint_class"] == "no checkpoint" and r["scaling_class"] != "high"
                and pd.notna(r["walltime_limit_h"]) and r["time_needed_h"] > r["walltime_limit_h"]):
            add(sid, 3, f"{code}: long-wall-time candidate ({fmt(r['time_needed_h'])} h needed vs {fmt(r['walltime_limit_h'])} h)")
        if r["device"] != "gpu" and r["scaling_class"] == "high" and r["wanted_cores"] > r["policy_max_cores"]:
            add(sid, 3, f"{code}: capability candidate ({fmt(r['wanted_cores'])} cores useful vs {fmt(r['policy_max_cores'])} allowed)")
        if pd.notna(r["mem_node_gb"]) and r["mem_node_gb"] > cfg["thresholds"]["largestStandardNodeMemoryGB"]:
            add(sid, 3, f"{code}: {r['mem_node_gb'] / 1024:.1f} TB per node exceeds standard nodes")
        if r["device"] == "gpu" and r.get("cpu_viable") == "no":
            add(sid, 3, f"{code}: GPU-only workload ({fmt(r['gpu_h_desired'])} GPU-h/yr wanted)")
        peak = r["scratch_write_gb"] * r["concurrent"]
        if pd.notna(peak) and peak > cfg["thresholds"]["scratchConcurrentTriggerGB"]:
            add(sid, 3, f"{code}: {peak / 1024:.1f} TB peak concurrent scratch")

    sub = dfs["Submissions"].set_index("submission_id")
    rows = []
    for sid, rs in reasons.items():
        cat = max([c for c, _ in rs], default=1)
        rows.append({"submission_id": sid, "pi_name": sub.loc[sid, "pi_name"] if sid in sub.index else "",
                     "suggested_category": cat, "n_flags": len(rs),
                     "reasons": "\n".join(f"[{c}] {m}" for c, m in sorted(rs, key=lambda x: -x[0]))})
    return pd.DataFrame(rows).sort_values(["suggested_category", "n_flags"], ascending=False).reset_index(drop=True)
