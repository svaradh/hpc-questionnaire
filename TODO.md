# TODO

- **Deploying v3 (schema 2.0.0).** Create a **new** response spreadsheet; in the Apps Script project set `SPREADSHEET_ID` to it, push the `apps-script/` files, redeploy the web app, and run "HPC Committee → Initialize Sheets" (it always rewrites row-1 headers). Merge `progressive-disclosure-v2` into `main`, run `npm run deploy`, and close the v1 window. The v1 sheet stays as the archive (`docs/ARCHIVE.md`).
- **Verify against a live deployment.** The report generator and the notebooks were tested on synthetic data with stubbed Apps Script services; generate one real report and run the notebooks in Colab once real v3 responses exist.
- **Committee parameters** in `src/config/clusters.json`: target utilisation (0.8 placeholder), home:scratch split (0.5 placeholder), largest scratch area per user, home guide per group, Raman GPU count; and verify `analysis/code_capabilities.json`.
