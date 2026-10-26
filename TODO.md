# TODO

## Status (2026-10-26)

- **Branches.** `progressive-disclosure-v2` (pushed) carries v3 at schema 2.5.0 (form and backend), on the draft
  `/v3-draft/` (`npm run deploy:layout`) for review, now at 2.6.0. The preview
  <https://svaradh.github.io/hpc-questionnaire/v3-preview/> still serves 2.4.0, matching the deployed Apps Script. `main` / the root site still serve v1.
- **Schema 2.5.0.** Each Section C entry is a code *and kind of job* (up to 8; the same code may have several).
  Section D panels list every trigger that opened them (recorded as `opened_by`), "Same answers as" an earlier entry
  of the same code, one merged set of sequence questions for chains and split calculations, and measured scaling runs
  with an overall Don't know and a third run behind "Add 1 more run". The banner asks respondents to fill sections in order.
- **Schema 2.6.0.** Section B keeps problems "on any system" and asks separately which of them were faced on Gargi
  and on Raman (policies differ; Gargi is newer), replacing "on which systems". New problems: *could not run on
  Gargi/Raman at all* (work displaced elsewhere or not run) and *software not available*. Jobs per year count any system.
- **Schema 2.4.0.** Section C is the same for every group; Section D "Details for Each Code" holds the per-code
  panels (job organisation, long runs, scaling, memory, GPU, scratch), all required with Don't know allowed. Every
  problem reported in B leads to required answers (problem linked to a code, queue entries, testing questions).
  Input volume read per job is asked beside volume written.
- **v3 backend.** Separate Apps Script project (web app, access "Anyone"; URL in `.env.local`), response sheet
  "HPC Questionnaire Responses v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.

## Next

- **Review 2.5.0 on `/v3-draft/`**, then publish it to the preview (`npm run deploy:preview`) together with the Apps
  Script update below, so the form and sheet writer match.
- **Update the v3 Apps Script (manual, for 2.5.0).** Paste `apps-script/SheetWriter.gs` and
  `apps-script/ReportGenerator.gs` into the v3 project (`Code.gs` unchanged); Deploy → Manage deployments → Edit →
  New version (the URL stays the same). Then delete the old test rows on every tab, run HPC Committee → Initialize
  Sheets (new columns: `job_kind`, `opened_by`, `same_as_entry`, `runs_not_known`, `seq_*`, `problems_gargi`,
  `problems_raman`; `problems_where` removed), and delete old test reports.
- **Test submission on `/v3-preview/`**, with a code that opens a few Section D panels; check the Workloads and panel
  tabs, the confirmation email, and Generate Report. If no email arrives, see *Confirmation email* below.
- **Dry run** with a student and a colleague; then the convener's answers to
  `docs/hardware-check/cluster-hardware-check.pdf` — add whether home is on the same fast parallel file system as
  scratch (`storage.scratchOnlyOnFastPFS`).

## Later

- **Deploying v3 live.** Merge into `main`, `npm run deploy`, and close the v1 window (set `SUBMISSION_DEADLINE` in the
  v1 Apps Script project to a past date). The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** Generate one real report and run the notebooks in Colab on real v3 responses.
- **Committee parameters** in `src/config/clusters.json`: target utilisation (0.8 placeholder), home:scratch split
  (0.5 placeholder), largest scratch area per user, home guide per group, Raman GPU count (from the hardware check);
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — add to the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, check the execution log. The deployed project picks its
  scopes automatically unless `appsscript.json` was pasted in; the repo manifest now lists `https://mail.google.com/`,
  the scope `GmailApp.sendEmail` needs (`gmail.send` did not cover it).
