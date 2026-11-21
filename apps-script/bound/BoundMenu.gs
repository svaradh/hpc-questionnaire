/**
 * BoundMenu.gs — the HPC Committee menu, for a script project attached to the
 * response sheet (set up by the handover pipeline, tools/handover/). The functions
 * are in the same project, so no library is needed (compare apps-script/sheet-menu/,
 * used with the standalone v3 project).
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
