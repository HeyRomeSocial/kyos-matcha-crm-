import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { syncToSheets } from '../lib/sheetsSync'
import { formatCurrency, formatDate, getOrderStatus } from '../lib/utils'
import { restoreInventoryForOrder } from '../lib/inventory'
import { format, addDays } from 'date-fns'
import { Search, Download, CheckCircle, XCircle, Trash2, ChevronUp, ChevronDown, Pencil, Eye, X, Package, ShoppingBag, StickyNote, FilePlus, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import EditInvoiceModal from '../components/EditInvoiceModal'

function PdfViewerModal({ order, onClose, onNewInvoice }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl" style={{ height: '92vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{order.invoice_number} — {order.partner_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.invoice_pdf_url ? 'PDF Invoice' : 'No PDF available'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNewInvoice}
              className="btn-secondary text-xs"
              title={`New invoice for ${order.partner_name}`}
            >
              <FilePlus size={13} /> New Invoice
            </button>
            {order.invoice_pdf_url && (
              <a
                href={order.invoice_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="btn-secondary text-xs"
              >
                <Download size={13} /> Download
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4 bg-gray-100 rounded-b-2xl">
          {order.invoice_pdf_url ? (
            <iframe
              src={order.invoice_pdf_url}
              className="w-full h-full rounded-lg border border-gray-200"
              title={`Invoice ${order.invoice_number}`}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-sm font-medium">No PDF available for this invoice</p>
                <p className="text-xs mt-1">Edit and save the invoice to generate a PDF</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PartnerHoverCard({ partner, orders }) {
  if (!partner) return null
  const partnerOrders = orders.filter(o => o.partner_id === partner.id)
  const totalOrders = (Number(partner.total_orders) || 0) + partnerOrders.length
  const crmKg = partnerOrders.reduce((s, o) =>
    s + (o.line_items || []).reduce((a, li) => {
      const desc = (li.desc || '').toLowerCase()
      if (desc.includes('50g') || desc.includes('retail pouch')) return a + (Number(li.qty) || 0) * 0.05
      if (desc.includes('matcha')) return a + (Number(li.qty) || 0)
      return a
    }, 0), 0)
  const totalKg = (Number(partner.total_kg) || 0) + crmKg
  const lastOrder = [partner.last_order_date, ...partnerOrders.map(o => o.date)].filter(Boolean).sort().pop()

  return (
    <div className="absolute z-50 left-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-none">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-900 truncate">{partner.name}</p>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${partner.status === 'active' ? 'bg-[#EEF3EC] text-[#3D6034]' : 'bg-gray-100 text-gray-500'}`}>
          {partner.status === 'active' ? 'Active' : partner.status}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Total Orders</span>
          <span className="font-medium text-gray-700">{totalOrders}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Total KG</span>
          <span className="font-medium text-gray-700">{totalKg.toFixed(2)}kg</span>
        </div>
        {partner.price_per_kg > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Price / KG</span>
            <span className="font-medium text-gray-700">{formatCurrency(partner.price_per_kg)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Last Order</span>
          <span className="font-medium text-gray-700">{lastOrder ? formatDate(lastOrder) : '—'}</span>
        </div>
        {partner.contact_name && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Contact</span>
            <span className="font-medium text-gray-700">{partner.contact_name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const FILTERS = ['all', 'paid', 'unpaid', 'overdue']
const FILTER_LABELS = { all: 'All', paid: 'Paid', unpaid: 'Pending', overdue: 'Overdue' }

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge-paid">Paid</span>
  if (status === 'overdue') return <span className="badge-overdue">Overdue</span>
  return <span className="badge-unpaid">Pending</span>
}

// Single status pill — green Paid / red Pending, click to toggle
function PaidToggle({ order, onToggle }) {
  const isPaid = order.status === 'paid'
  return (
    <button
      onClick={() => onToggle(order)}
      className="inline-flex items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150"
      style={{
        width: '84px',
        height: '26px',
        backgroundColor: isPaid ? '#3D6034' : '#dc2626',
        color: '#fff',
      }}
      title={isPaid ? 'Click to mark as pending' : 'Click to mark as paid'}
    >
      {isPaid ? 'Paid' : 'Pending'}
    </button>
  )
}

function NotesModal({ order, onClose, onSaved }) {
  const [note, setNote] = useState(order.notes || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('orders').update({ notes: note.trim() || null }).eq('id', order.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Note saved')
    onSaved(order.id, note.trim() || null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Note — {order.invoice_number}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.partner_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <textarea
          className="input w-full resize-none text-sm"
          rows={4}
          placeholder="e.g. Follow up sent, waiting on payment…"
          value={note}
          onChange={e => setNote(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrdersLog() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editOrder, setEditOrder] = useState(null)
  const [viewOrder, setViewOrder] = useState(null)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [hoveredPartner, setHoveredPartner] = useState(null)
  const [noteOrder, setNoteOrder] = useState(null)

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">⇅</span>
    return <span className="text-[#3D6034] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const load = useCallback(async () => {
    const [{ data: ordersData }, { data: partnersData }] = await Promise.all([
      supabase.from('orders').select('*').order('date', { ascending: false }),
      supabase.from('partners').select('id,name,status,total_orders,total_kg,price_per_kg,last_order_date,contact_name'),
    ])
    setOrders(ordersData || [])
    setPartners(partnersData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  async function snoozeTopending(order) {
    const snoozedUntil = format(addDays(new Date(), 30), 'yyyy-MM-dd')
    const { error } = await supabase.from('orders').update({ snoozed_until: snoozedUntil }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success('Moved to Pending — will re-flag as overdue in 30 days')
    syncToSheets()
  }

  async function togglePaid(order) {
    const newStatus = order.status === 'paid' ? 'unpaid' : 'paid'
    const { error } = await supabase.from('orders').update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success(newStatus === 'paid' ? 'Marked as paid' : 'Moved back to pending')
    syncToSheets()

    // Auto-upload paid invoice PDF to Google Drive (if webhook configured)
    if (newStatus === 'paid' && order.invoice_pdf_url) {
      try {
        const { data: s } = await supabase.from('settings').select('drive_webhook_url').eq('id', 1).single()
        if (s?.drive_webhook_url) {
          fetch(s.drive_webhook_url, {
            method: 'POST',
            // Apps Script web apps don't return CORS headers — fire-and-forget
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
              invoice_number: order.invoice_number,
              partner_name: order.partner_name,
              pdf_url: order.invoice_pdf_url.split('?')[0],
              date: order.date,
            }),
          }).then(() => {
            toast.success(`${order.invoice_number} saved to Google Drive`, { icon: '📁' })
          }).catch(() => {})
        }
      } catch {}
    }
  }

  async function deleteOrder(order) {
    await restoreInventoryForOrder(order)
    if (order.invoice_pdf_url) {
      const filename = `${order.invoice_number}.pdf`
      await supabase.storage.from('invoices').remove([filename])
    }
    const { error } = await supabase.from('orders').delete().eq('id', order.id)
    if (error) toast.error(error.message)
    else toast.success(`${order.invoice_number} deleted`)
    setConfirmDelete(null)
  }

  const filtered = useMemo(() => {
    return orders
      .filter(o => {
        const status = getOrderStatus(o)
        const matchFilter = filter === 'all' || status === filter
        const matchSearch = !search
          || o.invoice_number?.toLowerCase().includes(search.toLowerCase())
          || o.partner_name?.toLowerCase().includes(search.toLowerCase())
        return matchFilter && matchSearch
      })
      .sort((a, b) => {
        let av, bv
        switch (sortKey) {
          case 'invoice': {
            av = parseInt(a.invoice_number?.replace('KM-', '') || '0')
            bv = parseInt(b.invoice_number?.replace('KM-', '') || '0')
            break
          }
          case 'partner': av = a.partner_name?.toLowerCase() || ''; bv = b.partner_name?.toLowerCase() || ''; break
          case 'date': {
            // Tie-break same-date invoices by invoice number so order is always consecutive
            const na = parseInt(a.invoice_number?.replace('KM-', '') || '0')
            const nb = parseInt(b.invoice_number?.replace('KM-', '') || '0')
            av = `${a.date || ''}-${String(na).padStart(6, '0')}`
            bv = `${b.date || ''}-${String(nb).padStart(6, '0')}`
            break
          }
          case 'paid_at': av = a.paid_at || ''; bv = b.paid_at || ''; break
          case 'total':   av = a.total || 0; bv = b.total || 0; break
          case 'status':  av = getOrderStatus(a); bv = getOrderStatus(b); break
          default:        av = a.date || ''; bv = b.date || ''
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
  }, [orders, filter, search, sortKey, sortDir])

  const counts = {
    all: orders.length,
    paid: orders.filter(o => getOrderStatus(o) === 'paid').length,
    unpaid: orders.filter(o => getOrderStatus(o) === 'unpaid').length,
    overdue: orders.filter(o => getOrderStatus(o) === 'overdue').length,
  }

  // Recently paid — last 5 invoices with a paid_at timestamp, most recent first
  const recentlyPaid = [...orders]
    .filter(o => o.paid_at)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .slice(0, 5)

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500 mt-0.5">{orders.length} invoices total</p>
      </div>

      {/* Recently Paid */}
      {recentlyPaid.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} className="text-[#3D6034]" />
            <h2 className="text-sm font-semibold text-gray-900">Recently Paid</h2>
            <span className="text-xs text-gray-400 ml-1">last {recentlyPaid.length} payments</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {recentlyPaid.map(o => {
              const paidDate = o.paid_at ? new Date(o.paid_at) : null
              const isToday = paidDate && formatDate(paidDate.toISOString().slice(0,10)) === formatDate(new Date().toISOString().slice(0,10))
              const timeStr = paidDate ? paidDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
              const dateStr = paidDate ? (isToday ? `Today ${timeStr}` : formatDate(o.paid_at.slice(0,10)) ) : ''
              return (
                <div key={o.id} className="flex items-center gap-2.5 bg-[#EEF3EC] rounded-xl px-3 py-2.5 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-[#3D6034] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#3D6034] truncate">{o.invoice_number}</p>
                    <p className="text-xs text-gray-600 truncate">{o.partner_name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{dateStr} · {formatCurrency(o.total)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 w-64"
            placeholder="Search by invoice # or partner…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                filter === f
                  ? 'bg-[#3D6034] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {`${FILTER_LABELS[f]} (${counts[f]})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {[
                  { label: 'Invoice #', key: 'invoice' },
                  { label: 'Partner',   key: 'partner' },
                  { label: 'Date',      key: 'date' },
                  { label: 'Total',     key: 'total' },
                  { label: 'Paid On',   key: 'paid_at' },
                  { label: 'PDF',       key: null },
                  { label: 'Payment',   key: null },
                  { label: '',          key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && handleSort(key)}
                    className={`text-left text-xs font-medium px-5 py-3 whitespace-nowrap select-none ${
                      key ? 'cursor-pointer hover:text-gray-700' : ''
                    } ${sortKey === key ? 'text-[#3D6034]' : 'text-gray-400'}`}
                  >
                    {label}{key && <SortIcon col={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">No orders found</td></tr>
              ) : filtered.map(order => {
                const status = getOrderStatus(order)
                const isOverdue = status === 'overdue'
                return (
                  <tr
                    key={order.id}
                    className={`border-b border-gray-50 last:border-0 ${isOverdue ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}`}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-[#3D6034]">{order.invoice_number}</td>
                    <td className="px-5 py-3 text-sm text-gray-700 relative">
                      <span
                        className="cursor-default hover:text-[#3D6034] hover:underline decoration-dotted transition-colors"
                        onMouseEnter={() => setHoveredPartner(order.partner_id)}
                        onMouseLeave={() => setHoveredPartner(null)}
                      >
                        {order.partner_name}
                      </span>
                      {hoveredPartner === order.partner_id && (
                        <PartnerHoverCard
                          partner={partners.find(p => p.id === order.partner_id)}
                          orders={orders}
                        />
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{formatDate(order.date)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3 text-xs text-gray-400">
                      {order.paid_at ? formatDate(order.paid_at.slice(0,10)) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewOrder(order)}
                          className="inline-flex items-center gap-1 text-xs text-[#3D6034] hover:underline font-medium"
                          title="View PDF"
                        >
                          <Eye size={13} /> View
                        </button>
                        {order.invoice_pdf_url && (
                          <a
                            href={order.invoice_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                            title="Download PDF"
                          >
                            <Download size={12} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <PaidToggle order={order} onToggle={togglePaid} />
                        {status === 'overdue' && (
                          <button
                            onClick={() => snoozeTopending(order)}
                            className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap"
                            title="Move back to Pending for 30 days"
                          >
                            → Pending
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate('/invoice', { state: { partnerId: order.partner_id } })}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-[#3D6034] hover:bg-[#EEF3EC] transition-colors"
                          title={`New invoice for ${order.partner_name}`}
                        >
                          <FilePlus size={14} />
                        </button>
                        <button
                          onClick={() => setEditOrder(order)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-[#3D6034] hover:bg-[#EEF3EC] transition-colors"
                          title="Edit invoice"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setNoteOrder(order)}
                        className={`p-1.5 rounded-lg transition-colors ${order.notes ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'}`}
                        title={order.notes || 'Add note'}
                      >
                        <StickyNote size={14} />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setConfirmDelete(order)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete invoice"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewOrder && (
        <PdfViewerModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onNewInvoice={() => { setViewOrder(null); navigate('/invoice', { state: { partnerId: viewOrder.partner_id } }) }}
        />
      )}

      {editOrder && (
        <EditInvoiceModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); load() }}
        />
      )}

      {noteOrder && (
        <NotesModal
          order={noteOrder}
          onClose={() => setNoteOrder(null)}
          onSaved={(id, note) => {
            setOrders(prev => prev.map(o => o.id === id ? { ...o, notes: note } : o))
            setNoteOrder(null)
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${confirmDelete.invoice_number}? This cannot be undone.`}
          onConfirm={() => deleteOrder(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
