"""
Builds the committee notebooks (00–06) from the cell lists below, so that
their shared set-up stays identical. Run after editing:

    python analysis/_build_notebooks.py

Notebook cells only call hpc_analysis / hpc_plots; the computations live
there, and the reasoning behind them in docs/analysis-framework.md.
"""

import os
import nbformat as nbf

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMEWORK = "https://github.com/svaradh/hpc-questionnaire/blob/main/docs/analysis-framework.md"

SETUP = '''SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE'   # <- the long string in the sheet URL
REPO_REF = 'main'                                   # git branch/tag for the helper code and cluster config

import os, urllib.request
if not os.path.exists('hpc_analysis.py'):            # in Colab: fetch the helper modules once per session
    for f in ['sheets_client.py', 'hpc_analysis.py', 'hpc_plots.py', 'code_capabilities.json']:
        urllib.request.urlretrieve(f'https://raw.githubusercontent.com/svaradh/hpc-questionnaire/{REPO_REF}/analysis/{f}', f)

import pandas as pd
from sheets_client import load_data, load_config
import hpc_analysis as ha
import hpc_plots as hp
pd.set_option('display.max_colwidth', 120)

dfs = load_data(SPREADSHEET_ID)
cfg = load_config(ref=REPO_REF)
wl = ha.workloads(dfs, cfg)
cov = ha.coverage(dfs)
print(f"{cov['groups']} groups responded; {cov['workloads']} workloads described "
      f"({cov['groups_with_workloads']} groups with at least one).")'''


def md(s):
    return nbf.v4.new_markdown_cell(s.strip())


def code(s):
    return nbf.v4.new_code_cell(s.strip())


def intro(title, purpose, principles):
    return md(f"""# {title}

{purpose}

*Principles: {principles} in the [analysis framework]({FRAMEWORK}). Nothing here scores or ranks groups; flags are candidates for the committee to look at. Totals cover responding groups only, and "Don't know" is never counted as zero; a yes/no flag shown as `<NA>` means its inputs are unknown. Only the respondents' answers and the cluster configuration are used — nothing depends on which code a workload runs.*

**To run:** paste the Spreadsheet ID in the first code cell, then *Runtime → Run all*. Colab asks once per session to sign in with your IISER Google account.""")


