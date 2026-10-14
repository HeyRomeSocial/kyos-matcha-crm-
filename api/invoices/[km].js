// GET  /api/invoices/:km/pdf  — return PDF redirect
// PATCH /api/invoices/:km      { status: "paid" } — mark paid
import { createClient } from '@supabase/supabase-js'
import { auth } from '../_lib.js'

function getDb() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' })

  const km = req.query.km?.toUpperCase()
  if (!km) return res.status(400).json({ error: 'Missing invoice number' })

  const db = getDb()
  const { data: order } = await db.from('orders').select('*').eq('invoice_number', km).maybeSingle()
  if (!order) return res.status(404).json({ error: `Invoice ${km} not found` })

  // GET /api/invoices/KM-xxx/pdf — redirect to PDF URL
  if (req.method === 'GET') {
    if (!order.invoice_pdf_url) return res.status(404).json({ error: 'No PDF stored for this invoice' })
    return res.redirect(302, order.invoice_pdf_url)
  }

  // PATCH /api/invoices/KM-xxx { status: "paid" }
  if (req.method === 'PATCH') {
    const { status } = req.body || {}
    if (status !== 'paid') return res.status(400).json({ error: 'Only status "paid" is supported' })
    const { error } = await db.from('orders').update({ status: 'paid' }).eq('id', order.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ invoice_number: km, status: 'paid' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
