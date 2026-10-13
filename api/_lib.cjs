// Shared helpers for API routes — mirrors src/lib/utils.js and src/lib/inventory.js

function lineItemKg(li) {
  const desc = (li.desc || '').toLowerCase()
  if (desc.includes('tin 30g') || desc.includes('30g ceremonial') || desc.includes('30g retail')) return (Number(li.qty) || 0) * 0.03
  if (desc.includes('tin 50g')) return (Number(li.qty) || 0) * 0.05
  if (desc.includes('tin 100g')) return (Number(li.qty) || 0) * 0.1
  if (desc.includes('50g') || desc.includes('retail pouch') || (desc.includes('pouch') && !desc.includes('matcha')))
    return (Number(li.qty) || 0) * 0.05
  if (desc.includes('starter kit') || desc.includes('whisk') || desc.includes('shelf') ||
      desc.includes('shipping') || desc.includes('spoon') || desc.includes('fees'))
    return 0
  const kgMatch = desc.match(/(\d+(?:\.\d+)?)\s*kg/)
  if (kgMatch && desc.includes('matcha')) return Number(kgMatch[1]) * (Number(li.qty) || 1)
  if (desc.includes('matcha')) return Number(li.qty) || 0
  return 0
}

function matchSku(desc) {
  const d = (desc || '').toLowerCase()
  if (d.includes('matcha aaa') || d.includes('aaa')) return 'MATCHA-AAA'
  if (d.includes('matcha a') || (d.includes('matcha') && !d.includes('aaa'))) return 'MATCHA-A'
  return null
}

