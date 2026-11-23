# HPC Workload Characterisation Questionnaire

A web form for IISER Bhopal research groups to describe their computing workloads, a Google Apps Script backend
that records submissions in a Google Sheet, and analysis notebooks for the HPC Users' Committee. The design
principles are in [`CLAUDE.md`](CLAUDE.md); current status and next steps are in [`TODO.md`](TODO.md).

| Folder | Contents |
|---|---|
| `src/` | the form (React + TypeScript + Vite); questions live in `src/schema/questionnaire.json`, cluster facts in `src/config/clusters.json` |
| `apps-script/` | backend: sheet writer, committee report, confirmation emails (deployed by copy-paste, see `apps-script/DEPLOY.md`); `bound/` holds the setup and menu for a backend built by the handover pipeline |
| `tools/handover/` | builds the backend in another person's Google account and switches the form to it (see `docs/HANDOVER.md`) |
| `analysis/` | committee notebooks, helpers and synthetic test data (see `analysis/README.md`) |
| `slides/` | introductory slide deck (Beamer) and the form screenshots it uses |
| `docs/` | analysis framework, form plan, archive notes, hardware check for the cluster convener, backend handover |

## Setting up on a new computer

```bash
git clone https://github.com/svaradh/hpc-questionnaire.git
cd hpc-questionnaire
# main is the working branch (v3 since 2026-11-16)
```

**Form (Node 20 or later; `.nvmrc` names the version used):**

```bash
npm ci                       # exact versions from package-lock.json
cp .env.example .env.local   # then fill in the two values (see below)
npm run dev                  # http://localhost:5173/hpc-questionnaire/
```

`.env.local` is not in git. It holds `VITE_APPS_SCRIPT_URL` (the v3 web-app URL, from the Apps Script project:
Deploy → Manage deployments) and `VITE_GOOGLE_CLIENT_ID` (the Google sign-in client ID, from the Google Cloud
project). Without them the form runs, but sign-in and submission do not.

**Analysis and documents (Python 3.10 or later):**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python analysis/run_notebooks.py      # runs notebooks 00–06 on the synthetic data
```

In Colab nothing needs installing beyond what the first notebook cell does.

**Slides:** a TeX distribution with XeLaTeX and the `metropolis` Beamer theme (TeX Live has both):
`cd slides && latexmk -xelatex survey_intro.tex`.

## Common tasks

| Task | Command |
|---|---|
| Type-check and build | `npm run build` |
| Publish the live form | `npm run deploy` (from `main`) |
| Test the handover pipeline (no Google account) | `npm run handover:test` |
| Rehearse / do the backend handover | `npm run handover -- rehearse --email …` / `npm run handover -- handover --email …` (see `docs/HANDOVER.md`) |
| Regenerate the synthetic test data | `npm run fixtures` |
| Rebuild the notebooks after editing them | `python analysis/_build_notebooks.py` |
| Update the cluster details from the returned hardware-check PDF | `tools/cluster-update/README.md` (read → review → apply → release) |
| Rebuild the convener guide's HTML after editing `docs/CONVENER-GUIDE.md` | `python docs/build_guide_html.py` (commit both files; also update the shared copy) |
| Retake the slide screenshots | `npm run slides:figures` (needs Chrome, Brave, Edge or Chromium; `BROWSER_PATH` if not found) |

`npm run deploy` replaces the whole site; the `/v3-preview/` and `/v3-draft/` redirects come from `public/`. Do not use the
old `deploy:preview` / `deploy:layout` scripts: they would overwrite those redirects.
After any change to `apps-script/*.gs`, paste the files into the Apps Script project and create a new deployment
version (see `TODO.md`).
