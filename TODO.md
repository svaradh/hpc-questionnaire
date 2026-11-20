# TODO

## Released (2026-11-16)

- **v3 (schema 2.7.0) is live** at <https://svaradh.github.io/hpc-questionnaire/> (v3 backend). `progressive-disclosure-v2`
  was fast-forwarded into `main`. `/v3-preview/` and `/v3-draft/` now redirect to the main address.
- **v1 closed**: `SUBMISSION_DEADLINE` set in the v1 Apps Script project ("HPC Questionnaire Response").
- Test rows cleared and the dry run done before release. The response sheet is private to the owner. **Share it with
  the convener** before they need the responses.
- From now on, redeploy with `npm run deploy` from `main`. It replaces the whole site; the two redirect pages live in `public/`, so
  every build includes them. Don't use `deploy:preview` / `deploy:layout` any more (they would overwrite the redirects). The notebooks can use `REPO_REF = 'main'`.
- **Work on `main` from now on.** `progressive-disclosure-v2` is kept but no longer needed.
- **Backend fixes (2026-11-18), deployed and tested.** Only the submitter or the PI may edit a submission (anyone
  signed in could overwrite one by its ID, and the duplicate message gave the ID away); sign-ins issued for other
  apps are refused; one submission at a time (script lock); typed answers can no longer become formulas in the
  sheet; edits no longer add blank `CommitteeAssessment` rows; a failed confirmation email no longer reports the
  submission as failed; the follow-up email uses the group name (was the department). Pasted into the v3 project
  (new version, same URL); submit, edit and Generate Report checked on the live form. The duplicate
  ("this group already submitted") message from a second account was verified on 2026-11-20. Site redeployed the same day, so the form shows its own duplicate message.
  (`npm run deploy` built fine but `gh-pages` hung before pushing, twice; published by hand from the
  `node_modules/.cache/gh-pages/...` clone: `git rm -r .`, copy `dist/`, commit, push.)
- **HPC Committee menu works** (2026-11-18): a script bound to the response sheet uses the v3 project as a library
  (`apps-script/sheet-menu/`). **Sheet emptied 2026-11-20**: all data rows removed from every tab (headers kept), including the earlier own entry HPC-2026-84ABBB87 (resubmit it through the live form after launch); the two test reports trashed.
- **Next session: fix the analysis engine.** The user will bring more suggestions. Known open items: hardware-check values in `clusters.json` (group limits, queue
  ceilings, Raman GPU count, `scratchOnlyOnFastPFS`, downtime); chapters (c, d) on charging; the rest of chapter 3
  (long jobs by checkpoint/scaling, debug use, spread across groups).
- **Candidate queue tables in the report (2026-11-20).** A scenario's `candidateQueues` rows replace all present queues
  of the clusters they name (`ha.with_candidate_queues`); the report then compares present → candidate in 3.1 and 3.2
  (would start / would no longer start / where each entry is placed) and adds 3.5–3.6 (queue by queue and group-limit
  trade-off for the candidate). Unusable rows are listed in the report. Tested on the synthetic data; all notebooks pass.
- **Moved and upgraded (2026-11-20).** Working copy is now `~/ClaudeProjects/hpc-questionnaire` (out of iCloud); deploy
  from there. Build tools: Vite 8 + `@vitejs/plugin-react` 6 (npm audit clean); checked side by side against the Vite 5
  build (identical page text and saved answers), deployed, and a live test submission, email and report worked. Test
  rows and report removed afterwards: the response sheet is empty again.
- **iCloud offloads the project.** `~/Documents` syncs to iCloud and macOS evicted ~21,000 files in `.venv` and
  `node_modules` (shown as `dataless`), so imports and `gh-pages` crawl or hang. In Finder, right-click the
  Questionaire folder → *Keep Downloaded*, or move the project out of `~/Documents`.
- **Hardware check ready to send (2026-11-20).** `docs/hardware-check/cluster-hardware-check.pdf` rebuilt with the
  last missing question (home on the same fast parallel file system as scratch, per cluster). It now covers every
  `null` in `clusters.json`. Send it to the convener; enter the answers in `clusters.json`, re-run the notebooks.
- **Before collecting responses:** go through a step-by-step launch checklist (empty sheet, share with the convener,
  v1 closed, optional v3 `SUBMISSION_DEADLINE`, send link and slides, watch the first responses).

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

## Where we left off (2026-11-15)

- **Colab run of notebook 07 passed** on "HPC Questionnaire Response v3" (one real entry, two codes): sign-in,
  loading the sheet, saving a scenario to `Scenarios` and building the report all work. The report has every chapter,
  no errors and no identifiers. Delete the trial row `trial-2026-11-15` from `Scenarios` if not done yet.
- **Run Colab from a Drive copy.** A notebook opened from GitHub saves *back to GitHub* on Command+S (after asking
  for GitHub authorisation). That happened once (2098036, which put the sheet ID into the public repository;
  undone in 2289898; the sheet is Restricted, so the ID in history gives no access). Open the notebook from GitHub,
  then *File → Save a copy in Drive* at once, and work only in the copy (title starts with "Copy of").
- `ha.num()` no longer uses `replace`, which silences the pandas FutureWarning seen in Colab.
- **Real entry corrected in the sheet** (as the respondent confirmed): GPAW chain running time 72 h (was 96), users in
  3 years 3 (was 0), QE cores 256 (was 280). The derived columns were recomputed by hand with the SheetWriter
  formulas (QE core-hours 98,304 / 294,912, peak cores 768; GPAW queue overhead 264 h).

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
- **Queue by queue (later the same day).**
  - Only the high-memory and GPU queues have their own nodes; the other queues share each cluster's compute pool.
  - Each queue in `clusters.json` now has ceilings for all groups together (`maxTotalNodes`, `maxTotalJobs`; null until
    confirmed), and the candidate queue table has the same two columns (parameters 1.2.0).
  - `ha.queue_breakdown`: demand per queue against its limits and the nodes it can use, plus reported concurrency,
    problems and waits.
  - `ha.queue_tradeoff`: the present group limit and the limits serving 50/75/100 % of groups, with the work served and
    the nodes taken, on average and in the worst case.
  - Report 3.3–3.4 and notebook 05. The hardware check asks yes/no whether queues are bound to nodes, and each queue's
    ceilings.
- **Engine run on the real v3 entry (locally, data kept outside the repository).** It found that node counts reported
  from other systems were applied to Gargi and Raman; `job_on` now works out the nodes on each cluster from the cores
  (522a3d2). All notebooks and the report pass on the real entry and on the synthetic data.
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
  `docs/hardware-check/cluster-hardware-check.pdf` (now asks whether home is on the same fast parallel file system
  as scratch, `storage.scratchOnlyOnFastPFS`; added 2026-11-20).

## Later

- **Deploying v3 live.** Merge into `main`, `npm run deploy`, and close the v1 window (set `SUBMISSION_DEADLINE` in the
  v1 Apps Script project to a past date). The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** Generate one real report and run the notebooks in Colab on real v3 responses.
- **Committee values**: evaluation parameters through the notebook 07 form (target utilisation 0.8 is the default);
  in `src/config/clusters.json` the home:scratch split (0.5 placeholder) and Raman GPU count (from the hardware check);
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — asked in the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, check the execution log. The deployed project picks its
  scopes automatically unless `appsscript.json` was pasted in; the repo manifest now lists `https://mail.google.com/`,
  the scope `GmailApp.sendEmail` needs (`gmail.send` did not cover it).
