import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus } from '../lib/utils'
import { Search, Download, CheckCircle, XCircle, Trash2, ChevronUp, ChevronDown, Pencil, Eye, X } from 'lucide-react'
import toast from 'react-hot-toast'
import EditInvoiceModal from '../components/EditInvoiceModal'

function PdfViewerModal({ order, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl" style={{ height: '92vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{order.invoice_number} — {order.partner_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{order.invoice_pdf_url ? 'PDF Invoice' : 'No PDF available'}</p>
          </div>
          <div className="flex items-center gap-2">
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
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editOrder, setEditOrder] = useState(null)
  const [viewOrder, setViewOrder] = useState(null)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">⇅</span>
    return <span className="text-[#3D6034] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('date', { ascending: false })
    setOrders(data || [])
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

  async function togglePaid(order) {
    const newStatus = order.status === 'paid' ? 'unpaid' : 'paid'
    const { error } = await supabase.from('orders').update({
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', order.id)
    if (error) { toast.error(error.message); return }
    toast.success(newStatus === 'paid' ? 'Marked as paid' : 'Moved back to pending')

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
    // Also delete PDF from storage if it exists
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

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500 mt-0.5">{orders.length} invoices total</p>
      </div>

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
                    <td className="px-5 py-3 text-sm text-gray-700">{order.partner_name}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{formatDate(order.date)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{formatCurrency(order.total)}</td>
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
                      <PaidToggle order={order} onToggle={togglePaid} />
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setEditOrder(order)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-[#3D6034] hover:bg-[#EEF3EC] transition-colors"
                        title="Edit invoice"
                      >
                        <Pencil size={14} />
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
        <PdfViewerModal order={viewOrder} onClose={() => setViewOrder(null)} />
      )}

      {editOrder && (
        <EditInvoiceModal
          order={editOrder}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); load() }}
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
