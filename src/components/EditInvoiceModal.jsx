import React, { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { X, Plus, Trash2, Save, Mail } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const FROM_DEFAULTS = { name: 'Kyos Matcha', line1: '30 Seagull Lane', line2: 'E16 1PY, London' }
const BANK_DEFAULTS = { accountName: 'KM WELNESS LTD', sortCode: '04-00-05', accountNumber: '86383529' }

function newItem(desc = '', qty = 1, price = 0) {
  return { id: Math.random().toString(36).slice(2), desc, qty, price }
}

const InvoicePreview = React.forwardRef(function InvoicePreview(
  { invoiceNumber, invoiceDate, billTo, lineItems, subtotal, total, fromAddress, banking }, ref
) {
  const FROM = fromAddress || FROM_DEFAULTS
  const BANK = banking || BANK_DEFAULTS
  function fmtDate(d) {
    if (!d) return ''
    try { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` } catch { return d }
  }
  return (
    <div ref={ref} style={{
      width: '595px', minHeight: '842px', background: '#fff',
      padding: '52px 56px', fontFamily: 'Inter, sans-serif',
      fontSize: '11px', color: '#111', boxSizing: 'border-box',
      border: '1px solid #e5e7eb', borderRadius: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <img src="/logo.png" alt="Kyos Matcha" style={{ height: '40px', width: 'auto' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{invoiceNumber}</div>
          <div style={{ color: '#6b7280', marginTop: '4px' }}>Invoice Date: {fmtDate(invoiceDate)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '60px', marginBottom: '36px' }}>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>FROM</div>
          <div style={{ fontWeight: 600 }}>{FROM.name}</div>
          <div style={{ color: '#6b7280', marginTop: '2px' }}>{FROM.line1}</div>
          <div style={{ color: '#6b7280' }}>{FROM.line2}</div>
        </div>
        <div>
          <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>BILL TO</div>
          <div style={{ fontWeight: 600 }}>{billTo?.name || '—'}</div>
          {billTo?.address && <div style={{ color: '#6b7280', marginTop: '2px', whiteSpace: 'pre-line' }}>{billTo.address}</div>}
          {billTo?.contact && <div style={{ color: '#6b7280', marginTop: '2px' }}>{billTo.contact}</div>}
          {billTo?.email && <div style={{ color: '#6b7280' }}>{billTo.email}</div>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ background: '#3D6034', color: '#fff' }}>
            {['Description', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, fontSize: '10px' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, idx) => (
            <tr key={item.id || idx} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
              <td style={{ padding: '10px 12px' }}>{item.desc}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{item.qty}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>£{Number(item.price).toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>£{(item.qty * item.price).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '36px' }}>
        <div style={{ width: '200px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
            <span style={{ color: '#6b7280' }}>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700, fontSize: '13px' }}>
            <span>Total</span><span>£{total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div style={{ background: '#EEF3EC', border: '1px solid #b3d0ab', borderRadius: '8px', padding: '16px 20px', marginBottom: '28px' }}>
        <div style={{ fontWeight: 600, marginBottom: '8px', color: '#3D6034', fontSize: '10px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Banking Details</div>
        <div style={{ color: '#374151' }}>Account Name: <strong>{BANK.accountName}</strong></div>
        <div style={{ color: '#374151', marginTop: '4px' }}>Sort Code: <strong>{BANK.sortCode}</strong></div>
        <div style={{ color: '#374151', marginTop: '4px' }}>Account Number: <strong>{BANK.accountNumber}</strong></div>
      </div>
      <div style={{ color: '#9ca3af', fontSize: '10px', textAlign: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '20px' }}>
        Thank you for your business · kyosmatcha.com · partners@kyosmatcha.com
      </div>
    </div>
  )
})

export default function EditInvoiceModal({ order, onClose, onSaved }) {
  const previewRef = useRef(null)
  const [invoiceDate, setInvoiceDate] = useState(order.date || format(new Date(), 'yyyy-MM-dd'))
  const [lineItems, setLineItems] = useState(
    (order.line_items || []).map(li => ({ ...li, id: Math.random().toString(36).slice(2) }))
  )
  const [billTo, setBillTo] = useState({
    name: order.partner_name || '',
    address: order.bill_address || '',
    contact: order.bill_contact || '',
    email: order.bill_email || '',
  })
  const [saving, setSaving] = useState(false)
  const [savedPdfUrl, setSavedPdfUrl] = useState(null)
  const [fromAddress, setFromAddress] = useState(FROM_DEFAULTS)
  const [banking, setBanking] = useState(BANK_DEFAULTS)

  React.useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) {
        setFromAddress({ name: data.from_name, line1: data.from_line1, line2: data.from_line2 })
        setBanking({ accountName: data.bank_name, sortCode: data.bank_sort, accountNumber: data.bank_account })
      }
    })
  }, [])

  function updateItem(id, field, value) {
    setLineItems(items => items.map(item =>
      item.id === id ? { ...item, [field]: field === 'qty' || field === 'price' ? Number(value) : value } : item
    ))
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.qty * i.price), 0)
  const total = subtotal

  async function handleSave() {
    setSaving(true)
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const ratio = canvas.height / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, Math.min(pageWidth * ratio, pdf.internal.pageSize.getHeight()))
      const pdfBlob = pdf.output('blob')

      const filename = `${order.invoice_number}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('invoices').upload(filename, pdfBlob, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(filename)

      const lineItemsClean = lineItems.map(({ id, ...rest }) => rest)
      const { error } = await supabase.from('orders').update({
        date: invoiceDate,
        line_items: lineItemsClean,
        subtotal,
        total,
        invoice_pdf_url: publicUrl,
        bill_address: billTo.address,
        bill_contact: billTo.contact,
        bill_email: billTo.email,
      }).eq('id', order.id)
      if (error) throw error

      setSavedPdfUrl(publicUrl)
      toast.success(`${order.invoice_number} updated!`)
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to update invoice')
    }
    setSaving(false)
  }

  function openGmail() {
    const to = billTo.email || ''
    const subject = encodeURIComponent(`Invoice ${order.invoice_number} — Kyos Matcha`)
    const body = encodeURIComponent(
`Hi ${billTo.contact || billTo.name},\n\nPlease find your updated invoice ${order.invoice_number} from Kyos Matcha.\n\nDownload here:\n${savedPdfUrl}\n\nTotal: £${total.toFixed(2)}\nPayment due within 14 days.\n\nBanking Details:\nAccount Name: KM WELNESS LTD\nSort Code: 04-00-05\nAccount Number: 86383529\n\nThank you for your business.\n\nKyos Matcha\npartners@kyosmatcha.com`
    )
    window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col" style={{ maxHeight: '95vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Edit Invoice — {order.invoice_number}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Changes will regenerate the PDF</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex gap-6 p-6 overflow-y-auto flex-1 min-h-0">
          {/* Left — form */}
          <div className="w-80 flex-shrink-0 space-y-4">
            {/* Bill To */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bill To</p>
              <div>
                <label className="label">Business Name</label>
                <input className="input" value={billTo.name} onChange={e => setBillTo(b => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Contact Name</label>
                <input className="input" value={billTo.contact} onChange={e => setBillTo(b => ({ ...b, contact: e.target.value }))} />
              </div>
              <div>
                <label className="label">Address</label>
                <textarea className="input resize-none" rows={2} value={billTo.address} onChange={e => setBillTo(b => ({ ...b, address: e.target.value }))} />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={billTo.email} onChange={e => setBillTo(b => ({ ...b, email: e.target.value }))} />
              </div>
            </div>

            {/* Date */}
            <div className="card p-4">
              <label className="label">Invoice Date</label>
              <input type="date" className="input" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
            </div>

            {/* Line items */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Items</p>
              {lineItems.map(item => (
                <div key={item.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <input className="input col-span-5 text-xs" value={item.desc} onChange={e => updateItem(item.id, 'desc', e.target.value)} placeholder="Description" />
                  <input type="number" className="input col-span-2 text-xs text-center" value={item.qty} onChange={e => updateItem(item.id, 'qty', e.target.value)} min="0" />
                  <input type="number" step="0.01" className="input col-span-3 text-xs" value={item.price} onChange={e => updateItem(item.id, 'price', e.target.value)} min="0" />
                  <span className="col-span-1 text-xs text-gray-400 text-right">{formatCurrency(item.qty * item.price)}</span>
                  <button onClick={() => setLineItems(i => i.filter(x => x.id !== item.id))} className="col-span-1 p-1 text-gray-300 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button onClick={() => setLineItems(i => [...i, newItem()])} className="text-xs text-[#3D6034] hover:text-[#2E4A27] font-medium flex items-center gap-1">
                <Plus size={12} /> Add line item
              </button>
              <div className="border-t border-gray-100 pt-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>

            {/* Actions */}
            {!savedPdfUrl ? (
              <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center py-2.5">
                <Save size={15} /> {saving ? 'Saving…' : 'Save & Regenerate PDF'}
              </button>
            ) : (
              <div className="card p-4 space-y-2 border-[#3D6034] border">
                <p className="text-sm font-semibold text-[#3D6034] text-center">✓ Invoice updated!</p>
                <button onClick={openGmail} className="btn-primary w-full justify-center text-sm"><Mail size={14} /> Email via Gmail</button>
                <a href={savedPdfUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary w-full justify-center text-sm">View PDF</a>
              </div>
            )}
          </div>

          {/* Right — preview */}
          <div className="flex-1 overflow-auto bg-gray-100 rounded-xl p-5 flex justify-center">
            <InvoicePreview
              ref={previewRef}
              invoiceNumber={order.invoice_number}
              invoiceDate={invoiceDate}
              billTo={billTo}
              lineItems={lineItems}
              subtotal={subtotal}
              total={total}
              fromAddress={fromAddress}
              banking={banking}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
