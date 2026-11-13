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
  `analysis/parameters.json`): target utilisation, scratch and home guides, candidate queue table, annual target,
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
  "HPC Questionnaire Responses v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.

## Next

- **Section H go-live on the preview.** Paste `SheetWriter.gs` and `ReportGenerator.gs` into the v3 project, deploy a new
  version, clear test rows, run HPC Committee → Initialize Sheets (creates `Charging`), then republish `/v3-preview/`
  and update the slides (`A--G`, screenshots). Do not republish the preview before the paste, or H answers are dropped.
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