NOTEBOOKS = {
    "00_setup.ipynb": [
        md("""# 00 — Setup and data check

Run this first in a new Colab session. It connects to the response sheet, loads the cluster configuration
(`src/config/clusters.json`, including the committee parameters), and shows what was loaded.

**You need:** Viewer access to the response sheet, and its Spreadsheet ID (the long string in the sheet URL between `/d/` and `/edit`)."""),
        code("%pip install -q gspread pandas matplotlib"),
        code(SETUP),
        md("## Tabs loaded"),
        code("from sheets_client import summarise_sheets\nsummarise_sheets(dfs)"),
        md("""## Cluster configuration and committee parameters

Capacity figures in the other notebooks are computed from these. `None` means *not yet set by the committee*;
analyses that need such a value say so instead of guessing."""),
        code("""rows = [{'cluster': c['name'], 'CPU cores': c['cpuCores'], 'GPUs': c['gpuCount'],
         'home TB': c['storage']['homeTB'], 'scratch TB': c['storage']['scratchTB'],
         'scratch fraction': c['storage']['scratchFraction']} for c in cfg['clusters']]
display(pd.DataFrame(rows))
pd.Series(cfg['committeeParameters']).drop('_comment', errors='ignore')"""),
        md("## Submissions"),
        code("dfs['Submissions'][['submission_id', 'pi_name', 'group_name', 'department', 'submitted_at', 'questionnaire_version']]"),
    ],

    "01_overview.ipynb": [
        intro("01 — Overview: who responded and what goes wrong",
              "Response coverage, the problems groups report (and on which systems), and the mix of workloads.", "P1, P12"),
        code(SETUP),
        md("""## Problems reported

The pie shows how the problem *reports* divide among problem types (a group can report several).
The bar chart below it gives the share of *groups* reporting each problem, which is the figure to quote."""),
        code("""pr = ha.problems(dfs)
issues = pr[~pr['problem'].isin(['no_problems_observed', 'no_hpc_experience', 'dont_know'])]
hp.pie(issues['label'], issues['groups'], 'Problem reports by type')
hp.barh(pr['label'], pr['share_of_groups'], 'Share of groups reporting each problem', pct=True)
pr"""),
        md("""## Problems faced on Gargi and on Raman

Each problem reported above was asked about again for Gargi and for Raman separately (their hardware and policies
differ; Gargi is newer and its policies are still settling). `elsewhere_only` = reported, but faced on neither — context
from other systems. In the cluster table, `work_kept_off_some` / `work_kept_off_all` count groups whose problems on that
cluster kept some, or all, of their work off it (run elsewhere or not at all): demand displaced by limits or policy."""),
        code("""on = pr[pr['on_gargi'] + pr['on_raman'] > 0]
if len(on):
    hp.paired(on, 'label', 'on_gargi', 'on_raman', 'Gargi', 'Raman', 'Groups facing each problem, by cluster', 'Groups')
display(ha.cluster_engagement(dfs))
pr[['label', 'groups', 'on_gargi', 'on_raman', 'elsewhere_only']]"""),
        md("## Systems used and share of computing done at IISER Bhopal"),
        code("""from sheets_client import explode_semicolons
su = explode_semicolons(dfs['Experience'], 'systems_used').value_counts()
hp.barh(su.index, su.values, 'Systems groups ran jobs on (last 3 years)', 'Groups', integer=True)
ha.num(dfs['Experience']['share_iiserb_pct']).describe()"""),
        md("## Workload mix"),
        code("""ty = explode_semicolons(dfs['Workloads'], 'type').value_counts()
hp.barh(ty.index, ty.values, 'Workloads by type of computation', 'Workloads', integer=True)
display(wl.groupby(['device', 'cluster']).size().rename('workloads').reset_index())
hp.counts(wl['evidence_level'].map(lambda v: f'Level {v:.0f}' if v == v else 'unknown'), 'Evidence level of workload numbers (1 = direct observation)')"""),
        md("## Group size and growth"),
        code("""g = dfs['Group'].assign(now=lambda d: ha.num(d['hpc_users_now']), in_3y=lambda d: ha.num(d['hpc_users_3y']))
print(f"Users now: {g['now'].sum():.0f} ({g['now'].isna().sum()} unknown); in 3 years: {g['in_3y'].sum():.0f} ({g['in_3y'].isna().sum()} unknown)")
ha.num(dfs['Closing']['growth_3y_factor']).describe()"""),
    ],

    "02_compute_capacity.ipynb": [
        intro("02 — Compute capacity: CPU-hour and GPU-hour balance",
              """Is there a *volume* shortfall? Demand is computed per workload as cores × wall time × jobs per year,
attributed to the cluster the group named ("Both" splits 50:50; "Not decided"/"Don't know" go to *unattributed*).
Capacity = cores × 8,760 h × the committee's target utilisation. **Deficit = demand − capacity** (positive = shortfall).
*Used* = last 12 months; *desired* = what groups would run if limits did not bind (an upper bound).""",
              "P2, P7, P9, P12"),
        code(SETUP),
        md("## CPU core-hours per year"),
        code("""cpu = ha.cpu_balance(wl, cfg)
hp.balance(cpu, 'CPU core-hours per year: demand vs deliverable capacity',
           {'used': 'Used (12 months)', 'desired': 'Desired (unconstrained)'}, ylabel='Million core-hours', scale=1e6)
print(ha.deficit_summary(cpu, 'used', 'capacity', ' core-h', 'used'))
print(ha.deficit_summary(cpu, 'desired', 'capacity', ' core-h', 'desired'))
print(f"Workloads with unknown inputs (not in the totals): {cpu.attrs['workloads_with_unknown_inputs']}")
cpu.round(0)"""),
        md("Largest contributors to desired CPU demand (to see whether a deficit is broad or concentrated):"),
        code("wl[wl['device'] != 'gpu'].nlargest(10, 'cpu_h_desired')[['pi_name', 'entry', 'cluster', 'cores', 'walltime_h', 'jobs_year', 'jobs_year_unconstrained', 'cpu_h_used', 'cpu_h_desired']]"),
        md("""## GPU-hours per year

GPU capacity stays *n/a* until the Raman GPU node's GPU count is entered in `clusters.json`; demand is shown regardless."""),
        code("""gpu = ha.gpu_balance(wl, cfg)
hp.balance(gpu, 'GPU-hours per year: demand vs capacity', {'used': 'Used (12 months)', 'desired': 'Desired (unconstrained)'}, ylabel='GPU-hours')
print(ha.deficit_summary(gpu, 'desired', 'capacity', ' GPU-h', 'desired'))
gpu"""),
        md("""## GPU:CPU balance

- **Latent GPU demand**: CPU workloads whose code has a *tested* GPU version. If moved to GPUs they would need roughly the GPU node-hours shown (a range from the reported speed-up bin), freeing their CPU core-hours.
- **CPU viability of GPU workloads**: whether GPU work could fall back to CPU nodes.
- **GPU versions of CPU codes**: how much CPU work could become GPU work."""),
        code("""display(ha.gpu_latent_demand(wl, cfg))
hp.counts(wl.loc[wl['device'] == 'gpu', 'cpu_viable'].replace('', 'not answered'), 'GPU workloads: could they run on CPU-only nodes?')
hp.counts(wl.loc[wl['device'] != 'gpu', 'gpu_version'].replace('', 'not answered'), 'CPU workloads: does a GPU version of the code exist?')"""),
    ],

    "03_storage.ipynb": [
        intro("03 — Storage: home and scratch",
              """**Home** is working space (run inputs, checkpoints, parameters, own codes, outputs awaiting transfer); a group's
need is attributed to clusters by its workload mix. **Scratch** demand is shown two ways: the *sum of peaks*
(every group's largest concurrent use at once — the worst case) and the *time-averaged* load (jobs per year ×
(wall time + residence after the job) / 8,760 h). Capacities come from each cluster's usable storage and the
committee's home:scratch split.""",
              "P8, P12"),
        code(SETUP),
        md("## Home area"),
        code("""home, home_groups = ha.home_balance(dfs, wl, cfg)
hp.balance(home, 'Home-area working space (TB)', {'demand_now_tb': 'Needed now', 'demand_3y_tb': 'Needed in 3 years'},
           capacity_col='capacity_tb', ylabel='TB')
print(ha.deficit_summary(home, 'demand_now_tb', 'capacity_tb', ' TB', 'now'))
print(ha.deficit_summary(home, 'demand_3y_tb', 'capacity_tb', ' TB', 'in 3 years'))
print(f"Groups with unknown home need: {home.attrs['groups_unknown']}")
home.round(2)"""),
        md("""Per group, largest first. `over_guide` uses the committee's home guide per group (not set = `<NA>`);
`outputs_kept_over_3_months` marks groups whose final outputs stay on the cluster for more than 3 months before transfer."""),
        code("home_groups.assign(home_now_tb=lambda d: d['home_now_gb'] / 1024).round(2)"),
        md("## Scratch"),
        code("""scr, scr_wl = ha.scratch_balance(dfs, wl, cfg)
hp.balance(scr, 'Scratch (TB)', {'peak_sum_tb': 'Sum of peaks (worst case)', 'average_tb': 'Time-averaged'},
           capacity_col='capacity_tb', ylabel='TB')
print(ha.deficit_summary(scr, 'peak_sum_tb', 'capacity_tb', ' TB', 'sum of peaks'))
print(ha.deficit_summary(scr, 'average_tb', 'capacity_tb', ' TB', 'time-averaged'))
scr.round(2)"""),
        md("""Per workload, largest peak first. `over_trigger` = peak concurrent scratch above the follow-up trigger;
`over_user_cap` uses the committee's largest-area-per-user (not set = `<NA>`). Both use the peak *with inputs*
(files read + written), the case where only scratch is on the fast parallel file system; the cluster table counts
inputs only for clusters with `storage.scratchOnlyOnFastPFS` set. The Section D "Files and scratch" details (I/O share,
re-reads, local-disk option) tell whether a large need is write-heavy enough to justify scratch."""),
        code("""display(scr_wl.assign(peak_tb=lambda d: d['scratch_peak_gb'] / 1024).round(2).head(15))
dfs['Scratch']"""),
    ],

    "04_long_jobs.ipynb": [
        intro("04 — Long jobs: checkpointing and scaling",
              """Workloads with a long-job requirement: their needed run time exceeds what any queue allows for that job shape,
they were described as *one calculation longer than a job may run*, or they answered the *Long runs* panel (Section D).
The remedies are considered in order: **checkpoint/restart → run wider → longer wall time**.""",
              "P3, P4"),
        code(SETUP),
        code("""lj = ha.long_jobs(wl)
print(f'{len(lj)} workloads with a long-job requirement')
lj"""),
        md("""## Split 1 — checkpointing

- *checkpoint available*: the requirement can usually be met by chaining jobs.
- *no checkpoint*: a candidate genuine requirement (see split 2).
- *unknown*: not tested or not known — possibly **an awareness gap**, best met with support rather than policy. Whether the code itself can restart is for the committee to check by hand."""),
        code("hp.counts(lj['checkpoint_class'], 'Long-job workloads by checkpoint status')"),
        md("""## Split 2 — scaling (excluding workloads that can checkpoint)

- *high-scaling* (wall time ≤ 0.8× when the cores are doubled): the work could run **wider instead of longer** — the limit that binds is node count, not wall time (see notebook 05).
- *low-scaling*: more nodes do not help — **time, not nodes**, is the need.
- *scaling unknown*: never tested; a scaling test is the next step."""),
        code("hp.counts(lj['scaling_split'], 'Long-job workloads by scaling (checkpoint cases excluded)')"),
        md("""## Suggested long-wall-time test

Needed run time > applicable limit **and** no checkpoint **and** not high-scaling **and** evidence level ≤ 3
(see section 4 of the framework). Workloads meeting it are candidates for a long-wall-time service; the committee decides.
`<NA>` = a part of the test is unknown (e.g. checkpoint not tested, evidence source not given): a follow-up, not a failed test."""),
        code("""display(lj[lj['long_walltime_test'].fillna(False)])
print('Test undecided (inputs unknown):')
lj[lj['long_walltime_test'].isna()]"""),
    ],

    "05_parallel_and_throughput.ipynb": [
        intro("05 — Requirement vs policy: high scalers, throughput and turnaround",
              """**High scalers** (wall time ≤ 0.8× per doubling of cores) are where the clusters' parallel hardware can give
the most benefit. Here, *requirement vs reality* means the cores they can usefully use against the largest job the
queues allow, and the estimated wall time at each size.

**Low and intermediate scalers** are limited by turnaround, per-user concurrency and queue limits. Here, *requirement
vs reality* means the queue their typical job fits, the concurrency they want against the per-user limit, and how long a
year of their work would take at that limit.""",
              "P4, P5, P6"),
        code(SETUP),
        md("## High scalers: cores wanted vs the largest job allowed"),
        code("""hs = ha.high_scalers(wl, cfg)
if len(hs):
    hp.paired(hs.assign(label=hs['pi_name'] + ' · ' + hs['entry']), 'label', 'wanted_cores', 'policy_max_cores',
              'Cores usefully used', 'Largest job allowed', 'High scalers: useful job size vs policy', 'CPU cores')
hs.round(1)"""),
        md("""`walltime_at_policy_max_h` estimates the wall time if the job is capped at the largest allowed size (from the measured or
reported scaling); compare it with `multi_node_limit_h` (72 h for multi-node jobs). `campaign_over_ceiling` marks
coordinated campaigns needing more cores at once than one user can hold in any single queue."""),
        md("## Low and intermediate scalers: queue fit, concurrency and time to finish a year's work"),
        code("""tp = ha.throughput(wl)
hp.counts(tp['queue'], 'Typical job: the queue it fits ("none fits" = no queue allows this shape; "unknown" = size or wall time not given)')
tp.round(2)"""),
        md("""`years_to_finish` = (jobs per year × wall time) / (per-user job limit of that queue × 8,760 h): above ~0.5, the
per-user limit, not the hardware, paces the work. `concurrency_gap` = jobs wanted at once − jobs allowed at once."""),
        code("""thr = tp.dropna(subset=['years_to_finish']).sort_values('years_to_finish', ascending=False)
if len(thr):
    hp.barh(thr['pi_name'] + ' · ' + thr['entry'], thr['years_to_finish'].round(2), 'Years to finish one year of work at the per-user job limit', 'Years')"""),
        md("""## Queue waits

Each entry records the queue and the resources requested. *Expansion factor* = (typical wait + requested wall time) /
requested wall time; requested wall time stands in for run time, so this slightly understates it."""),
        code("""qw = ha.queue_waits(dfs, wl, cfg)
qw.round(2)"""),
        md("## Debug and interactive use vs the 30-minute debug queues"),
        code("ha.debug_demand(dfs, cfg).round(2)"),
    ],

    "06_triage.ipynb": [
        intro("06 — Triage candidates and data quality",
              """Suggested categories (CLAUDE.md §8): **1** no flags · **2** clarification (missing or inconsistent information,
"not aware" declarations, awareness gaps) · **3** technical assessment (unusual requirements: long wall time,
capability-size jobs, memory, GPU-only work, large scratch). These are *suggestions* to help the committee
decide where to look first. Unusual requirements call for proportionate evidence; the flags are not findings
against anyone.""",
              "P1, P12"),
        code(SETUP),
        code("""tr = ha.triage(dfs, wl, cfg)
hp.counts(tr['suggested_category'].map({1: '1 — no flags', 2: '2 — clarification', 3: '3 — technical assessment'}),
          'Submissions by suggested category', 'Submissions',
          order=['1 — no flags', '2 — clarification', '3 — technical assessment'])
for _, r in tr.iterrows():
    print(f"{r['submission_id']}  {r['pi_name']}  — suggested category {r['suggested_category']}")
    print('    ' + (r['reasons'].replace(chr(10), chr(10) + '    ') if r['reasons'] else '(no flags)'))"""),
        md("""## Answers to confirm (internal consistency)

Answers within one submission that do not fit together — e.g. more cores than the stated nodes hold, a sequence's
running time longer than its calendar time, measured scaling runs that differ from the reported doubling effect. They are
compared only with each other (and with node sizes from the cluster configuration), after submission; "don't know" and
blank answers never trigger a check. Each is a question for the respondent, not a finding; they also appear above as
category-2 reasons. Checking answers against outside knowledge of a code's performance is done by hand."""),
        code("ha.consistency_checks(dfs, wl, cfg)"),
        md("""## Why the Section D panels opened

Each panel is asked once per entry, whatever opened it; `opened_by` in each panel tab lists every trigger that held
(e.g. `walltime_over_limit; long_calc`). Counts per panel and trigger:"""),
        code("ha.panel_reasons(dfs).pivot_table(index='trigger', columns='panel', values='entries', fill_value=0)"),
        md("## Data quality: how many key numbers are unknown"),
        code("""key = ['cores', 'walltime_h', 'jobs_year', 'jobs_year_unconstrained', 'concurrent', 'mem_node_gb', 'scratch_write_gb']
raw = dfs['Workloads']
pd.DataFrame({'answered': [(ha.num(raw[c]).notna()).sum() for c in key],
              "don't know": [ha.is_unknown(raw[c]).sum() for c in key],
              'blank': [(raw[c].astype(str).str.strip() == '').sum() for c in key]}, index=key)"""),
    ],
}


def main():
    for old in ["01_workload_overview.ipynb", "02_resource_requirements.ipynb", "03_gpu_demand.ipynb",
                "04_workflow_patterns.ipynb", "05_service_gaps.ipynb", "06_qos_clusters.ipynb"]:
        p = os.path.join(HERE, old)
        if os.path.exists(p):
            os.remove(p)
    for name, cells in NOTEBOOKS.items():
        nb = nbf.v4.new_notebook()
        nb.cells = cells
        nb.metadata = {"kernelspec": {"name": "python3", "display_name": "Python 3"}, "language_info": {"name": "python"}}
        nbf.write(nb, os.path.join(HERE, name))
    print(f"Wrote {len(NOTEBOOKS)} notebooks.")


if __name__ == "__main__":
    main()
