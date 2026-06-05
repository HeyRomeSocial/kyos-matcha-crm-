import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { ArrowLeft, Pencil, FileText } from 'lucide-react'

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

  const totalSpend = orders.reduce((s, o) => s + (o.total || 0), 0)
  const totalKg = orders.reduce((s, o) => s + (o.line_items || []).reduce((a, li) => li.desc?.toLowerCase().includes('matcha') ? a + (li.qty || 0) : a, 0), 0)

  const infoFields = [
    ['Contact', partner.contact_name],
    ['Email', partner.email],
    ['Phone', partner.phone],
    ['Address', partner.address],
    ['Price / KG', partner.price_per_kg ? formatCurrency(partner.price_per_kg) : null],
    ['Shipping Fee', partner.shipping_fee ? formatCurrency(partner.shipping_fee) : null],
    ['Projected KG/mo', partner.projected_kg_month ? `${partner.projected_kg_month}kg` : null],
    ['Reorder Frequency', partner.reorder_frequency_days ? `Every ${partner.reorder_frequency_days} days` : null],
    ['Last Order', formatDate(partner.last_order_date)],
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
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total Orders</p>
          <p className="text-2xl font-bold mt-1">{partner.total_orders || 0}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total KG</p>
          <p className="text-2xl font-bold mt-1">{totalKg.toFixed(1)}kg</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-gray-500">Total Spend</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalSpend)}</p>
        </div>
      </div>

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