function fmtDate(d) {
  if (!d) return ''
  try { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` } catch { return d }
}

function auth(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return false
  return header.slice(7) === process.env.CRM_API_KEY
}

async function generatePdf({ invoiceNumber, invoiceDate, billTo, fromAddress, banking, lineItems, subtotal, total, invoiceNote }) {
  const PDFDocument = require('pdfkit')
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 52 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const GREEN = '#3D6034', LGRAY = '#6b7280', DARK = '#111111', LGGREEN = '#EEF3EC'
    const L = 52, R = 543, W = R - L

    // ── Header ──────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').fillColor(GREEN).text(fromAddress.name || 'Kyos Matcha', L, 52, { continued: false })
    doc.fontSize(16).font('Helvetica-Bold').fillColor(DARK).text(invoiceNumber, L, 52, { align: 'right', width: W })
    doc.fontSize(9).font('Helvetica').fillColor(LGRAY).text(`Invoice Date: ${fmtDate(invoiceDate)}`, L, 76, { align: 'right', width: W })

    // ── FROM / BILL TO ───────────────────────────────────────────────────────
    const sY = 115
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#9ca3af').text('FROM', L, sY)
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(fromAddress.name || 'Kyos Matcha', L, sY + 13)
    doc.fontSize(9).font('Helvetica').fillColor(LGRAY)
      .text(fromAddress.line1 || '30 Seagull Lane', L, sY + 27)
      .text(fromAddress.line2 || 'E16 1PY, London', L, sY + 40)

    const bX = 260
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#9ca3af').text('BILL TO', bX, sY)
    doc.fontSize(10).font('Helvetica-Bold').fillColor(DARK).text(billTo.name || '—', bX, sY + 13)
    let bY = sY + 27
    doc.fontSize(9).font('Helvetica').fillColor(LGRAY)
    if (billTo.contact) { doc.text(billTo.contact, bX, bY); bY += 13 }
    if (billTo.address) {
      const lines = billTo.address.split('\n')
      lines.forEach(ln => { doc.text(ln, bX, bY); bY += 13 })
    }
    if (billTo.email) doc.text(billTo.email, bX, bY)

    // ── Table ────────────────────────────────────────────────────────────────
    const tY = 210
    const cols = { desc: L, qty: 320, price: 390, total: 463 }
    const colW = { desc: 258, qty: 60, price: 70, total: 80 }

    // Header row
    doc.rect(L, tY, W, 26).fill(GREEN)
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#ffffff')
      .text('Description', cols.desc + 8, tY + 8, { width: colW.desc })
      .text('Qty', cols.qty, tY + 8, { width: colW.qty, align: 'right' })
      .text('Unit Price', cols.price, tY + 8, { width: colW.price, align: 'right' })
      .text('Total', cols.total, tY + 8, { width: colW.total, align: 'right' })

    let rY = tY + 26
    lineItems.forEach((item, idx) => {
      const h = 24
      doc.rect(L, rY, W, h).fill(idx % 2 === 1 ? '#fafafa' : '#ffffff')
      doc.rect(L, rY, W, h).stroke('#f3f4f6')
      const isFOC = item.desc === 'Retail Shelf (Free of Charge)'
      doc.fontSize(9).font('Helvetica').fillColor(DARK)
        .text(item.desc || '', cols.desc + 8, rY + 7, { width: colW.desc - 8 })
        .text(String(item.qty), cols.qty, rY + 7, { width: colW.qty, align: 'right' })
      doc.fillColor(isFOC ? LGRAY : DARK)
        .text(isFOC ? 'Free of Charge' : `£${Number(item.price).toFixed(2)}`, cols.price, rY + 7, { width: colW.price, align: 'right' })
      doc.fillColor(isFOC ? GREEN : DARK)
        .text(isFOC ? 'FOC' : `£${(item.qty * item.price).toFixed(2)}`, cols.total, rY + 7, { width: colW.total, align: 'right' })
      rY += h
    })

    // ── Totals ───────────────────────────────────────────────────────────────
    rY += 12
    doc.fontSize(9).font('Helvetica').fillColor(LGRAY).text('Subtotal', cols.price, rY, { width: colW.price, align: 'left' })
    doc.fillColor(DARK).text(`£${subtotal.toFixed(2)}`, cols.total, rY, { width: colW.total, align: 'right' })
    rY += 14
    doc.moveTo(cols.price, rY).lineTo(R, rY).strokeColor('#f3f4f6').stroke()
    rY += 6
    doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK)
      .text('Total', cols.price, rY, { width: colW.price, align: 'left' })
      .text(`£${total.toFixed(2)}`, cols.total, rY, { width: colW.total, align: 'right' })

    rY += 40

    // ── Invoice note ─────────────────────────────────────────────────────────
    if (invoiceNote) {
      const noteH = 32 + (Math.ceil(invoiceNote.length / 80) * 13)
      doc.rect(L, rY, W, noteH).fill('#fffbeb').stroke('#fcd34d')
      doc.fontSize(9).font('Helvetica').fillColor('#92400e').text(invoiceNote, L + 12, rY + 10, { width: W - 24 })
      rY += noteH + 16
    }

    // ── Banking ──────────────────────────────────────────────────────────────
    doc.rect(L, rY, W, 74).fill(LGGREEN).stroke('#b3d0ab')
    doc.fontSize(9).font('Helvetica-Bold').fillColor(GREEN).text('BANKING DETAILS', L + 16, rY + 10)
    doc.fontSize(9).font('Helvetica').fillColor('#374151')
      .text(`Account Name: `, L + 16, rY + 26, { continued: true }).font('Helvetica-Bold').text(banking.accountName || 'KM WELNESS LTD')
      .font('Helvetica').text(`Sort Code: `, L + 16, rY + 41, { continued: true }).font('Helvetica-Bold').text(banking.sortCode || '04-00-05')
      .font('Helvetica').text(`Account Number: `, L + 16, rY + 56, { continued: true }).font('Helvetica-Bold').text(banking.accountNumber || '86383529')

    rY += 92

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.moveTo(L, rY).lineTo(R, rY).strokeColor('#f3f4f6').stroke()
    doc.fontSize(9).font('Helvetica').fillColor('#9ca3af')
      .text('Thank you for your business · kyosmatcha.com · partners@kyosmatcha.com', L, rY + 12, { align: 'center', width: W })

    doc.end()
  })
}

module.exports = { lineItemKg, matchSku, fmtDate, auth, generatePdf }
