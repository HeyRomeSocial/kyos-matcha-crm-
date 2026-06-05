import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, reorderUrgency } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { Plus, Search, Pencil, ExternalLink, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

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

function ConfirmDialog({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Delete Cafe</h3>
        <p className="text-sm text-gray-500 mb-6">
          Are you sure you want to delete <strong>{name}</strong>? Their order history will remain but the cafe record will be removed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Partners() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    const { data } = await supabase.from('partners').select('*').order('name')
    setPartners(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deletePartner(partner) {
    const { error } = await supabase.from('partners').delete().eq('id', partner.id)
    if (error) toast.error(error.message)
    else { toast.success(`${partner.name} deleted`); load() }
    setConfirmDelete(null)
  }

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
          <h1 className="text-xl font-bold text-gray-900">Cafes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{partners.length} cafes total</p>
        </div>
        <button onClick={() => setModal('add')} className="btn-primary">
          <Plus size={16} /> Add Cafe
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 w-56"
            placeholder="Search cafes…"
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
                {['Name', 'Status', 'Contact', 'Price/KG', 'Total Orders', 'Total KG', 'Total Spent', 'Last Order', 'Next Order', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No cafes found</td></tr>
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
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.total_orders || 0}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.total_kg ? `${Number(p.total_kg).toFixed(1)}kg` : '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#3D6034]">{p.total_spent ? formatCurrency(p.total_spent) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(p.last_order_date)}</td>
                  <td className="px-4 py-3"><NextOrderCell partner={p} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setModal(p)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
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

      {confirmDelete && (
        <ConfirmDialog
          name={confirmDelete.name}
          onConfirm={() => deletePartner(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
