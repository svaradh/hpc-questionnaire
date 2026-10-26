# TODO

## Status (2026-10-26)

- **Branches.** `progressive-disclosure-v2` (pushed) carries v3 at schema 2.4.0, form and backend, published at the
  preview <https://svaradh.github.io/hpc-questionnaire/v3-preview/> against the v3 backend. `inline-followups` is
  merged into it. `main` / the root site still serve v1. The layout-only draft (`/v3-draft/`, `npm run deploy:layout`)
  is no longer needed for review.
- **Schema 2.4.0.** Section C is the same for every group; Section D "Details for Each Code" holds the per-code
  panels (job organisation, long runs, scaling, memory, GPU, scratch), all required with Don't know allowed. Every
  problem reported in B leads to required answers (problem linked to a code, queue entries, testing questions).
  Input volume read per job is asked beside volume written.
- **v3 backend.** Separate Apps Script project (web app, access "Anyone"; URL in `.env.local`), response sheet
  "HPC Questionnaire Responses v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.

## Next

- **Update the v3 Apps Script (manual).** Paste `apps-script/SheetWriter.gs` and `apps-script/ReportGenerator.gs`
  into the v3 project (`Code.gs` unchanged); Deploy → Manage deployments → Edit → New version (the URL stays the
  same). Then delete the old test rows on every tab, run HPC Committee → Initialize Sheets, and delete old test
  reports.
- **Test submission on `/v3-preview/`**, with a code that opens a few Section D panels; check the Workloads and panel
  tabs, the confirmation email, and Generate Report. If no email arrives, switch `GmailApp.sendEmail` to `MailApp`.
- **Dry run** with a student and a colleague; then the convener's answers to
  `docs/hardware-check/cluster-hardware-check.pdf` — add whether home is on the same fast parallel file system as
  scratch (`storage.scratchOnlyOnFastPFS`).

## Later

- **Deploying v3 live.** Merge into `main`, `npm run deploy`, and close the v1 window (set `SUBMISSION_DEADLINE` in the
  v1 Apps Script project to a past date). The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** Generate one real report and run the notebooks in Colab on real v3 responses.
- **Committee parameters** in `src/config/clusters.json`: target utilisation (0.8 placeholder), home:scratch split
  (0.5 placeholder), largest scratch area per user, home guide per group, Raman GPU count (from the hardware check);
  verify the four 'secondary' references in `analysis/code_capabilities.json` (NWChem, SIESTA, ABINIT, CPMD);
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — add to the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, check the execution log. The deployed project picks its
  scopes automatically unless `appsscript.json` was pasted in; the repo manifest now lists `https://mail.google.com/`,
  the scope `GmailApp.sendEmail` needs (`gmail.send` did not cover it).
