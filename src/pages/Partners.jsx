import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, reorderUrgency } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { Plus, Search, Pencil, ExternalLink } from 'lucide-react'

const STATUSES = ['all', 'prospect', 'sample_sent', 'active', 'inactive']

const STATUS_LABELS = {
  prospect: 'Prospect',
  sample_sent: 'Sample Sent',
  active: 'Active',
  inactive: 'Inactive',
}

const STATUS_COLORS = {
  prospect: 'bg-blue-100 text-blue-700',
  sample_sent: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-[#3D6034]',
  inactive: 'bg-gray-100 text-gray-600',
}

export default function Partners() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null) // null | 'add' | partner object

  async function load() {
    const { data } = await supabase.from('partners').select('*').order('name')
    setPartners(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = partners.filter(p => {
    const matchStatus = filter === 'all' || p.status === filter
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.contact_name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  function NextOrderCell({ partner }) {
    const urgency = reorderUrgency(partner.next_expected_order)
    const cls = urgency === 'overdue'
      ? 'text-red-500 font-medium'
      : urgency === 'soon'
      ? 'text-amber-500 font-medium'
      : 'text-gray-500'
    return <span className={`text-sm ${cls}`}>{formatDate(partner.next_expected_order)}</span>
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Partners</h1>
          <p className="text-sm text-gray-500 mt-0.5">{partners.length} partners total</p>
        </div>
        <button onClick={() => setModal('add')} className="btn-primary">
          <Plus size={16} /> Add Partner
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 w-56"
            placeholder="Search partners…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-[#3D6034] text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
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
                {['Name', 'Status', 'Contact', 'Price/KG', 'Projected KG/mo', 'Last Order', 'Next Order', 'Total Orders', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">No partners found</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 group">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/partners/${p.id}`)}
                      className="text-sm font-medium text-gray-900 hover:text-[#3D6034] flex items-center gap-1"
                    >
                      {p.name}
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.contact_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.price_per_kg ? formatCurrency(p.price_per_kg) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.projected_kg_month ? `${p.projected_kg_month}kg` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(p.last_order_date)}</td>
                  <td className="px-4 py-3"><NextOrderCell partner={p} /></td>
                  <td className="px-4 py-3 text-sm text-gray-700">{p.total_orders || 0}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setModal(p)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <PartnerModal
          partner={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
