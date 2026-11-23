# HPC Workload Questionnaire: guide for the convener

For the convener of the HPC Users' Committee, who will own the questionnaire's responses.
Form version 2.7.2, release `v3-2026-11-23b` (November 2026).

**In one paragraph.** Research groups fill in a web form. Their answers are written into a Google Sheet
that belongs to **your** institute Google account and that nobody else can open unless you share it. A
small script attached to that sheet receives the answers, sends each group a confirmation with a copy of
its answers, and lets you make per-group reports. A separate notebook, run in Google Colab, turns the
sheet into the committee's report, which shows counts and totals, not group names. Your part takes about
ten minutes at the handover, then a few minutes a week while responses come in.

---

## 1. How your data is protected

### Where the responses are

| What | Where | Who can open it |
|---|---|---|
| Response sheet "HPC Questionnaire Response v3" (14 tabs) | Your Google Drive | **You only**, until you share it |
| Reports folder "HPC Committee Reports" | Your Google Drive | You only, until you share it |
| The script that receives answers | Attached to the sheet, in your account | You only |
| A respondent's draft | That person's own browser | That person |
| Confirmation emails | Sent from your account to the respondent and their PI | Those two people (and your Sent folder) |

The person who set up the form (the *operator*) has **no access** to your sheet, folder or script. The
handover checks this and stops if it is not so. The earlier backend used for testing stays in the
operator's account, **closed and empty**: the handover happens before the form is announced, so it never
holds real responses.

### What the script can and cannot do

Google's permission screen describes access by *kind* of service ("all your spreadsheets"), because
that is the only way Google can describe it. What the script actually does was checked line by line
(`docs/permissions-audit.md`). It:

- opens **only** the response sheet and the reports folder, by their IDs;
- adds rows for each submission; replaces a submission only when its own submitter or its PI edits it;
- creates a report document **only** when you ask for one, inside the reports folder;
- **sends** four kinds of fixed-wording email: confirmation to the respondent, notice to the PI, a
  follow-up you choose to send, and one set-up email; it **cannot read, search or delete** your mail;
- contacts one outside address, Google's own sign-in check.

It **never** shares, copies, lists, searches, moves to the bin or deletes any file, and never opens any
other sheet, document or folder of yours.

### Who can submit

Only people signed in with a verified **@iiserb.ac.in** Google account. Signing in gives the form only
the person's name and address, never access to their Drive or mail. The PI's address must also be an
@iiserb.ac.in address, so no email goes outside the institute. Each submission records who sent it.

### What the committee sees

- **The committee report** (from the notebook): counts, totals and distributions; no group names.
  Budget answers (Section H) appear **only as totals**. The form tells respondents this.
- **Per-group reports** (menu *Generate Report*): one group's full answers, names included, except the
  budget answers. Share these only as needed.
- **Triage notebook (06)**: lists entries needing follow-up by submission ID and PI name. Only whoever
  runs the notebook sees it.

---

## 2. Risks to be aware of, and what reduces them

| Risk | Why it matters | What reduces it |
|---|---|---|
| **Your account is the only key** | Anyone who gets into your Google account can read all responses | Keep 2-step verification on; do not share the sheet more widely than needed; share **view** access for reading |
| **Accidental sharing** | A "Anyone with the link" setting would expose the sheet | Keep the sheet and folder **Restricted**; add named people only |
| **Moving the sheet to the Bin** | The script keeps writing to a binned sheet (found in testing), so responses would collect out of sight, and are lost for good if the Bin is emptied | Do not bin or rename-and-forget the sheet while the form is open; if it happens, restore it from Drive's Bin. Give it a distinctive name (e.g. "… — LIVE") |
| **Emails come from your account** | Replies to confirmations and follow-ups come to you; copies sit in your Sent folder | Expected; filter them into a label if you like |
| **The form's web page is published by the operator** (GitHub) | The operator could change future versions of the page | Every change is public in the repository history; the committee can ask for the repository to move to an institutional account |
| **The analysis code comes from the same repository** | Code run in Colab acts with your Google access during that session | Notebooks use a fixed, tested **release** (`REPO_REF`), not the latest code; each report records the release and its commit |
| **Colab's sign-in is broad** | During a Colab session, the notebook could reach your Drive | The code only reads the response sheet and adds rows to its Scenarios tab; use your own Drive copy of the notebook |
| **Spurious submissions** | Any @iiserb.ac.in user can submit for a PI address | One submission per PI address; each row records the signed-in sender; the PI gets a copy and can object |
| **The form's sign-in setup lives in the operator's Google Cloud project** | If that project were deleted, sign-in would stop working | It holds no data; the operator keeps it until the exercise ends |
| **Edits only from the same browser** | A respondent who changes computer cannot edit | They ask the committee; you can correct the sheet directly |
| **Personal data** | Names and institute email addresses of respondents and PIs | Kept only in your sheet and reports; decide a retention period (section 6) |

