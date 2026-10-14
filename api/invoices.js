// POST /api/invoices — create an invoice programmatically
import { createClient } from '@supabase/supabase-js'
import { lineItemKg, matchSku, auth, generatePdf } from './_lib.js'

function getDb() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const db = getDb()
  const { partner_id, partner_name, bill_to, line_items, invoice_date, note, idempotency_key } = req.body || {}

  // ── Idempotency ────────────────────────────────────────────────────────────
  if (idempotency_key) {
    const { data: existing } = await db.from('orders').select('*').eq('idempotency_key', idempotency_key).maybeSingle()
    if (existing) {
      return res.status(200).json({
        invoice_number: existing.invoice_number,
        invoice_id: existing.id,
        status: existing.status,
        subtotal: existing.subtotal,
        total: existing.total,
        pdf_url: existing.invoice_pdf_url,
        pdf_base64: null,
        pack_order_created: null,
      })
    }
  }

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!Array.isArray(line_items) || line_items.length === 0)
    return res.status(400).json({ error: 'line_items must be a non-empty array' })

  for (const li of line_items) {
    const desc = li.product || li.desc || li.description || ''
    if (!desc) return res.status(400).json({ error: 'Each line item requires a product/desc field' })
    if (Number(li.qty) <= 0) return res.status(400).json({ error: `Invalid qty for "${desc}"` })
    if (Number(li.unit_price ?? li.price ?? -1) < 0) return res.status(400).json({ error: `Invalid unit_price for "${desc}"` })
  }

  if (!partner_id && !partner_name && !bill_to?.business_name)
    return res.status(400).json({ error: 'Provide partner_id, partner_name, or bill_to.business_name' })

  // ── Partner lookup ─────────────────────────────────────────────────────────
  let partner = null
  if (partner_id) {
    const { data } = await db.from('partners').select('*').eq('id', partner_id).maybeSingle()
    partner = data
    if (!partner) return res.status(404).json({ error: `Partner not found: ${partner_id}` })
  } else if (partner_name) {
    const { data } = await db.from('partners').select('*').ilike('name', `%${partner_name}%`).limit(1)
    partner = data?.[0] || null
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  const { data: settings } = await db.from('settings').select('*').eq('id', 1).maybeSingle()
  const fromAddress = {
    name: settings?.from_name || 'Kyos Matcha',
    line1: settings?.from_line1 || '30 Seagull Lane',
    line2: settings?.from_line2 || 'E16 1PY, London',
  }
  const banking = {
    accountName: settings?.bank_name || 'KM WELNESS LTD',
    sortCode: settings?.bank_sort || '04-00-05',
    accountNumber: settings?.bank_account || '86383529',
  }

  const billTo = {
    name: bill_to?.business_name || partner?.name || '',
    contact: bill_to?.contact_name || partner?.contact_name || '',
    address: bill_to?.address || partner?.address || '',
    email: bill_to?.email || partner?.email || '',
  }

  // Use line items exactly as sent — caller is responsible for delivery line items
  const items = line_items.map(li => ({
    desc: li.product || li.desc || li.description || '',
    qty: Number(li.qty),
    price: Number(li.unit_price ?? li.price ?? 0),
  }))

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const total = subtotal
  const invoiceDate = invoice_date || new Date().toISOString().slice(0, 10)
  const invoiceNote = note || ''

  // ── Next invoice number ────────────────────────────────────────────────────
  let invoiceNumber, orderId
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: allOrders } = await db.from('orders').select('invoice_number')
    const used = (allOrders || [])
      .map(o => parseInt(o.invoice_number?.replace('KM-', '') || '0'))
      .filter(n => !isNaN(n))
    const next = (used.length ? Math.max(...used) : 169) + 1
    invoiceNumber = `KM-${next}`

    const { data: inserted, error: insertErr } = await db.from('orders').insert({
      invoice_number: invoiceNumber,
      partner_id: partner?.id || null,
      partner_name: partner?.name || billTo.name,
      date: invoiceDate,
      line_items: items,
      subtotal,
      total,
      status: 'unpaid',
      idempotency_key: idempotency_key || null,
    }).select().single()

    if (insertErr?.code === '23505') continue
    if (insertErr) return res.status(500).json({ error: insertErr.message })

    orderId = inserted.id
    break
  }
  if (!orderId) return res.status(500).json({ error: 'Could not allocate invoice number' })

  try {
    // ── Generate PDF ──────────────────────────────────────────────────────────
    const pdfBuffer = await generatePdf({ invoiceNumber, invoiceDate, billTo, fromAddress, banking, lineItems: items, subtotal, total, invoiceNote })

    const slug = (partner?.name || billTo.name || '').replace(/[^a-zA-Z0-9]/g, '').trim()
    const filename = `${slug ? slug + '_' : ''}${invoiceNumber}.pdf`
    const { error: uploadErr } = await db.storage.from('invoices').upload(filename, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (uploadErr) throw new Error('PDF upload failed: ' + uploadErr.message)

    const { data: { publicUrl } } = db.storage.from('invoices').getPublicUrl(filename)
    await db.from('orders').update({ invoice_pdf_url: publicUrl }).eq('id', orderId)

    // ── Deduct inventory (bulk matcha only — qty = kg) ────────────────────────
    const { data: invItems } = await db.from('inventory').select('*')
    if (invItems?.length) {
      for (const li of items) {
        const d = li.desc.toLowerCase()
        // Skip non-matcha and retail items (tins/pouches handled by separate retail stock)
        if (!d.includes('matcha')) continue
        if (d.includes('50g') || d.includes('pouch') || d.includes('starter kit') ||
            d.includes('shipping') || d.includes('spoon') || d.includes('tin')) continue
        const sku = matchSku(li.desc)
        if (!sku) continue
        const invItem = invItems.find(i => i.sku === sku)
        if (!invItem) continue
        const newStock = Math.max(Number(invItem.stock_kg) - li.qty, 0)
        await db.from('inventory').update({ stock_kg: newStock, updated_at: new Date().toISOString() }).eq('id', invItem.id)
        await db.from('inventory_transactions').insert({
          inventory_id: invItem.id, order_id: orderId, type: 'sale',
          qty_change: -li.qty, notes: `Invoice ${invoiceNumber}`
        })
      }
    }

    // ── Update partner stats + promote prospect/sample_sent → active ──────────
    if (partner) {
      const matchaKg = items.reduce((s, li) => s + lineItemKg(li), 0)
      const update = {
        last_order_date: invoiceDate,
        total_orders: (partner.total_orders || 0) + 1,
        total_kg: (partner.total_kg || 0) + matchaKg,
        total_spent: (partner.total_spent || 0) + total,
      }
      if (partner.status === 'sample_sent' || partner.status === 'prospect') update.status = 'active'
      await db.from('partners').update(update).eq('id', partner.id)
    }

    // ── Create order-to-pack (mandatory — one invoice = one pack order) ───────
    const kgTotal = items.reduce((s, li) => s + lineItemKg(li), 0)
    const packNotes = [
      `Invoice ${invoiceNumber}`,
      billTo.address ? `Delivery: ${billTo.address}` : null,
      `invoice_created: true`,
    ].filter(Boolean).join(' | ')

    const { data: packRow, error: packErr } = await db.from('order_inbox').insert({
      email_id: `api-${invoiceNumber}`,
      received_at: new Date().toISOString(),
      from_email: 'api',
      from_name: partner?.name || billTo.name,
      subject: `Order ${invoiceNumber}`,
      parsed_partner: partner?.name || billTo.name,
      parsed_product: items.map(li => `${li.qty}x ${li.desc}`).join(', '),
      parsed_quantity_kg: kgTotal || null,
      parsed_notes: packNotes,
      status: 'pending',
    }).select('id').single()

    if (packErr) {
      console.error('order_inbox insert failed:', packErr.message)
    }

    return res.status(200).json({
      invoice_number: invoiceNumber,
      invoice_id: orderId,
      status: 'unpaid',
      subtotal,
      total,
      pdf_url: publicUrl,
      pdf_base64: pdfBuffer.toString('base64'),
      pack_order_created: !packErr,
      pack_order_id: packRow?.id || null,
    })
  } catch (err) {
    await db.from('orders').delete().eq('id', orderId)
    return res.status(500).json({ error: err.message })
  }
}
