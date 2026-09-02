import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus, lineItemKg, calcNextOrder } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { ArrowLeft, Pencil, FileText, UserPlus, Send, ShoppingBag, TrendingUp } from 'lucide-react'

const STATUS_COLORS = {
  prospect: 'bg-blue-100 text-blue-700',
  sample_sent: 'bg-purple-100 text-purple-700',
  active: 'bg-[#EEF3EC] text-[#3D6034] border border-[#b8d4b0]',
  inactive: 'bg-gray-100 text-gray-500',
  not_interested: 'bg-red-50 text-red-600',
}

const SKU_LABELS = { A: 'Matcha A', AAA: 'Matcha AAA', both: 'Matcha A + AAA' }

function OrderStatusPill({ status }) {
  if (status === 'paid') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EEF3EC] text-[#3D6034]">Paid</span>
  if (status === 'overdue') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">Overdue</span>
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Unpaid</span>
}

export default function PartnerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [partner, setPartner] = useState(null)
  const [orders, setOrders] = useState([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: p }, { data: o }] = await Promise.all([
      supabase.from('partners').select('*').eq('id', id).single(),
      supabase.from('orders').select('*').eq('partner_id', id).order('date', { ascending: false }),
    ])
    setPartner(p)
    setOrders(o || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!partner) return <div className="text-center text-gray-400 mt-24">Partner not found.</div>

  // Historical data
  const historicalKg = Number(partner.total_kg) || 0
  const historicalOrders = Number(partner.total_orders) || 0
  const historicalSpend = historicalKg * (Number(partner.price_per_kg) || 0)

  // CRM data
  const crmKg = orders.reduce((s, o) => s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0), 0)
  const crmSpend = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const crmOrders = orders.length
  const crmLastDate = orders.length > 0 ? orders.reduce((latest, o) => o.date > latest ? o.date : latest, orders[0].date) : null

  // Combined
  const totalKg = historicalKg + crmKg
  const totalSpend = historicalSpend + crmSpend
  const totalOrders = historicalOrders + crmOrders
  const lastOrderDate = [partner.last_order_date, crmLastDate].filter(Boolean).sort().pop()

  // Journey milestones
  const firstOrder = orders.length > 0 ? [...orders].sort((a, b) => a.date.localeCompare(b.date))[0] : null
  const milestones = [
    { icon: UserPlus, label: 'Added', date: partner.joined_date || partner.created_at?.slice(0, 10) },
    { icon: Send, label: 'Sample Sent', date: partner.sample_sent_at },
    { icon: ShoppingBag, label: 'First Order', date: firstOrder?.date },
    { icon: TrendingUp, label: 'Latest Order', date: lastOrderDate },
  ]

  const statusLabel = partner.status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="-m-6">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 pt-5 pb-0">
          {/* Back link */}
          <button
            onClick={() => navigate('/partners')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 mb-3 transition-colors"
          >
            <ArrowLeft size={13} /> Partners
          </button>

          {/* Name row + actions */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: '28px', fontWeight: 700, letterSpacing: '-0.3px', color: '#1C2118', lineHeight: 1.15 }}>
                  {partner.name}
                </h1>
                {partner.status && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[partner.status] || 'bg-gray-100 text-gray-500'}`}>
                    {statusLabel}
                  </span>
                )}
                {partner.preferred_sku && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold tracking-wide" style={{ background: '#1C2118', color: '#F6F8F5', letterSpacing: '0.4px' }}>
                    {SKU_LABELS[partner.preferred_sku] || partner.preferred_sku}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                {[partner.contact_name, partner.email, partner.address?.split('\n').pop()].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-1.5">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => navigate('/invoice', { state: { partnerId: partner.id } })} className="btn-primary flex items-center gap-1.5">
                <FileText size={14} /> New Invoice
              </button>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 mt-5 border-t border-gray-100 -mx-6">
            <div className="px-6 py-4 border-r border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Orders</p>
              <p className="text-xl font-bold mt-0.5 text-gray-900 tabular-nums">{totalOrders}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{historicalOrders} historical · {crmOrders} CRM</p>
            </div>
            <div className="px-6 py-4 border-r border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total KG Ordered</p>
              <p className="text-xl font-bold mt-0.5 text-gray-900 tabular-nums">{totalKg.toFixed(1)} kg</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{historicalKg.toFixed(1)} historical · {crmKg.toFixed(1)} CRM</p>
            </div>
            <div className="px-6 py-4 border-r border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Spent</p>
              <p className="text-xl font-bold mt-0.5 text-[#3D6034] tabular-nums">{formatCurrency(totalSpend)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(historicalSpend)} historical · {formatCurrency(crmSpend)} CRM</p>
            </div>
            <div className="px-6 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Order</p>
              <p className="text-xl font-bold mt-0.5 text-gray-900">{lastOrderDate ? formatDate(lastOrderDate) : '—'}</p>
              {partner.next_expected_order && (
                <p className="text-[11px] text-gray-400 mt-0.5">Next: {formatDate(partner.next_expected_order)}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="grid grid-cols-[280px_1fr] gap-5 p-6">

        {/* Left column */}
        <div className="flex flex-col gap-4">

          {/* Journey */}
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-4">Partner Journey</p>
            <div className="relative flex items-start">
              {/* Connecting line */}
              <div className="absolute top-2.5 left-2.5 right-2.5 h-px bg-gray-200" />
              {milestones.map(({ icon: Icon, label, date }, i) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-1.5 relative z-10">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${date ? 'border-[#3D6034] bg-[#EEF3EC]' : 'border-gray-200 bg-white'}`}>
                    {date && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#3D6034" strokeWidth="3.5">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <p className="text-[10px] font-medium text-gray-600 text-center leading-tight">{label}</p>
                  <p className="text-[10px] text-gray-400 text-center">{date ? formatDate(date) : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Info card */}
          <div className="card overflow-hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-4 py-3 border-b border-gray-100">Partner Info</p>
            <dl>
              {[
                ['Contact', partner.contact_name],
                ['Email', partner.email],
                ['Phone', partner.phone],
                ['Address', partner.address],
                ['Matcha Grade', partner.preferred_sku ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ background: '#1C2118', color: '#F6F8F5' }}>
                    {SKU_LABELS[partner.preferred_sku] || partner.preferred_sku}
                  </span>
                ) : null],
                ['Price / kg', partner.price_per_kg ? formatCurrency(partner.price_per_kg) : null],
                ['Shipping Fee', partner.shipping_fee ? formatCurrency(partner.shipping_fee) : null],
                ['Projected / mo', partner.projected_kg_month ? `${partner.projected_kg_month} kg` : null],
                ['Reorder Freq.', partner.reorder_frequency_days ? `Every ${partner.reorder_frequency_days} days` : null],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 border-b border-gray-50 last:border-0">
                  <dt className="text-[10px] uppercase tracking-wider font-medium text-gray-400">{label}</dt>
                  <dd className="text-sm text-gray-800 font-medium whitespace-pre-line">{value}</dd>
                </div>
              ))}
              {partner.notes && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                  <p className="text-[10px] uppercase tracking-wider font-medium text-gray-400 mb-1">Notes</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{partner.notes}</p>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Right column: order history */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order History</p>
            <p className="text-xs text-gray-400">{crmOrders} invoice{crmOrders !== 1 ? 's' : ''} in CRM</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    { label: 'Invoice' },
                    { label: 'Date' },
                    { label: 'Items' },
                    { label: 'Total', right: true },
                    { label: 'Status' },
                    { label: 'PDF' },
                  ].map(({ label, right }) => (
                    <th key={label} className={`text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-5 py-3 ${right ? 'text-right' : 'text-left'}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">No orders yet</td>
                  </tr>
                ) : orders.map(order => {
                  const itemSummary = (order.line_items || [])
                    .map(li => `${li.qty}× ${li.desc}`)
                    .slice(0, 2)
                    .join(', ')
                  const extraItems = (order.line_items || []).length - 2
                  return (
                    <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm font-semibold text-[#3D6034]">{order.invoice_number}</td>
                      <td className="px-5 py-3.5 text-sm text-gray-500">{formatDate(order.date)}</td>
                      <td className="px-5 py-3.5 text-xs text-gray-400 max-w-[200px]">
                        <span className="truncate block">{itemSummary}{extraItems > 0 ? ` +${extraItems} more` : ''}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">{formatCurrency(order.total)}</td>
                      <td className="px-5 py-3.5"><OrderStatusPill status={getOrderStatus(order)} /></td>
                      <td className="px-5 py-3.5">
                        {order.invoice_pdf_url
                          ? <a href={order.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-[#3D6034] font-medium transition-colors">Download</a>
                          : <span className="text-xs text-gray-300">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <PartnerModal
          partner={partner}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load() }}
        />
      )}
    </div>
  )
}