None of these are unusual for a Google Form or Sheet run by a committee member; they are listed so the
choices are made knowingly.

---

## 3. The handover (about 10 minutes of your time)

The operator runs a tool on their computer that builds a new, empty backend **in your account** and
points the form at it. You will be on a call (or in the room). Use a computer with a browser in which
**only your @iiserb.ac.in account is signed in** (a private window is ideal: several signed-in accounts
make Google open pages in the wrong one).

You will do four things, each when the operator asks:

1. **Turn on the Apps Script API**: open <https://script.google.com/home/usersettings> and switch on
   *Google Apps Script API*. (It lets the tool create the script project. You can switch it off
   afterwards.)
2. **Sign in once and approve** the tool ("clasp", Google's own Apps Script tool) for this session. The
   operator's tool cancels this access at the end and checks that it no longer works. You can also
   remove it yourself at <https://myaccount.google.com/connections>.
3. **Run the set-up**: open the link you are given, click **Setup.gs**, choose **setupBackend**, click
   **Run**, and approve. The permission screen will list:

   | It says | Used for |
   |---|---|
   | See, edit, create and delete your spreadsheets | Writing responses into the response sheet |
   | See, edit, create and delete your Google Drive files | Creating the reports folder and filing reports in it |
   | See, edit, create and delete your Google Docs | Writing a per-group report when you ask |
   | **Send email as you** | Confirmations, PI notices, follow-ups (send only) |
   | Connect to an external service | Checking respondents' Google sign-in with Google |
   | Display and run third-party web content in prompts and sidebars | The *HPC Committee* menu in the sheet |
   | See your primary email address | Sending the set-up email to you |

   If Google says "Google hasn't verified this app": that is normal for a script in your own account;
   choose **Advanced → Go to … (unsafe)**.
4. **Confirm** that the email "HPC Questionnaire: backend set up" arrived (check Spam).

The tool then checks that only you can open the sheet and switches the live form to your backend; the
operator closes the old backend; the tool signs out. At the end it prints the links to your sheet, script and reports folder.

**Straight after:** rename the sheet to something distinctive, e.g. "HPC Questionnaire Response v3 —
LIVE", so it is never confused with other copies. Renaming is safe.

---

## 4. While responses come in

### Watching submissions

- Each submission adds a row in **Submissions** (one per group) and rows in the other tabs (one per
  code for Workloads and the per-code tabs).
- You do not receive an email per submission. Look at the sheet every few days.
- **Do not edit or sort the header row** (row 1) of any tab. Sorting or filtering data rows is fine;
  use *Data → Create a filter* rather than sorting the whole sheet.

### The HPC Committee menu (in the sheet)

| Item | What it does |
|---|---|
| **Generate Report for Selected Row** | On the Submissions tab, click a cell in a group's row, then this. A Google Doc with that group's answers appears in the reports folder (link shown for 10 seconds). |
| **Send Follow-up to Selected** | On the Submissions tab, select a row; you are asked for an optional note; an email asking for clarification goes to the person who submitted. |
| **Initialize Sheets** | Rewrites the header rows. Not needed in normal use. |

The first time you use the menu, Google asks for permission once. If the menu does not appear, close
the sheet's tab and open it again; if still missing, use a window signed in only to your institute
account.

### Requests from respondents

- **"I want to change my answers."** In the browser they submitted from: open the form and click
  **Edit your response**. Only the person who submitted or the PI can replace a submission.
- **"I submitted from another computer / cleared my browser."** They cannot edit it themselves. Either
  correct the cell in the sheet yourself (note it in the CommitteeAssessment tab), or delete that
  group's rows in all tabs so they can submit afresh.
- **"Our PI wasn't asked."** The PI receives a copy of the answers by email when the form is submitted.
- **"The form says a submission was already received for this PI."** Only one submission per PI
  address. See the first two points.
- **"I want a copy."** After submitting, the form offers **Save or print your answers** (a PDF via the
  browser's print dialog); the confirmation email also contains the answers.

### Closing the form

In the script project (sheet → *Extensions → Apps Script*), **Project Settings → Script Properties →
Add property**: name `SUBMISSION_DEADLINE`, value a date and time such as `2026-12-31T23:59:59+05:30`.
After that moment the form tells respondents it is closed. To reopen, delete the property or set a later
date.

### Sharing with committee members

*Share* the sheet with named people, **Viewer** access, unless they need to save analysis scenarios
(then Editor). Keep *General access* on **Restricted**. Share the reports folder the same way if they
should see per-group reports.

---

## 5. The committee report (Google Colab)

No installation is needed: Colab runs in the browser with your institute account.

**First time (about 10 minutes):**

1. Open <https://colab.research.google.com> → *File → Open notebook → GitHub*, enter
   `svaradh/hpc-questionnaire`, and open `analysis/07_committee_report.ipynb`.
2. **At once:** *File → Save a copy in Drive*. Work only in the copy ("Copy of …"). (Saving the original
   would try to write to the public repository.)
3. In the first code cell, replace `PASTE_YOUR_SPREADSHEET_ID_HERE` with your sheet's ID: the long string
   in its address between `/d/` and `/edit`. **Leave `REPO_REF` as it is.**
4. *Runtime → Run all*. Colab asks you to sign in and approve access for this session.
5. A form appears with the evaluation parameters (availability, usable share of time, storage guides,
   candidate queue table, charging parameters). Start from the defaults or a saved scenario, give the
   scenario a name, and click **Save and build report**. The scenario is saved in the sheet's
   **Scenarios** tab (never overwritten) and the report downloads as an HTML file.
6. Open the file in a browser; *Print → Save as PDF* to circulate it.

**Next times:** open your Drive copy, *Runtime → Run all*, choose or make a scenario, build.

**Releases.** `REPO_REF` names a tested release of the analysis code and the cluster configuration
(currently `v3-2026-11-23b`). It changes only when the operator announces a new release, for example
after the cluster hardware answers are entered. Then change that one line in your copy. Each report's
*Sources* table states the release and commit it was made with, and warns if responses come from a form
version the code was not written for.

---

## 6. At the end of the exercise

1. Set `SUBMISSION_DEADLINE` (section 4) if not done.
2. Download a copy of the sheet for the record (*File → Download → Microsoft Excel*), stored where the
   committee keeps its records.
3. Decide with the committee how long the responses are kept, and who keeps them; then delete the
   sheet, reports and the Colab copy when that time comes.
4. Optional: in the script project, *Deploy → Manage deployments → Archive* the web app, so the form can
   no longer submit at all; and switch off the Apps Script API in your settings if you turned it on only
   for the handover.

---

## 7. If something goes wrong

| Symptom | What to do |
|---|---|
| Respondents report "Submission failed" | Script project → *Executions*: the newest *doPost* shows the error. Send it to the operator. |
| No confirmation emails | Executions: look for an error from `MailApp`. Daily limit is 1,500 recipients, far above this exercise. |
| Sheet missing from Drive | Look in Drive's **Bin** and restore it. Search by its ID from *Script Properties → SPREADSHEET_ID*. |
| No HPC Committee menu | Close and reopen the sheet; use a window signed in only to your institute account. |
| "You do not have access to this service" on a Google page | The page opened in another signed-in account; add `?authuser=<your address>` to the link or use a private window. |
| Colab: "Spreadsheet not found" or permission error | Check the ID in the first cell and that Colab signed in with your institute account. |
| Report shows a "form version not supported" note | Ask the operator for a newer release; change `REPO_REF` when it is announced. |

**Who to ask:** the operator, for anything about the form, the code or the reports; Google Workspace
administrators of the institute, for account access.
