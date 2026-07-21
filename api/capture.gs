/**
 * Spoiled & Iced — vote / pre-order / purchase capture
 * ----------------------------------------------------
 * A tiny Google Apps Script that logs every event from the storefront
 * into a Google Sheet, so you can see what people are voting for and
 * who pre-ordered / bought the Vendors List — no server to run.
 *
 * ONE-TIME SETUP (about 2 minutes):
 *   1. Create a new Google Sheet.
 *   2. Extensions ▸ Apps Script. Delete the sample, paste ALL of this.
 *   3. Deploy ▸ New deployment ▸ type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Copy the Web app URL (ends in /exec).
 *   5. In index.html, set  CONFIG.captureUrl = "that URL";
 *
 * That's it. Every vote, pre-order and purchase now appends a row.
 * (Tip: make a Pivot Table on the "Piece" column to rank most-voted.)
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(4000); } catch (err) {}
  try {
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (er) {}

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Captures') || ss.insertSheet('Captures');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Received', 'Type', 'Piece / Product', 'Category',
                    'Price', 'Voted', 'Vote count', 'Qty', 'Email', 'Raw JSON']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date(),
      data.type || '',
      data.name || data.product || '',
      data.cat || '',
      data.price || '',
      (data.voted === true ? 'yes' : (data.voted === false ? 'removed' : '')),
      (data.count != null ? data.count : ''),
      data.qty || '',
      data.email || '',
      JSON.stringify(data)
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (er) {}
  }
}

function doGet() {
  return ContentService.createTextOutput('Spoiled & Iced capture endpoint is live.');
}
