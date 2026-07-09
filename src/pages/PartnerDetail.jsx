import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus, lineItemKg } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { ArrowLeft, Pencil, FileText, UserPlus, Send, ShoppingBag, TrendingUp } from 'lucide-react'

const STATUS_COLORS = {
  prospect: 'bg-blue-100 text-blue-700',
  sample_sent: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-[#3D6034]',
  inactive: 'bg-gray-100 text-gray-600',
}

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge-paid">Paid</span>
  if (status === 'overdue') return <span className="badge-overdue">Overdue</span>
  return <span className="badge-unpaid">Unpaid</span>
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" /></div>
  if (!partner) return <div className="text-center text-gray-400 mt-24">Partner not found.</div>

  // Historical data from CSV import
  const historicalKg = Number(partner.total_kg) || 0
  const historicalOrders = Number(partner.total_orders) || 0
  const historicalSpend = historicalKg * (Number(partner.price_per_kg) || 0)

  // CRM orders created in this system
  const crmKg = orders.reduce((s, o) => s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0), 0)
  const crmSpend = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const crmOrders = orders.length
  const crmLastDate = orders.length > 0 ? orders.reduce((latest, o) => o.date > latest ? o.date : latest, orders[0].date) : null

  // Combined totals
  const totalKg = historicalKg + crmKg
  const totalSpend = historicalSpend + crmSpend
  const totalOrders = historicalOrders + crmOrders

  const infoFields = [
    ['Contact', partner.contact_name],
    ['Email', partner.email],
    ['Phone', partner.phone],
    ['Address', partner.address],
    ['Price / KG', partner.price_per_kg ? formatCurrency(partner.price_per_kg) : null],
    ['Shipping Fee', partner.shipping_fee ? formatCurrency(partner.shipping_fee) : null],
    ['Projected KG/mo', partner.projected_kg_month ? `${partner.projected_kg_month}kg` : null],
    ['Reorder Frequency', partner.reorder_frequency_days ? `Every ${partner.reorder_frequency_days} days` : null],
    ['Last Order', formatDate([partner.last_order_date, crmLastDate].filter(Boolean).sort().pop())],
    ['Next Expected', formatDate(partner.next_expected_order)],
  ]

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/partners')} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{partner.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[partner.status]}`}>
              {partner.status?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          {partner.notes && <p className="text-sm text-gray-500 mt-1">{partner.notes}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/invoice', { state: { partnerId: partner.id } })} className="btn-secondary">
            <FileText size={15} /> New Invoice
          </button>
          <button onClick={() => setEditing(true)} className="btn-primary">
            <Pencil size={15} /> Edit
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold mt-1">{totalOrders}</p>
          <p className="text-xs text-gray-400 mt-1">{historicalOrders} historical · {crmOrders} CRM</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total KG Ordered</p>
          <p className="text-2xl font-bold mt-1">{totalKg.toFixed(1)}kg</p>
          <p className="text-xs text-gray-400 mt-1">{historicalKg.toFixed(1)}kg historical · {crmKg.toFixed(1)}kg CRM</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total Spent</p>
          <p className="text-2xl font-bold mt-1 text-[#3D6034]">{formatCurrency(totalSpend)}</p>
          <p className="text-xs text-gray-400 mt-1">{formatCurrency(historicalSpend)} historical · {formatCurrency(crmSpend)} CRM</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">CRM Invoiced</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(crmSpend)}</p>
          <p className="text-xs text-gray-400 mt-1">{crmOrders} invoice{crmOrders !== 1 ? 's' : ''} in CRM</p>
        </div>
      </div>

      {/* Timeline */}
      {(() => {
        const firstOrder = orders.length > 0 ? [...orders].sort((a,b) => a.date.localeCompare(b.date))[0] : null
        const milestones = [
          { icon: UserPlus, label: 'Added to CRM', date: partner.created_at ? formatDate(partner.created_at.slice(0,10)) : null, color: 'bg-blue-100 text-blue-600' },
          { icon: Send, label: 'Sample Sent', date: partner.sample_sent_at ? formatDate(partner.sample_sent_at) : null, color: 'bg-purple-100 text-purple-600' },
          { icon: ShoppingBag, label: 'First Order', date: firstOrder ? formatDate(firstOrder.date) : null, sub: firstOrder?.invoice_number, color: 'bg-amber-100 text-amber-600' },
          { icon: TrendingUp, label: 'Last Order', date: [partner.last_order_date, crmLastDate].filter(Boolean).sort().pop() ? formatDate([partner.last_order_date, crmLastDate].filter(Boolean).sort().pop()) : null, color: 'bg-green-100 text-[#3D6034]' },
        ]
        return (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Partner Journey</h2>
            <div className="flex items-start gap-0">
              {milestones.map(({ icon: Icon, label, date, sub, color }, i) => (
                <div key={label} className="flex-1 flex items-start gap-0">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${date ? color : 'bg-gray-100 text-gray-300'}`}>
                      <Icon size={16} />
                    </div>
                    <p className="text-xs font-medium text-gray-700 mt-2 text-center">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 text-center">{date || '—'}</p>
                    {sub && <p className="text-xs text-[#3D6034] mt-0.5 text-center">{sub}</p>}
                  </div>
                  {i < milestones.length - 1 && (
                    <div className={`h-px w-full mt-4 ${date && milestones[i+1]?.date ? 'bg-gray-300' : 'bg-gray-100'}`} style={{marginLeft:'-1px',marginRight:'-1px'}} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Partner Info</h2>
          <dl className="space-y-3">
            {infoFields.map(([label, value]) => value ? (
              <div key={label}>
                <dt className="text-xs text-gray-400">{label}</dt>
                <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
              </div>
            ) : null)}
          </dl>
        </div>

        {/* Order history */}
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Order History</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Invoice', 'Date', 'Total', 'Status', 'PDF'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No orders yet</td></tr>
              ) : orders.map(order => (
                <tr key={order.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-3 text-sm font-medium text-[#3D6034]">{order.invoice_number}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(order.date)}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{formatCurrency(order.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={getOrderStatus(order)} /></td>
                  <td className="px-5 py-3">
                    {order.invoice_pdf_url ? (
                      <a href={order.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3D6034] hover:underline">Download</a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
