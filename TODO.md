# TODO

## Status (2026-10-24)

- **Branches.** `progressive-disclosure-v2` (pushed, `7955d38`) is v3 schema 2.0.0, live at the preview
  <https://svaradh.github.io/hpc-questionnaire/v3-preview/> against the v3 backend. `inline-followups` (local only,
  off it) is schema 2.1.0: follow-ups inline in each workload entry, glossary pop-ups, running vs calendar time,
  heaviest-job rule. Form only — its layout draft (submit disabled) is at
  <https://svaradh.github.io/hpc-questionnaire/v3-draft/> (`npm run deploy:layout`). `main` / the root site still serve v1.
- **v3 backend.** Separate Apps Script project (web app, access "Anyone"; URL in `.env.local`), new response sheet
  "HPC Questionnaire Responses v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.
- **Waiting on the user:** confirmation of the `inline-followups` layout (tablet check of the draft); a test submission
  on `/v3-preview/` and the v3 sheet ID; the convener's answers to `docs/hardware-check/cluster-hardware-check.pdf`.

## Next, once the inline layout is confirmed

- **Backend for schema 2.1.0.** `SheetWriter.gs`: fill the LongJobs / Scaling / Memory / Gpu / Scratch tabs from the
  blocks inside each workload entry (one row per entry with that block), drop the removed fields (`L_device`,
  `L_longest_cores/gpus`, `L_doubling`, `P_scale_over`, `M_peak`, `*_workload`), add `W_affected`, `W_chain_run`,
  `W_long_calendar`, per-entry `NA_*`. Strip answers of hidden blocks on submit (`answersForSubmission`).
- **Report and notebooks.** Doubling from `P_doubling` only; totals from the heaviest job reported as upper bounds
  (chains: heaviest-step cores × chain running time); queue overhead = calendar − running time for chains and long
  calculations. Regenerate the synthetic fixture; update `docs/form-v3-plan.md` and `docs/analysis-framework.md`.
- **Redeploy.** Push the Apps Script files, Initialize Sheets again, delete old test rows and reports; merge
  `inline-followups` into `progressive-disclosure-v2`; `npm run deploy:preview`. Then the dry run with a student and a
  colleague.

## Later

- **Deploying v3 live.** Merge into `main`, `npm run deploy`, and close the v1 window (set `SUBMISSION_DEADLINE` in the
  v1 Apps Script project to a past date). The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** Generate one real report and run the notebooks in Colab on real v3 responses.
- **Committee parameters** in `src/config/clusters.json`: target utilisation (0.8 placeholder), home:scratch split
  (0.5 placeholder), largest scratch area per user, home guide per group, Raman GPU count (from the hardware check);
  verify `analysis/code_capabilities.json`. Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, switch `GmailApp.sendEmail` to `MailApp` (the
  `gmail.send` scope may not cover `GmailApp`).
