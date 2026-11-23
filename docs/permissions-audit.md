# What the questionnaire can do in a Google account: a permissions audit

Audited 2026-11-23 against the code on `main`; updated the same day after recommendations 1 and 2 were
made (send-only email; institute PI addresses only; form 2.7.1).
Written for the HPC Users' Committee and the convener, who will own the backend after the handover.

## In short

Google grants an Apps Script project permissions by **kind of service**, not by file. "See, edit,
create and delete all your Google Sheets" is the only way Google can describe "write to one sheet".
So the permission screen always sounds broader than the code is.

What the code actually does was checked line by line. It:

- opens **one** spreadsheet (the response sheet) and **one** folder (the reports folder), both by an ID
  stored in the project's own settings, which only the owner can change;
- creates report documents only when a committee member asks for one, and only in that folder;
- sends four kinds of fixed-wording email;
- contacts one outside address, Google's own sign-in check;
- **never** shares, copies, lists, searches, moves to the bin or deletes any file; never reads email,
  calendar or contacts; never reads any other sheet, document or folder.

Email permission is **send-only** ("Send email as you"); the backend cannot read, search or delete
mail. Two other permissions (Sheets, Drive) are broader than the code's use and could perhaps be narrowed
further; see *Recommendations*.

## 1. The backend (Apps Script project attached to the response sheet)

It runs as its owner (the convener after the handover) and can be called by anyone on the internet,
because the form calls it without a Google sign-in of its own. What a caller can make it do is
limited by the code below, not by Google.

| Permission on Google's screen | Why it is there | What the code does with it | Could it be narrower? |
|---|---|---|---|
| See, edit, create and delete **all your spreadsheets** (`spreadsheets`) | Write responses | Opens only the response sheet (`SPREADSHEET_ID`). Adds rows; deletes rows of **one submission** when it is edited (after checking the editor is its submitter or PI), and the setup test row; writes header rows; removes the empty "Sheet1" at setup | Perhaps: `spreadsheets.currentonly` (only the attached sheet). Needs the code to use the attached sheet instead of opening it by ID; to be tested in a rehearsal |
| See, edit, create and delete **all your Google Drive files** (`drive`) | Put reports in the reports folder | Creates the reports folder once (setup); checks it exists; moves each new report into it from My Drive. Nothing else | Perhaps: `drive.file` (only files the project created). To be tested |
| See, edit, create and delete **all your Google Docs** (`documents`) | Write reports | Creates a new document per report, only from the *Generate Report* menu item | No: creating documents needs this |
| **Send email as you** (`script.send_mail`) | Send emails | Sends only: the confirmation to the submitter and a notice to the PI named in the form (an `@iiserb.ac.in` address only), each with a plain-text summary of that group's own answers as recorded, so the PI can review them; the committee's follow-up (menu item, with an optional note), and the setup email. Cannot read, search or delete mail | Already the narrowest (Apps Script's `MailApp`, a Google service; nothing runs on the user's computer) |
| Connect to an external service (`script.external_request`) | Check the respondent's Google sign-in | One address only: `https://oauth2.googleapis.com/tokeninfo` (Google's own) | No |
| Display and run content inside Google applications (`script.container.ui`) | The HPC Committee menu in the sheet | Adds the menu; shows its messages | No |
| See your primary email address (`userinfo.email`) | Setup sends its test email to the owner | Reads the owner's own address, once, at setup | No |

**Who can submit and edit.** A submission is accepted only with a valid Google sign-in issued for this
form (checked with Google), from a verified `@iiserb.ac.in` account. An edit replaces a submission only
if the signed-in person submitted it or is its PI. One submission is processed at a time. Typed answers
cannot become formulas in the sheet.

**What an anonymous caller can learn.** Whether submissions are open and the closing date; with
`?check=setup`, whether the backend is set up (yes/no answers and a one-way digest of the sheet's ID, not
the ID). No response data.

**Who can change what it does.** Only editors of the script project, which is the owner alone after the
handover (step 10 checks that nobody else has access, and that the operator has none). The sheet and
folder IDs it uses are in the project's settings, which only editors can change.

## 2. The web form (GitHub Pages)

- **Sign-in** is "Sign in with Google" in identity mode only: the form receives the person's name and
  address, and **no permission to their Drive, mail or anything else**. Nothing is shown to approve
  beyond sharing name and address.
- The sign-in client belongs to the operator's Google Cloud project. It holds no secret and gives the
  operator no access to anyone's data.
- Drafts are kept in the respondent's own browser (local storage) until submitted. The sign-in token is
  not stored.

## 3. The handover session (`tools/handover/`, once, about 20 minutes)

The pipeline signs in with clasp (Google's Apps Script tool). Its permissions are fixed by clasp and
broad: manage Apps Script projects, see names and details of Drive files, read and change files it
creates, use Google Cloud projects. What the pipeline does with them:

- lists the owner's script projects once (to check the Apps Script API is on);
- creates one sheet with its script project, uploads the six backend files, reads them back, deploys the
  web app;
- reads the sharing details of that one sheet (to check who can open it);
- in a rehearsal only, moves that one sheet to the bin.

It **revokes the sign-in at Google** at the end and checks it no longer works; the session file never
leaves the operator's computer and is deleted. The convener can also remove "clasp" at any time at
<https://myaccount.google.com/connections>.

## 4. The analysis notebooks (Google Colab, run by the convener)

- Colab's sign-in (`auth.authenticate_user`) gives the notebook session broad access to the person's
  Google account (Google Cloud and Drive, as listed on Colab's screen), for that session only.
- The code reads the response sheet's tabs by its ID, and appends one row to its **Scenarios** tab when
  a scenario is saved (creating the tab the first time). It writes nothing else. The report is a file
  downloaded to the convener's computer.
- **The helper code is downloaded from the public GitHub repository at run time**, at the release named
  by `REPO_REF` (a git tag), not the latest `main`. Changes to the repository reach the convener's
  notebook only when they set `REPO_REF` to a newer release. Each report records the release and its
  commit.

## 5. Things worth knowing

1. **PI addresses are institute addresses only.** The form shows `@iiserb.ac.in` as a fixed suffix and
   the backend refuses any other PI address, so the PI notice cannot be sent outside the institute.
2. **Emails come from the owner's account** and appear in its Sent folder. After the handover, that is
   the convener's.
3. **The form's page is published by whoever controls the GitHub repository.** That person could change
   future versions of the page. Every change is public in the repository's history.
4. Errors are logged in the project's execution log, visible only to its editors.

## Recommendations

1. **Send-only email. Done (2026-11-23).** `GmailApp` replaced by `MailApp`; `mail.google.com` replaced
   by `script.send_mail`. The handover tests fail if full Gmail access returns.
2. **Only `@iiserb.ac.in` PI addresses. Done (2026-11-23).** Fixed suffix in the form (2.7.1) and a check
   in the backend.
3. **Notebooks pinned to a release. Done (2026-11-23).** `REPO_REF` is a release tag (first:
   `v3-2026-11-23`); each report records it with its commit, and responses from a form version the code
   was not written for give a warning. A tag can in principle be moved by the repository's owner; the
   commit recorded in each report shows if that ever happened. For still more control the committee can
   keep its own copy (fork) of the repository.
4. **Possible further narrowing, if wanted:** `spreadsheets.currentonly` and `drive.file`. Both need code
   changes and a rehearsal to confirm that Google allows them for a web app; not needed for safety, since
   the code's reach is already limited as shown above.
