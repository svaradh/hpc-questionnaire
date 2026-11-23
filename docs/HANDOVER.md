# Handing the backend over to the convener

The questionnaire's backend (the response sheet, the script that writes to it, the web app the form sends
to, and the reports folder) runs in the Google account of whoever set it up. Its owner can always open
every response. To give sole access to the convener, a **new backend is built in the convener's account**
and the live form is switched to it. Nothing is transferred: the old sheet stays where it is (empty), and
the person running the handover is never given access to the new one.

The pipeline `tools/handover/handover.mjs` does this. It automates every step it can, tells the convener
exactly what to click for the rest, and **checks the result of each step before going on**. A run can be
stopped at any prompt (`q`) and continued later with the same command.

The form, the questions, the schema and the analysis code do not change. Only where the form sends its
responses changes.

## In short

| | Who | Time |
|---|---|---|
| 1. `npm run handover:test`: the pipeline against a simulated Google | operator | 1 min |
| 2. **Rehearsal** in a test account (yours is fine), then commit `tools/handover/rehearsal.json` | operator | 20 min |
| 3. **Handover** in the convener's account | operator + convener | 20 min, of which the convener ~10 |
| 4. After the handover: the convener's notebook and sharing | convener | 10 min |

The operator is the person running the pipeline on their computer (with this repository, `.env.local`
and the right to publish the site). The convener needs no software, only a browser signed in to their
iiserb.ac.in account.

## What the convener does

Four things, each in their own browser:

1. Turn on **Google Apps Script API** at <https://script.google.com/home/usersettings> (one switch).
2. Sign in once when asked and approve. This lets the pipeline create the sheet and upload the code, for
   this session only.
3. Open the script project the pipeline created, pick `setupBackend`, click **Run**, and approve Google's
   permission screen.
4. Say whether the email "HPC Questionnaire: backend set up" arrived.

Everything else is automated: creating the sheet and its script project, uploading the code, checking
the upload is identical to the repository, deploying the web app, checking the setup, checking who can
open the sheet, switching the live form, and revoking the session's sign-in.

## Why a rehearsal first, and "exactly the same project"

The rehearsal runs the same pipeline in a test account. It catches anything that the simulated tests
cannot, such as a Workspace policy, the permission screen or the email, before the convener's time is
used.

**The fingerprint.** The pipeline computes a fingerprint of the six backend files: `Code.gs`,
`SheetWriter.gs`, `ReportGenerator.gs`, `bound/Setup.gs`, `bound/BoundMenu.gs` and `appsscript.json`.
The rehearsal writes it to `tools/handover/rehearsal.json`, which you commit. That file holds no account
details. The handover **refuses to start** unless:

- the backend files have that same fingerprint;
- you are on `main` with a clean tree;
- `main` is the same as `origin/main`.

**After uploading**, in both the rehearsal and the handover, the pipeline reads the project back from
Google and compares it file by file with the repository. So the convener's project is exactly the code
that was rehearsed. If the backend code changes after the rehearsal, rehearse again.

## Before you start

- This repository on `main`, with `.env.local` holding the current `VITE_APPS_SCRIPT_URL` and
  `VITE_GOOGLE_CLIENT_ID`.
