# TODO

## Status (2026-10-26)

- **Branches.** `progressive-disclosure-v2` (pushed) carries v3 at schema 2.6.0, form and backend. Published at the
  preview <https://svaradh.github.io/hpc-questionnaire/v3-preview/> (submissions on, v3 backend) and the draft
  `/v3-draft/` (submissions off). The v3 Apps Script and response sheet were updated for 2.6.0 on 2026-10-26.
  `main` / the root site still serve v1.
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
- **Committee parameters** in `src/config/clusters.json`: target utilisation (0.8 placeholder), home:scratch split
  (0.5 placeholder), largest scratch area per user, home guide per group, Raman GPU count (from the hardware check);
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — add to the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, check the execution log. The deployed project picks its
  scopes automatically unless `appsscript.json` was pasted in; the repo manifest now lists `https://mail.google.com/`,
  the scope `GmailApp.sendEmail` needs (`gmail.send` did not cover it).
