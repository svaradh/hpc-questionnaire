# TODO

## Status (2026-11-13)

- **Branches.** `progressive-disclosure-v2` (pushed) carries v3 at schema 2.6.0, form and backend. Published at the
  preview <https://svaradh.github.io/hpc-questionnaire/v3-preview/> (submissions on, v3 backend) and the draft
  `/v3-draft/` (submissions off). The v3 Apps Script and response sheet were updated for 2.6.0 on 2026-10-26.
  `main` / the root site still serve v1.
- **Schema 2.7.0 (Section H approved by the committee, 2026-11-13).** Premium services, charge multiple and optional
  budget band, on `/v3-draft/`; the backend (`Charging` tab) is committed. The ₹ bands are final form options: the
  annual target is needed only at the analysis stage.
- **Evaluation parameters.** Set by the convener in the form in notebook 07 (`analysis/param_form.py`, generated from
  `analysis/parameters.json`): availability and usable share of available time (replacing the single target
  utilisation, 2026-11-14; old scenarios are read through `parameters.LEGACY`), scratch and home guides, candidate queue table, annual target,
  allowance share and size, premium multiple. Each set is a named scenario, kept in a `Scenarios` tab of the response
  sheet (never overwritten); each report names its scenario. `clusters.json` keeps only the form's trigger values.
  Until the merge into `main`, set `REPO_REF = 'progressive-disclosure-v2'` in the notebooks, which fetch helper code from `main`.
- **Slides.** `slides/survey_intro.pdf` is final (approved 2026-10-26), built from `survey_intro.tex`. If the form
  changes before it is presented, run `npm run slides:figures` and rebuild so the screenshots match.
- **Working on another computer.** See *Setting up on a new computer* in `README.md`: `npm ci`, `pip install -r
  requirements.txt`, and a copy of `.env.local` (v3 web-app URL and Google client ID; not in git).
- **Schema 2.5.0.** Each Section C entry is a code *and kind of job* (up to 8; the same code may have several).
  Section D panels list every trigger that opened them (recorded as `opened_by`), "Same answers as" an earlier entry
  of the same code, one merged set of sequence questions for chains and split calculations, and measured scaling runs
  with an overall Don't know and a third run behind "Add 1 more run". The banner asks respondents to fill sections in order.
- **Schema 2.6.0.** Section B keeps problems "on any system" and asks separately which of them were faced on Gargi
  and on Raman (policies differ; Gargi is newer), replacing "on which systems", each followed by whether those
  problems kept some or all of the group's work off that cluster. New problem: *software or libraries not available*.
  Jobs per year count any system.
- **Schema 2.4.0.** Section C is the same for every group; Section D "Details for Each Code" holds the per-code
  panels (job organisation, long runs, scaling, memory, GPU, scratch), all required with Don't know allowed. Every
  problem reported in B leads to required answers (problem linked to a code, queue entries, testing questions).
  Input volume read per job is asked beside volume written.
- **v3 backend.** Separate Apps Script project (web app, access "Anyone"; URL in `.env.local`), response sheet
  "HPC Questionnaire Response v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.

## Where we left off (2026-11-14)

- **Done today (analysis, synthetic data only; all notebooks pass).**
  - Capacity = cores × 8,760 h × availability (0.95) × usable share (0.85), both set in the notebook 07 form.
  - Per-cluster demand is a range: low = only the entries naming the cluster, high = plus the work that could go to
    either. This replaces the "unattributed" row and the 50:50 split.
  - `ha.service_balance`: desired → cannot start → fits a queue → runnable within group limits, against capacity.
  - `ha.cannot_start`: a red-flag list of the work no present queue allows, with checkpoint and scaling answers.
  - Report chapter 3 now has 3.1 and 3.2. Triage marks entries that cannot start as category-3 candidates.
  - Limits are per group (at most two users). `clusters.json` now has `groupLimits` per cluster (null until
    confirmed; fair-share: Raman yes, Gargi no).
  - The hardware check PDF was rebuilt with questions on group limits: running jobs, nodes and queued jobs per group,
    whether limits add up across queues, and whether other jobs may use the high-memory and GPU nodes.
