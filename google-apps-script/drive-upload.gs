/**
 * Kyos Matcha CRM — Paid Invoice → Google Drive uploader
 *
 * SETUP:
 * 1. Go to https://script.google.com → New project
 * 2. Delete the default code and paste this entire file
 * 3. Click Deploy → New deployment → type: Web app
 *      - Description: Kyos invoice upload
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 4. Click Deploy → authorise with your Google account when asked
 * 5. Copy the Web app URL (ends in /exec) and paste it into
 *    CRM → Settings → Google Drive Webhook URL
 *
 * Invoices are saved to: My Drive / Kyos Matcha — Paid Invoices / <Month Year> /
 * Filename: KM-XXX — Partner Name.pdf
 */

const ROOT_FOLDER_NAME = 'Kyos Matcha — Paid Invoices'

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents)
    const { invoice_number, partner_name, pdf_url, date } = data

    if (!invoice_number || !pdf_url) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Missing invoice_number or pdf_url' }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    // Download the PDF from Supabase Storage
    const response = UrlFetchApp.fetch(pdf_url)
    const blob = response.getBlob().setName(`${invoice_number} — ${partner_name || 'Unknown'}.pdf`)

    // Get or create root folder
    let root
    const rootIter = DriveApp.getFoldersByName(ROOT_FOLDER_NAME)
    root = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(ROOT_FOLDER_NAME)

    // Get or create month subfolder e.g. "June 2026"
    const d = date ? new Date(date) : new Date()
    const monthName = Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMMM yyyy')
    let monthFolder
    const monthIter = root.getFoldersByName(monthName)
    monthFolder = monthIter.hasNext() ? monthIter.next() : root.createFolder(monthName)

    // If a file with the same invoice number already exists, replace it
    const existing = monthFolder.getFilesByName(blob.getName())
    while (existing.hasNext()) {
      existing.next().setTrashed(true)
    }

    const file = monthFolder.createFile(blob)

    return ContentService.createTextOutput(JSON.stringify({ ok: true, file: file.getName(), folder: monthName }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}
