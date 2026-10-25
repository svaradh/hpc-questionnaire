# TODO

## Status (2026-10-26)

- **Branches.** `progressive-disclosure-v2` (pushed, `7955d38`) is v3 schema 2.0.0, live at the preview
  <https://svaradh.github.io/hpc-questionnaire/v3-preview/> against the v3 backend. `inline-followups` (local only,
  off it) is schema 2.4.0: per-code follow-up panels, glossary pop-ups, running vs calendar time, heaviest-job rule.
  2.2.0 made every question in an open panel (and the pattern follow-ups) required — Don't know counts, and a
  panel's "don't know these details" box answers it — and asks the input volume one job loads (`W_input_read`,
  moved from the scratch panel) beside the volume it writes. 2.3.0 moves the panels into a new Section D "Details
  for Each Code" (`rowDetails` question; answers still stored in the `W_workloads` rows, so no data change) and
  re-letters D–F to E–G. 2.4.0 moves the pattern follow-ups (batch, chain, long calculation, campaign) into a
  first D panel "How these jobs are organised" (`W_blk_org`, `NA_org`); C is now the same for every group. Every problem reported in B now leads to required answers: `W_affected` required (with
  Don't know) and each reported problem must be ticked for at least one code (`coverage`); `X_problems_other` /
  `X_problems_where` required; Queue section (F) needs ≥ 1 entry with all fields; testing questions (E) required
  when short test jobs wait too long (`requiredWhen`). Form only — its layout draft (submit disabled) is at
  <https://svaradh.github.io/hpc-questionnaire/v3-draft/> (`npm run deploy:layout`). `main` / the root site still serve v1.
- **v3 backend.** Separate Apps Script project (web app, access "Anyone"; URL in `.env.local`), new response sheet
  "HPC Questionnaire Responses v3", reports folder "HPC Committee Reports/v3". The v1 Apps Script project and the
  Google Cloud sign-in project are kept.
- **Waiting on the user:** confirmation of the `inline-followups` layout (tablet check of the draft); a test submission
  on `/v3-preview/` and the v3 sheet ID; the convener's answers to `docs/hardware-check/cluster-hardware-check.pdf`.

## Next, once the inline layout is confirmed

- **Backend for schema 2.2.0.** `SheetWriter.gs`: fill the LongJobs / Scaling / Memory / Gpu / Scratch tabs from the
  blocks inside each workload entry (one row per entry with that block), drop the removed fields (`L_device`,
  `L_longest_cores/gpus`, `L_doubling`, `P_scale_over`, `M_peak`, `*_workload`), add `W_affected`, `W_chain_run`,
  `W_long_calendar`, per-entry `NA_*` (incl. `NA_org`); `SC_input_read` → `W_input_read` on the Workloads tab; `G_model`, `Q_queue`,
  `Q_other_system`, `T_purpose`, `W_affected` may be `dont_know`. Section letters in report text: D–F → E–G. Strip answers of hidden blocks on submit (`answersForSubmission`).
- **Report and notebooks.** Scratch demand per job = written volume, plus read volume where
  `storage.scratchOnlyOnFastPFS` is true. Doubling from `P_doubling` only; totals from the heaviest job reported as upper bounds
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
  verify `analysis/code_capabilities.json`;
  `storage.scratchOnlyOnFastPFS` per cluster (is home on the same fast PFS as scratch? — add to the hardware check). Re-run `docs/hardware-check/make_hardware_form.py` after edits.
- **Slurm accounting.** Ask the HPC admins for a per-group export (last 12 months) to check reported figures.
- **Confirmation email.** If none arrives on a test submission, switch `GmailApp.sendEmail` to `MailApp` (the
  `gmail.send` scope may not cover `GmailApp`).
