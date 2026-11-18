# HPC Committee menu on the response sheet

The v3 web-app project is standalone, so it cannot add a menu to the sheet. A second, tiny project bound to the
sheet adds the menu and calls the web-app project as a library. The code stays in one place: pasting new
`*.gs` files into the web-app project updates the menu's behaviour too.

## One-time setup

1. **Make the web-app project a library.** In the v3 web-app project: Project Settings (gear) → copy the
   **Script ID**. Then Deploy → New deployment → gear → **Library** → Deploy. (This does not change the web app
   or its URL.)
2. **Create the bound project.** Open "HPC Questionnaire Response v3" → Extensions → Apps Script. Name it
   "HPC Committee menu".
3. **Add the library.** Libraries **+** → paste the Script ID → Look up → Version: **HEAD (Development mode)** →
   Identifier: change the suggested name (taken from the project name) to `HPC`, which `Menu.gs` uses → Add. Development mode follows the latest pasted code, so no new library version is
   needed after an update.
4. **Add the menu.** Open `Menu.gs` (in this folder), copy its whole contents (the `onOpen` function and the
   three one-line functions below it), paste them over everything in the bound project's `Code.gs`, and save.
5. **Reload the sheet** (no need to Run anything: `onOpen` runs on every load). The **HPC Committee** menu
   appears after a few seconds; the first item you use asks for permission (Sheets, Drive, Docs, Gmail).

## Notes

- Script Properties stay in the web-app project; the bound project needs none.
- Anyone else who uses the menu (e.g. the convener) needs edit access to the sheet and at least view access to
  the web-app project, since a library in development mode is read from it.
- Do not paste `Menu.gs` into the web-app project: its wrappers have the same names as the library's functions.
