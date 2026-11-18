/**
 * Menu.gs — the HPC Committee menu on the response sheet.
 *
 * This file is NOT part of the web-app project. It goes in a separate Apps Script
 * project bound to "HPC Questionnaire Response v3" (open the sheet → Extensions →
 * Apps Script), which uses the web-app project as a library with the identifier HPC.
 * Setup: apps-script/sheet-menu/README.md.
 *
 * The menu is built here rather than in the library, because onOpen is a simple
 * trigger and the library would have to load without authorisation. Each item
 * calls the library's function of the same name, which runs against this sheet
 * and reads the library's Script Properties (SPREADSHEET_ID, COMMITTEE_FOLDER_ID).
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('HPC Committee')
    .addItem('📋 Generate Report for Selected Row', 'generateReportForSelected')
    .addItem('⚙️ Initialize Sheets', 'initializeSheets')
    .addSeparator()
    .addItem('📧 Send Follow-up to Selected', 'sendFollowUpEmail')
    .addToUi();
}

function generateReportForSelected() { HPC.generateReportForSelected(); }
function initializeSheets()          { HPC.initializeSheets(); }
function sendFollowUpEmail()         { HPC.sendFollowUpEmail(); }
