# HPC Questionnaire Backend — Deployment Guide

This guide walks you through setting up the Google Workspace backend for the
HPC Questionnaire form. Follow each step in order.

---

## Step 1: Set up Google Sign-In

You need a Google Cloud project to issue OAuth 2.0 credentials for Google Sign-In.

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project selector at the top → **New Project**.
   - Name it something like "HPC Questionnaire" and click **Create**.
3. In the left sidebar, go to **APIs & Services → Library**.
   - Search for **"Google Identity"** and enable it.
4. Go to **APIs & Services → Credentials**.
   - Click **+ Create Credentials → OAuth 2.0 Client ID**.
   - Application type: **Web application**.
   - Name: "HPC Questionnaire Web App" (or anything descriptive).
5. Under **Authorised JavaScript origins**, add:
   - `http://localhost:5173` (for local development)
   - Your production URL when you have one (e.g. `https://hpc-form.iiserb.ac.in`)
6. Click **Create**.
7. A dialog will show your **Client ID** (ends in `.apps.googleusercontent.com`).
   Copy it — you will need it in Step 6.

---

## Step 2: Create the Google Spreadsheet

This spreadsheet will receive all questionnaire submissions.

1. Open [Google Drive](https://drive.google.com) (sign in with your IISER account).
2. Click **+ New → Google Sheets**.
3. Name the sheet: **HPC Questionnaire Responses**.
4. Copy the spreadsheet ID from the URL bar.
   The URL looks like:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```
   Copy the long string between `/d/` and `/edit`.

---

## Step 3: Create the committee reports folder

Committee report documents will be saved here.

1. In Google Drive, click **+ New → Folder**.
2. Name the folder: **HPC Committee Reports**.
3. Right-click the folder → **Share** → share with all committee members (as Editors).
4. Open the folder and copy the folder ID from the URL bar.
   The URL looks like:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID
   ```
   Copy the long string after `/folders/`.

---

## Step 4: Deploy the Apps Script

This is the backend that receives form submissions.

1. Go to [script.google.com](https://script.google.com).
2. Click **+ New project**.
3. Name the project: **HPC Questionnaire Backend**.
4. In the editor, you will see a default `Code.gs` file. **Delete all its contents.**
5. Create the following script files (click the **+** button next to "Files" and choose **Script** for each):
   - `Code.gs`
   - `SheetWriter.gs`
   - `ReportGenerator.gs`
6. Copy the contents of each file from the `apps-script/` folder in this repository
   into the corresponding file in the Apps Script editor.
7. Click the **gear icon** (Project Settings) in the left sidebar.
8. Scroll to **Script Properties** and click **Add script property** for each of:
   - Property: `SPREADSHEET_ID`   Value: (paste the ID from Step 2)
   - Property: `COMMITTEE_FOLDER_ID`   Value: (paste the folder ID from Step 3)
9. Click **Save script properties**.
10. Click **Deploy → New deployment**.
    - Click the gear icon next to "Select type" and choose **Web app**.
    - Description: "HPC Questionnaire Backend v1"
    - Execute as: **Me**
    - Who has access: **Anyone**
    - Click **Deploy**.
11. Authorise the app when prompted (you will be asked to grant permissions to
    access Sheets, Drive, Gmail, and Docs — these are all required).
12. Copy the **Web App URL** that appears after deployment.
    It looks like: `https://script.google.com/macros/s/AKfy.../exec`

---

## Step 5: Initialise the spreadsheet

This creates all the tabs with correct headers.

1. Open the Google Spreadsheet you created in Step 2.
2. You should see an **HPC Committee** menu in the menu bar.
   (If not, refresh the page — it may take a moment to appear.)
3. Click **HPC Committee → Initialize Sheets**.
4. Click through any permission prompts.
5. The spreadsheet will now have 16 tabs (Submissions, RespondentInfo, Workloads, etc.),
   each with a formatted header row.

---

## Step 6: Configure the React form

1. In the project folder, copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` in a text editor and fill in:
   ```
   VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
   VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
   ```
   Replace `YOUR_SCRIPT_ID` with the ID from the Web App URL (Step 4),
   and `YOUR_CLIENT_ID` with the OAuth Client ID (Step 1).

---

## Step 7: Test locally

1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:5173](http://localhost:5173) in your browser.
3. Fill in a test submission (a few fields in Section A is sufficient).
4. Click **Sign in with Google** and sign in with your `@iiserb.ac.in` account.
5. Click **Submit**.
6. Check the Google Spreadsheet — new rows should appear in the Submissions tab
   and in each relevant section tab.
7. Check your IISER email — you should receive a confirmation email.

---

## Step 8: Generate a test committee report

1. Open the Google Spreadsheet.
2. Click on the **Submissions** tab.
3. Click on the row for your test submission.
4. Click **HPC Committee → Generate Report for Selected Row**.
5. A Google Doc will be created in your **HPC Committee Reports** folder.
6. Open the folder in Drive to find the report.

---

## Step 9: Share the form with colleagues

When you are ready to share the form publicly:

1. Build the production bundle:
   ```bash
   npm run build
   ```
   This creates a `dist/` folder containing the compiled HTML, CSS, and JS.

2. **Hosting options:**

   **Option A — GitHub Pages (free)**
   - Push the repository to GitHub.
   - Go to Settings → Pages → Source: `dist/` folder (or use a GitHub Actions workflow).

   **Option B — Any static web host**
   - Upload the contents of `dist/` to any static hosting service
     (Netlify, Vercel, AWS S3, IISER web server, etc.).

   **Option C — Local/institutional server**
   - Copy `dist/` to a directory served by your institution's web server.

3. After hosting, add the production URL to your OAuth 2.0 Client ID in
   Google Cloud Console (Step 1 → Authorised JavaScript origins).

4. Redeploy the Apps Script if needed (Deploy → Manage deployments → Edit).

---

## Troubleshooting

**"Invalid Google credential" error when submitting**
- The Google ID token has expired (they last about 1 hour). Reload the page and sign in again.
- Check that the Web App URL in `.env.local` is correct.

**Submissions are not appearing in the spreadsheet**
- Check the Apps Script execution logs: in the Apps Script editor, click
  **Executions** in the left sidebar.
- Make sure SPREADSHEET_ID is set correctly in Script Properties.

**"HPC Committee" menu does not appear in the spreadsheet**
- Refresh the spreadsheet.
- If it still does not appear, open the Apps Script editor, select `Code.gs`,
  and run the `onOpen` function manually (Run → Run function → onOpen).

**Google Sign-In button does not appear**
- Check the browser console for errors related to `accounts.google.com/gsi/client`.
- Make sure `VITE_GOOGLE_CLIENT_ID` is set in `.env.local`.
- Make sure `http://localhost:5173` is in the list of Authorised JavaScript origins.

**Confirmation email not received**
- Check the Gmail spam folder.
- Check the Apps Script execution logs for email errors.
- Make sure `A_pi_email` is filled in on the form.