- Node 20.11 or later. clasp (Google's Apps Script command-line tool) is fetched by `npx` when first
  needed. It is deliberately not in `package.json`, because its dependencies carry `npm audit` warnings.
- For the optional test submission in the rehearsal: `http://localhost:5173` is an authorised JavaScript
  origin of the form's Google sign-in client (Google Cloud Console → Credentials). See
  `apps-script/DEPLOY.md`, step 1.

## 1. Tests (no Google account)

```
npm run handover:test
```

The tests run the pipeline against a simulated Google (`tools/handover/test/`). Its web app runs the
real `Code.gs` and `Setup.gs`. They also play the people involved and make the usual mistakes:

- signing in with the wrong account;
- leaving the Apps Script API off;
- forgetting `setupBackend`, or a tab missing after it;
- an upload altered on the way;
- stopping and resuming;
- the operator having access to the new sheet;
- leaving the old backend open.

They check that each mistake is caught and that the run ends in the right state. `VERBOSE=1` shows the
pipeline's screen.

## 2. Rehearsal

```
npm run handover -- rehearse --email your.test.account@iiserb.ac.in
```

Your own account works as the test account. Follow the prompts, which are the same as in the handover
below. At the end the pipeline:

- writes `tools/handover/rehearsal.json`;
- offers to move the rehearsal sheet (with its script and web app) to the bin;
- revokes its sign-in.

Two things are left for you to delete by hand: the **HPC Committee Reports** folder that `setupBackend`
created, and the test email.

Do the optional **test submission** here. A local copy of the form is started that sends to the
rehearsal backend. Fill in a short response and check that the row appears and the confirmation email
arrives.

While the trial sheet is open, also **test the HPC Committee menu**, which the pipeline cannot check:
click a cell in the test row on the Submissions tab, then *HPC Committee → Generate Report for Selected
Row*. A message with the report's link appears for ten seconds; the report is in the new **HPC
Committee Reports** folder. If the menu is missing, see *If something goes wrong*. Do this before
answering the question about moving the sheet to the bin. (A binned sheet can be restored from Drive's
Bin with its script, and binned again afterwards.)

The trial sheet, its reports folder and the live ones have the **same names** ("HPC Questionnaire
Response v3", "HPC Committee Reports"). The pipeline bins the trial sheet by its ID; when deleting the
folder by hand, check that it was created on the day of the rehearsal.

Then commit and push the record:

```
git add tools/handover/rehearsal.json && git commit -m "Handover: rehearsal record" && git push
```

## 3. Handover

With the convener present in person or on a call:

```
npm run handover -- handover --email convener@iiserb.ac.in
```

Add `--remote` if the convener is on their own computer. Links are then printed for you to send. For the
sign-in, they approve, land on an error page at `http://localhost:8888/…` (that's expected), and send
back that address, which you paste in. That address is a one-time code that expires within minutes.
Send it over a direct channel, not a group chat.

| # | Step | Who | Checked before going on |
|---|---|---|---|
| 1 | Repository on `main`, clean, same as `origin/main`; fingerprint matches the rehearsal; your own address noted | automatic | — |
| 2 | Turn on the Apps Script API | convener | in step 4 |
| 3 | Sign in | convener | the signed-in address is the convener's. A wrong account's sign-in is revoked at once |
| 4 | Apps Script API is on | automatic | projects can be listed |
| 5 | Create "HPC Questionnaire Response v3" with its own script project | automatic | the convener owns it |
| 6 | Upload the six backend files | automatic | read back from Google: identical to the repository |
| 7 | Deploy the web app | automatic | the deployment is listed |
| 8 | Run `setupBackend` and approve permissions | convener | see below |
| 9 | Test submission | optional | skipped by default: the rehearsal covered it, and it would leave a test row |
| 10 | Who can open the sheet | automatic | the convener is the owner; you are not listed; no link sharing. Anyone else must be confirmed |
| 11 | Switch the live form: back up `.env.local`, set the new URL, `npm run deploy` | automatic, after you confirm | the live site's script contains the new URL |
| 12 | Close the old backend: set `SUBMISSION_DEADLINE` in your v3 project | you | the old web app reports submissions closed |
| 13 | Sign out | automatic | the sign-in is revoked at Google and no longer works; session files deleted |

**What step 8 checks.** The web app's `?check=setup` answer must show:
- the sheet is the one created in step 5 (compared by digest, so the ID is never shown);
- the reports folder exists;
- all 14 tabs exist;
- `setupBackend` finished;
- submissions are open.

The convener then confirms that the setup email arrived.

**What `setupBackend` does.** It:
1. points the backend at its own sheet;
2. creates the reports folder;
3. creates the tabs;
4. writes a test submission to every tab through the same code a real one uses, checks it, and deletes it;
5. sends the test email.

The sheet is left empty.

**What the convener sees.** At the end the pipeline prints the new sheet, script project and web-app
links for them. The sheet and the folder are private to them.

## What the session can access, and for how long

clasp's sign-in has fixed permissions. While the session runs, it can:

- manage the convener's Apps Script projects;
- read the names and details of files in their Drive;
- read and change the files it created (here, the new sheet);
- use their Google Cloud projects.

It is kept in `.handover/clasprc.json` (readable only by you, never in git). It is **revoked at Google**
in the last step and the file is deleted; the pipeline checks it no longer works. If a run is abandoned:

```
npm run handover -- abort
```

This revokes it and removes the session files. The convener can also remove "clasp" at any time at
<https://myaccount.google.com/connections>.

## If something goes wrong

- **Any failed check** shows what is wrong. Fix it and press Enter to check again, or `q` to stop.
  `npm run handover -- status` shows how far a run got. Running the same command again continues.
- **`setupBackend` failed:** the error is in the editor's log (also under Executions). Fix it, run it
  again (it is safe to repeat), and press Enter.
- **No setup email:** look in Spam, and in Executions for an error from `MailApp`.
- **No HPC Committee menu in the sheet:** close the sheet's tab and open the sheet again; the menu
  appears a few seconds after the sheet loads. A tab opened before a restore from the Bin never gets
  it. If it is still missing, open the sheet in a window signed in only to the institute account:
  menus of attached scripts often fail to load when several Google accounts are signed in at once.
  *Extensions → Apps Script → Executions* shows whether `onOpen` ran and any error.
- **"You do not have access to this service"** on script.google.com: the page opened in another
  signed-in account. Add `?authuser=<address>` to the link, or use a private window signed in only to
  the institute account.
- **`npm run deploy` hangs or fails** (`gh-pages`): publish `dist/` by hand as in `TODO.md` (the
  `node_modules/.cache/gh-pages` clone), then press Enter. The check only looks at the live site.
- **The live check keeps failing:** GitHub Pages can take a few minutes. The check retries for about
  ten minutes.
- **Starting over:** `abort`. A sheet already created stays in the convener's Drive; its link is
  printed so they can move it to the bin.

## After the handover

**For the convener**
- **Analysis:** open `analysis/07_committee_report.ipynb` from GitHub in Colab, then *File → Save a
  copy in Drive* at once, and work only in the copy. In the first cell set `SPREADSHEET_ID` to the new
  sheet's ID (the long string in its address). Leave `REPO_REF` as it is: it names the tested release of
  the analysis code, and is changed only when a newer release is announced (`analysis/README.md`,
  *Versions*). Each report records the release it was made with. Saving a scenario writes to its
  `Scenarios` tab.
- **HPC Committee menu:** it is in the sheet itself. The script project is attached to the sheet, so
  the library set-up in `apps-script/sheet-menu/` is not needed.
- **Sharing:** the sheet and the reports folder are private until the convener shares them.
- **Closing the questionnaire:** in the script project, Project Settings → Script Properties →
  `SUBMISSION_DEADLINE`, as before.

**For the operator**
- The old backend stays in your account, closed, with its empty sheet. Keep it as a test backend (it
  never receives real responses) or delete it.
- Analysis code changes (notebooks, `analysis/`) reach the convener through GitHub, with no access
  needed.
- **Local testing now reaches the convener's sheet.** `.env.local` points at the new backend, so a test
  submission from `npm run dev` would land among the real responses. For local tests, give the dev
  server a test backend: `VITE_APPS_SCRIPT_URL=<test web-app URL> npm run dev`. The old backend works
  for this once you remove its `SUBMISSION_DEADLINE`, after the live form has been switched for a while.
  The previous `.env.local` is kept as `.env.before-handover.local`.
- **Changes to the backend files** (`apps-script/*.gs`) need the new owner. They paste the changed files
  into their project, then Deploy → Manage deployments → Edit → New version (the URL stays the same).
  There is no automated update mode yet.

## Deciding not to hand over

Nothing in this pipeline touches the present backend until step 11, which asks first. The tests and
the rehearsal change nothing in production. If you keep the present arrangement, delete the rehearsal
leftovers and carry on.