- **Next:** send the hardware check to the convener and enter the answers in `clusters.json` (`groupLimits`, GPU
  count, downtime for availability). Then continue chapter 3 with the candidate queue tables.

## Earlier (2026-11-13)

- **Done today.** Section H approved; v3 backend updated for 2.7.0 (`Charging` tab); `/v3-preview/` republished at
  2.7.0; one test submission checked end to end (Submissions, Workloads one row per code, Charging, confirmation
  email). The evaluation-parameter form for the committee report was added to notebook 07.
- **Resume with:** a walk-through of the analysis engine. The overview (load → workload table → evidence tables →
  notebooks and report) is in `analysis/README.md` and `docs/analysis-framework.md`. Next step: run
  `analysis/07_committee_report.ipynb` in Colab on "HPC Questionnaire Response v3" (File → Open notebook → GitHub,
  branch `progressive-disclosure-v2`; in the first cell set `SPREADSHEET_ID` and `REPO_REF = 'progressive-disclosure-v2'`),
  save a trial scenario in the form, and read the report; or first look at `ha.workloads()` and `ha.cpu_balance()`
  on the synthetic data locally.
- **Test rows in "Response v3"** (the test submission) to delete before real responses arrive; also any trial rows in
  the `Scenarios` tab, which the form creates on first save.
- **Generate Report for Selected Row** cannot be used: the v3 Apps Script project is standalone, so the sheet has no
  HPC Committee menu. To fix (e.g. a small script bound to the sheet, or run by submission ID from the editor).
- **Running the notebooks locally:** `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`, then
  `.venv/bin/python -m ipykernel install --sys-prefix --name hpc-venv` and
  `.venv/bin/python analysis/run_notebooks.py --kernel hpc-venv` (all of 00–07 pass on the synthetic data).

## Next

- **Section H on the preview (2026-11-13).** Backend pasted, new version deployed, Initialize Sheets run (`Charging` tab
  created), `/v3-preview/` republished at 2.7.0. Still to do: update the slides (`A--G`, screenshots). The v3 project is
  standalone, so the sheet has no HPC Committee menu: run `initializeSheets` from the script editor.
- **Committee report** (`analysis/committee_report.py`, notebook 07): skeleton with chapters (a) usage patterns and
  (e) expansion, tested on the synthetic data only. Next: (b) needs the candidate queue table (from the
  notebook 07 form) and, for fair-share, Slurm accounting; (c, d) uses the `Charging` tab and the charging parameters
  from the notebook 07 form; to compare scenarios side by side once written. Still open: the committee's own Sheet for general
  queries (named rows, no budget answers).
- **Limit the v3 response sheet to the convener** (Share settings), before real responses arrive.
- **Whenever `apps-script/*.gs` change:** paste `SheetWriter.gs` and `ReportGenerator.gs` into the v3 project
  (`Code.gs` unchanged); Deploy → Manage deployments → Edit → New version (URL stays the same); clear test rows and run
  HPC Committee → Initialize Sheets. Done for 2.6.0.
- **Test submission on `/v3-preview/`**, with a code that opens a few Section D panels; check the Workloads and panel
  tabs, the confirmation email, and Generate Report. If no email arrives, see *Confirmation email* below.
- **Dry run** with a student and a colleague; then the convener's answers to
  `docs/hardware-check/cluster-hardware-check.pdf` — add whether home is on the same fast parallel file system as
  scratch (`storage.scratchOnlyOnFastPFS`).

## Later

- **Deploying v3 live.** Merge into `main`, `npm run deploy`, and close the v1 window (set `SUBMISSION_DEADLINE` in the
  v1 Apps Script project to a past date). The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** Generate one real report and run the notebooks in Colab on real v3 responses.
- **Committee values**: evaluation parameters through the notebook 07 form (target utilisation 0.8 is the default);
  in `src/config/clusters.json` the home:scratch split (0.5 placeholder) and Raman GPU count (from the hardware check);
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — add to the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, check the execution log. The deployed project picks its
  scopes automatically unless `appsscript.json` was pasted in; the repo manifest now lists `https://mail.google.com/`,
  the scope `GmailApp.sendEmail` needs (`gmail.send` did not cover it).
