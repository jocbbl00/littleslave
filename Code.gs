// =============================================
// SPLITTAB — Google Apps Script Backend
// Paste this entire file into Google Apps Script
// Deploy as Web App: Execute as "Me", Access "Anyone"
// =============================================

const SHEET_ID = '1GQqW4jMK-r7V_Ne7m8nkw1ogpvwwAQ40Lc6B0zw4HvY';
const SHEET_NAME = 'Expenses';
const HEADERS = ['ID', 'Date', 'Description', 'Payer', 'Amount', 'SplitType', 'AmountOwed', 'Emoji', 'Category'];

// ─── Bootstrap: ensure the sheet + headers exist ──────────────────────────
function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ─── Category name lookup (emoji → text) ──────────────────────────────────
const GS_CAT_NAMES = {
  '🍽️': 'Food & Drinks', '🚗': 'Transport', '🛒': 'Grocery',
  '🎮': 'Entertainment', '🏨': 'Hotel/Stay', '✈️': 'Travel',
  '💡': 'Utilities', '💊': 'Health', '🎁': 'Gifts', '💰': 'Other'
};

// ─── Update summary row at the bottom ─────────────────────────────────────
function updateSummary(sheet) {
  const data = sheet.getDataRange().getValues();

  // Remove any existing summary rows (rows starting with "SUMMARY")
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]).startsWith('SUMMARY')) {
      sheet.deleteRow(i + 1);
    }
  }

  // Recalculate from fresh data (after deletion)
  const fresh = sheet.getDataRange().getValues();
  const rows = fresh.slice(1); // skip header

  let yarinTotal = 0, catTotal = 0, totalAmount = 0, yarinNet = 0;
  rows.forEach(row => {
    const payer = row[3];
    const amount = parseFloat(row[4]) || 0;
    const amountOwed = parseFloat(row[6]) || 0;
    totalAmount += amount;
    if (payer === 'Yarin') {
      yarinTotal += amount;
      yarinNet += amountOwed; // Cat owes Yarin this much
    } else {
      catTotal += amount;
      yarinNet -= amountOwed; // Yarin owes Cat this much
    }
  });

  const absNet = Math.abs(yarinNet);
  let balanceStr;
  if (absNet < 0.01) {
    balanceStr = '✅ All settled up!';
  } else if (yarinNet > 0) {
    balanceStr = `Cat owes Yarin $${absNet.toFixed(2)}`;
  } else {
    balanceStr = `Yarin owes Cat $${absNet.toFixed(2)}`;
  }

  // Append blank separator row
  sheet.appendRow(['', '', '', '', '', '', '']);

  // Append summary row
  const lastRow = sheet.getLastRow();
  sheet.appendRow([
    'SUMMARY',
    new Date().toISOString().slice(0, 10),
    `${rows.length} transactions`,
    `Yarin: $${yarinTotal.toFixed(2)} | Cat: $${catTotal.toFixed(2)}`,
    totalAmount.toFixed(2),
    'BALANCE →',
    balanceStr
  ]);
  // Bold the summary row only
  sheet.getRange(sheet.getLastRow(), 1, 1, HEADERS.length).setFontWeight('bold');
}

// ─── GET: fetch all expenses ───────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    if (action === 'getAll') {
      const sheet = getOrCreateSheet();
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return jsonResponse({ success: true, expenses: [] });
      }
      const headers = data[0];
      // Skip header, skip blank rows, skip SUMMARY rows
      const expenses = data.slice(1)
        .filter(row => row[0] && !String(row[0]).startsWith('SUMMARY') && row[0] !== '')
        .map(row => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = row[i]);
          obj.Amount = parseFloat(obj.Amount) || 0;
          obj.AmountOwed = parseFloat(obj.AmountOwed) || 0;
          return obj;
        });
      expenses.reverse();
      return jsonResponse({ success: true, expenses });
    }

    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── POST: add or delete an expense ───────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'add') {
      const sheet = getOrCreateSheet();
      // Use the emoji chosen by the user in the app
      const emoji = payload.emoji || '💰';
      const category = GS_CAT_NAMES[emoji] || 'Other';
      const row = [
        payload.id,
        payload.date,
        payload.desc,
        payload.payer,
        payload.amount,
        payload.split,
        payload.amountOwed,
        emoji,
        category
      ];
      sheet.appendRow(row);
      updateSummary(sheet);
      return jsonResponse({ success: true });
    }

    if (action === 'delete') {
      const sheet = getOrCreateSheet();
      const data = sheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][0]) === String(payload.id)) {
          sheet.deleteRow(i + 1);
          updateSummary(sheet);
          return jsonResponse({ success: true });
        }
      }
      return jsonResponse({ success: false, error: 'Row not found' });
    }

    if (action === 'clear') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const sheet = getOrCreateSheet();
      const data = sheet.getDataRange().getValues();

      // Only archive if there's actual data (more than just the header row)
      const realRows = data.slice(1).filter(row =>
        row[0] && !String(row[0]).startsWith('SUMMARY') && row[0] !== ''
      );

      if (realRows.length > 0) {
        // Create timestamped archive tab
        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const archiveName = `Archive ${ts}`;
        const archive = ss.insertSheet(archiveName);

        // Write headers + all real expense rows
        const archiveData = [HEADERS, ...realRows];
        archive.getRange(1, 1, archiveData.length, HEADERS.length).setValues(archiveData);
        archive.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
        archive.setFrozenRows(1);
        archive.autoResizeColumns(1, HEADERS.length);
      }

      // Now clear the main sheet (keep only header)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
