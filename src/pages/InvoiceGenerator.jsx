import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, calcNextOrder } from '../lib/utils'
import { Plus, Trash2, Save, Search, X, Mail } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

function PartnerSearch({ partners, selectedPartner, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const filtered = query.length > 0
    ? partners.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : partners

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handleSelect(partner) {
    onSelect(partner)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onSelect(null)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      {selectedPartner ? (
        <div className="flex items-center justify-between px-3 py-2 border border-[#3D6034] rounded-lg bg-[#EEF3EC]">
          <span className="text-sm font-medium text-[#3D6034]">{selectedPartner.name}</span>
          <button onClick={handleClear} className="text-[#3D6034] hover:text-[#2E4A27] ml-2">
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-8"
              placeholder="Type to search cafes…"
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              autoComplete="off"
            />
          </div>
          {open && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-400">No cafes found</div>
              ) : filtered.map(p => (
                <button
                  key={p.id}
                  onMouseDown={() => handleSelect(p)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#EEF3EC] hover:text-[#3D6034] transition-colors border-b border-gray-50 last:border-0"
                >
                  <span className="font-medium">{p.name}</span>
                  {p.contact_name && <span className="text-gray-400 ml-2 text-xs">· {p.contact_name}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const FROM_ADDRESS = {
  name: 'Kyos Matcha',
  line1: '30 Seagull Lane',
  line2: 'E16 1PY, London',
}

const BANKING = {
  accountName: 'KM WELLNESS LTD',
  sortCode: '04-00-05',
  accountNumber: '86383529',
}

function newItem(desc = '', qty = 1, price = 0) {
  return { id: Math.random().toString(36).slice(2), desc, qty, price }
}

export default function InvoiceGenerator() {
  const location = useLocation()
  const previewRef = useRef(null)

  const [partners, setPartners] = useState([])
  const [selectedPartner, setSelectedPartner] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('KM-167')
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [lineItems, setLineItems] = useState([newItem('Premium Matcha', 1, 0), newItem('Shipping', 1, 0)])
  const [saving, setSaving] = useState(false)
  const [savedPdfUrl, setSavedPdfUrl] = useState(null)
  // Editable Bill To fields
  const [billTo, setBillTo] = useState({ name: '', address: '', contact: '', email: '' })

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: seq }] = await Promise.all([
        supabase.from('partners').select('*').eq('status', 'active').order('name'),
        supabase.from('invoice_sequence').select('last_number').single(),
      ])
      setPartners(p || [])
      if (seq) setInvoiceNumber(`KM-${seq.last_number + 1}`)

      // Pre-select partner from navigation state
      if (location.state?.partnerId && p) {
        const partner = p.find(x => x.id === location.state.partnerId)
        if (partner) selectPartner(partner)
      }
    }
    load()
  }, [])

  function selectPartner(partner) {
    setSelectedPartner(partner)
    // Pre-fill Bill To from partner data
    setBillTo({
      name: partner.name || '',
      address: partner.address || '',
      contact: partner.contact_name || '',
      email: partner.email || '',
    })
    const items = []
    if (partner.projected_kg_month && partner.price_per_kg) {
      items.push(newItem(`Premium Matcha — ${partner.projected_kg_month}kg`, partner.projected_kg_month, partner.price_per_kg))
    } else {
      items.push(newItem('Premium Matcha', 1, partner.price_per_kg || 0))
    }
    items.push(newItem('Shipping', 1, partner.shipping_fee || 0))
    setLineItems(items)
  }

  function updateItem(id, field, value) {
    setLineItems(items => items.map(item =>
      item.id === id ? { ...item, [field]: field === 'qty' || field === 'price' ? Number(value) : value } : item
    ))
  }

  function removeItem(id) {
    setLineItems(items => items.filter(i => i.id !== id))
  }

  function resetForm() {
    const nextNum = parseInt(invoiceNumber.replace('KM-', '')) + 1
    setInvoiceNumber(`KM-${nextNum}`)
    setInvoiceDate(format(new Date(), 'yyyy-MM-dd'))
    setSelectedPartner(null)
    setBillTo({ name: '', address: '', contact: '', email: '' })
    setLineItems([newItem('Premium Matcha', 1, 0), newItem('Shipping', 1, 0)])
    setSavedPdfUrl(null)
  }

  function openGmail() {
    const to = billTo.email || ''
    const subject = encodeURIComponent(`Invoice ${invoiceNumber} — Kyos Matcha`)
    const body = encodeURIComponent(
`Hi ${billTo.contact || billTo.name},

Please find your invoice ${invoiceNumber} from Kyos Matcha.

You can view and download it here:
${savedPdfUrl}

Invoice Total: £${total.toFixed(2)}
Payment due within 14 days.

Banking Details:
Account Name: KM WELLNESS LTD
Sort Code: 04-00-05
Account Number: 86383529

Thank you for your business.

Kyos Matcha
partners@kyosmatcha.com
kyosmatcha.com`
    )
    window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`, '_blank')
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.qty * i.price), 0)
  const total = subtotal

  async function handleSave() {
    if (!selectedPartner) { toast.error('Please select a partner'); return }
    setSaving(true)
    try {
      // Generate PDF from preview
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const ratio = canvas.height / canvas.width
      const imgHeight = pageWidth * ratio
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(imgHeight, pageHeight))
      const pdfBlob = pdf.output('blob')

      // Upload PDF to Supabase Storage
      const filename = `${invoiceNumber}.pdf`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filename, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(filename)

      // Save order
      const lineItemsClean = lineItems.map(({ id, ...rest }) => rest)
      const { error: orderError } = await supabase.from('orders').insert({
        invoice_number: invoiceNumber,
        partner_id: selectedPartner.id,
        partner_name: selectedPartner.name,
        date: invoiceDate,
        line_items: lineItemsClean,
        subtotal,
        total,
        status: 'unpaid',
        invoice_pdf_url: publicUrl,
      })
      if (orderError) throw orderError

      // Increment invoice sequence
      await supabase.from('invoice_sequence').update({ last_number: parseInt(invoiceNumber.replace('KM-', '')) })
        .gt('last_number', 0)

      // Update partner stats
      const newTotalOrders = (selectedPartner.total_orders || 0) + 1
      const matchaKg = lineItems.reduce((s, i) => i.desc?.toLowerCase().includes('matcha') ? s + i.qty : s, 0)
      const newTotalKg = (selectedPartner.total_kg || 0) + matchaKg
      const newTotalSpent = (selectedPartner.total_spent || 0) + total
      const newNextOrder = calcNextOrder(invoiceDate, selectedPartner.reorder_frequency_days)
      await supabase.from('partners').update({
        last_order_date: invoiceDate,
        total_orders: newTotalOrders,
        total_kg: newTotalKg,
        total_spent: newTotalSpent,
        next_expected_order: newNextOrder || selectedPartner.next_expected_order,
      }).eq('id', selectedPartner.id)

      setSavedPdfUrl(publicUrl)
      toast.success(`Invoice ${invoiceNumber} saved!`)
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to save invoice')
    }
    setSaving(false)
  }

  return (
    <div className="flex gap-6 h-full max-w-7xl">
      {/* Left panel — form */}
      <div className="w-96 flex-shrink-0 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Invoice</h1>
          <p className="text-sm text-gray-500 mt-0.5">Fill in the details to generate an invoice</p>
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Partner *</label>
            <PartnerSearch
              partners={partners}
              selectedPartner={selectedPartner}
              onSelect={p => {
                if (p) selectPartner(p)
                else { setSelectedPartner(null); setBillTo({ name: '', address: '', contact: '', email: '' }) }
              }}
            />
          </div>

          {/* Bill To — editable */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill To</p>
            <div>
              <label className="label">Business Name</label>
              <input className="input" value={billTo.name} onChange={e => setBillTo(b => ({ ...b, name: e.target.value }))} placeholder="Cafe name" />
            </div>
            <div>
              <label className="label">Contact Name</label>
              <input className="input" value={billTo.contact} onChange={e => setBillTo(b => ({ ...b, contact: e.target.value }))} placeholder="First name" />
            </div>
            <div>
              <label className="label">Address</label>
              <textarea className="input resize-none" rows={2} value={billTo.address} onChange={e => setBillTo(b => ({ ...b, address: e.target.value }))} placeholder="Full address" />
            </div>
            <div>
              <label className="label">Email (for sending invoice)</label>
              <input type="email" className="input" value={billTo.email} onChange={e => setBillTo(b => ({ ...b, email: e.target.value }))} placeholder="cafe@example.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice Number</label>
              <input className="input" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <label className="label">Invoice Date</label>
              <input type="date" className="input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Line Items</h2>
          <div className="space-y-2">
            {lineItems.map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="input col-span-5 text-xs"
                  placeholder="Description"
                  value={item.desc}
                  onChange={e => updateItem(item.id, 'desc', e.target.value)}
                />
                <input
                  type="number"
                  className="input col-span-2 text-xs text-center"
                  placeholder="Qty"
                  value={item.qty}
                  onChange={e => updateItem(item.id, 'qty', e.target.value)}
                  min="0"
                />
                <input
                  type="number"
                  step="0.01"
                  className="input col-span-3 text-xs"
                  placeholder="Price"
                  value={item.price}
                  onChange={e => updateItem(item.id, 'price', e.target.value)}
                  min="0"
                />
                <div className="col-span-1 text-xs text-gray-500 text-right">
                  {formatCurrency(item.qty * item.price)}
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="col-span-1 p-1 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLineItems(i => [...i, newItem()])}
            className="flex items-center gap-1.5 text-xs text-[#3D6034] hover:text-[#2E4A27] font-medium"
          >
            <Plus size={13} /> Add line item
          </button>

          <div className="border-t border-gray-100 pt-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {!savedPdfUrl ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            <Save size={16} />
            {saving ? 'Saving invoice…' : 'Save Invoice & Generate PDF'}
          </button>
        ) : (
          <div className="card p-4 space-y-3 border-[#3D6034] border">
            <p className="text-sm font-semibold text-[#3D6034] text-center">✓ Invoice saved!</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={openGmail}
                className="btn-primary w-full justify-center gap-2"
              >
                <Mail size={15} />
                Email via Gmail
              </button>
              <a
                href={savedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary w-full justify-center text-sm"
              >
                View / Download PDF
              </a>
              <button
                onClick={resetForm}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-700 py-1.5"
              >
                + Create another invoice
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — preview */}
      <div className="flex-1 overflow-auto">
        <div className="sticky top-0 mb-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Live Preview</p>
        </div>
        <div className="bg-gray-100 rounded-xl p-6 flex justify-center">
          <InvoicePreview
            ref={previewRef}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            partner={selectedPartner}
            billTo={billTo}
            lineItems={lineItems}
            subtotal={subtotal}
            total={total}
          />
        </div>
      </div>
    </div>
  )
}

const InvoicePreview = React.forwardRef(function InvoicePreview(
  { invoiceNumber, invoiceDate, partner, billTo, lineItems, subtotal, total },
  ref
) {
  function fmtDate(d) {
    if (!d) return ''
    try {
      const [y, m, day] = d.split('-')
      return `${day}/${m}/${y}`
    } catch { return d }
  }

  return (
    <div
      ref={ref}
      style={{
        width: '595px',
        minHeight: '842px',
        background: '#fff',
        padding: '52px 56px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: '#111',
        boxSizing: 'border-box',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <img src="/logo.png" alt="Kyos Matcha" style={{ height: '40px', width: 'auto' }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#111' }}>{invoiceNumber || 'KM-XXX'}</div>
          <div style={{ color: '#6b7280', marginTop: '4px' }}>Invoice Date: {fmtDate(invoiceDate)}</div>
        </div>
      </div>

      {/* From / Bill To */}
      <div style={{ display: 'flex', gap: '60px', marginBottom: '36px' }}>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>FROM</div>
          <div style={{ fontWeight: 600 }}>{FROM_ADDRESS.name}</div>
          <div style={{ color: '#6b7280', marginTop: '2px' }}>{FROM_ADDRESS.line1}</div>
          <div style={{ color: '#6b7280' }}>{FROM_ADDRESS.line2}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>BILL TO</div>
          <div style={{ fontWeight: 600 }}>{billTo?.name || partner?.name || '—'}</div>
          {billTo?.address && <div style={{ color: '#6b7280', marginTop: '2px', whiteSpace: 'pre-line' }}>{billTo.address}</div>}
          {billTo?.contact && <div style={{ color: '#6b7280', marginTop: '2px' }}>{billTo.contact}</div>}
          {billTo?.email && <div style={{ color: '#6b7280' }}>{billTo.email}</div>}
        </div>
      </div>

      {/* Line items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ background: '#3D6034', color: '#fff' }}>
            {['Description', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
              <th key={h} style={{
                padding: '10px 12px',
                textAlign: i === 0 ? 'left' : 'right',
                fontWeight: 600,
                fontSize: '10px',
                letterSpacing: '0.3px',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, idx) => (
            <tr key={item.id || idx} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
              <td style={{ padding: '10px 12px' }}>{item.desc}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{item.qty}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>£{Number(item.price).toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>
                £{(item.qty * item.price).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '36px' }}>
        <div style={{ width: '200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#6b7280' }}>Subtotal</span>
            <span>£{subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700, fontSize: '13px' }}>
            <span>Total</span>
            <span>£{total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Banking */}
      <div style={{
        background: '#EEF3EC',
        border: '1px solid #b3d0ab',
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '28px',
      }}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#3D6034', fontSize: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Banking Details</div>
        <div style={{ color: '#374151' }}>Account Name: <strong>{BANKING.accountName}</strong></div>
        <div style={{ color: '#374151', marginTop: '4px' }}>Sort Code: <strong>{BANKING.sortCode}</strong></div>
        <div style={{ color: '#374151', marginTop: '4px' }}>Account Number: <strong>{BANKING.accountNumber}</strong></div>
      </div>

      {/* Footer */}
      <div style={{ color: '#9ca3af', fontSize: '10px', textAlign: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
        Thank you for your business · kyosmatcha.com · partners@kyosmatcha.com
      </div>
    </div>
  )
})
