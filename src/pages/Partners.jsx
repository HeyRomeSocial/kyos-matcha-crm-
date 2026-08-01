import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, reorderUrgency } from '../lib/utils'
import PartnerModal from '../components/PartnerModal'
import { Plus, Search, Pencil, ExternalLink, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Mail, Copy, Download, X } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUSES = ['all', 'prospect', 'sample_sent', 'active', 'inactive', 'not_interested']

const STATUS_LABELS = {
  prospect: 'Prospect',
  sample_sent: 'Sample Sent',
  active: 'Active',
  inactive: 'Inactive',
  not_interested: 'Not Interested',
}

const STATUS_COLORS = {
  prospect: 'bg-blue-100 text-blue-700',
  sample_sent: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-[#3D6034]',
  inactive: 'bg-gray-100 text-gray-600',
  not_interested: 'bg-red-100 text-red-600',
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
  const [sortKey, setSortKey] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [showEmailModal, setShowEmailModal] = useState(false)

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-gray-300 ml-1 inline" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-[#3D6034] ml-1 inline" />
      : <ChevronDown size={12} className="text-[#3D6034] ml-1 inline" />
  }

  async function load() {
    const [{ data: p }, { data: orders }] = await Promise.all([
      supabase.from('partners').select('*').order('name'),
      supabase.from('orders').select('partner_id, total, line_items, date'),
    ])

    // Build per-partner CRM stats from actual orders
    const crmStats = (orders || []).reduce((acc, o) => {
      if (!o.partner_id) return acc
      acc[o.partner_id] = acc[o.partner_id] || { orders: 0, kg: 0, spent: 0, lastDate: null }
      acc[o.partner_id].orders += 1
      acc[o.partner_id].spent += Number(o.total) || 0
      acc[o.partner_id].kg += (o.line_items || []).reduce((s, li) =>
        li.desc?.toLowerCase().includes('matcha') ? s + (Number(li.qty) || 0) : s, 0)
      if (!acc[o.partner_id].lastDate || o.date > acc[o.partner_id].lastDate) {
        acc[o.partner_id].lastDate = o.date
      }
      return acc
    }, {})

    // Combine: historical (CSV import) + CRM orders
    const enriched = (p || []).map(partner => {
      const crm = crmStats[partner.id] || { orders: 0, kg: 0, spent: 0, lastDate: null }
      const historicalKg = Number(partner.total_kg) || 0
      const historicalOrders = Number(partner.total_orders) || 0
      const historicalSpent = historicalKg * (Number(partner.price_per_kg) || 0)
      const lastOrder = [partner.last_order_date, crm.lastDate].filter(Boolean).sort().pop() || null
      return {
        ...partner,
        combined_orders: historicalOrders + crm.orders,
        combined_kg: historicalKg + crm.kg,
        combined_spent: historicalSpent + crm.spent,
        combined_last_order: lastOrder,
      }
    })

    setPartners(enriched)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Real-time: refresh when orders or partners change
    const channel = supabase.channel('partners_page_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function deletePartner(partner) {
    const { error } = await supabase.from('partners').delete().eq('id', partner.id)
    if (error) toast.error(error.message)
    else { toast.success(`${partner.name} deleted`); load() }
    setConfirmDelete(null)
  }

  const filtered = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 21)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const list = partners.filter(p => {
      const lastOrder = p.combined_last_order || p.last_order_date || null
      const noOrderIn30 = p.status === 'active' && (!lastOrder || lastOrder < cutoffStr)

      const matchStatus = filter === 'all'
        || p.status === filter
        || (filter === 'inactive' && noOrderIn30)

      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.contact_name?.toLowerCase().includes(search.toLowerCase())
      return matchStatus && matchSearch
    })
    return [...list].sort((a, b) => {
      // Inactive tab: active partners with no order in 21 days first, then truly inactive, both sorted oldest last order first
      if (filter === 'inactive') {
        const aNoOrder = a.status === 'active'
        const bNoOrder = b.status === 'active'
        if (aNoOrder && !bNoOrder) return -1
        if (!aNoOrder && bNoOrder) return 1
        const al = a.combined_last_order || a.last_order_date || ''
        const bl = b.combined_last_order || b.last_order_date || ''
        if (!al && !bl) return a.name?.localeCompare(b.name)
        if (!al) return -1
        if (!bl) return 1
        return al.localeCompare(bl)
      }
      let av, bv
      switch (sortKey) {
        case 'name':         av = a.name?.toLowerCase(); bv = b.name?.toLowerCase(); break
        case 'total_orders': av = a.combined_orders || 0; bv = b.combined_orders || 0; break
        case 'total_kg':     av = a.combined_kg || 0;     bv = b.combined_kg || 0;     break
        case 'total_spent':  av = a.combined_spent || 0;  bv = b.combined_spent || 0;  break
        case 'last_order':   av = a.combined_last_order || ''; bv = b.combined_last_order || ''; break
        case 'next_order':   av = a.next_expected_order || ''; bv = b.next_expected_order || ''; break
        case 'price_per_kg': av = a.price_per_kg || 0;   bv = b.price_per_kg || 0;  break
        case 'created_at':   av = a.joined_date || a.created_at || ''; bv = b.joined_date || b.created_at || ''; break
        default:             av = a.name?.toLowerCase(); bv = b.name?.toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [partners, filter, search, sortKey, sortDir])

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
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmailModal(true)} className="btn-secondary">
            <Mail size={15} /> Email List
          </button>
          <button onClick={() => setModal('add')} className="btn-primary">
            <Plus size={16} /> Add Partner
          </button>
        </div>
      </div>

      {/* Follow-up due alert */}
      {(() => {
        const today = new Date().toISOString().slice(0, 10)
        const due = partners.filter(p => p.status === 'not_interested' && p.follow_up_date && p.follow_up_date <= today)
        if (!due.length) return null
        return (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-xs font-semibold text-amber-700 mb-2">⏰ {due.length} cafe{due.length > 1 ? 's' : ''} ready to follow up — marked Not Interested but it's been 3 months:</p>
            <div className="flex flex-wrap gap-2">
              {due.map(p => (
                <button
                  key={p.id}
                  onClick={() => setModal(p)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 font-medium"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

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
                {[
                  { label: 'Name',         key: 'name' },
                  { label: 'Status',       key: null },
                  { label: 'Contact',      key: null },
                  { label: 'Price/KG',     key: 'price_per_kg' },
                  { label: 'Total Orders', key: 'total_orders' },
                  { label: 'Total KG',     key: 'total_kg' },
                  { label: 'Total Spent',  key: 'total_spent' },
                  { label: 'Last Order',   key: 'last_order' },
                  { label: 'Next Order',   key: 'next_order' },
                  { label: 'Added',        key: 'created_at' },
                  { label: '',             key: null },
                ].map(({ label, key }) => (
                  <th
                    key={label}
                    onClick={() => key && handleSort(key)}
                    className={`text-left text-xs font-medium px-4 py-3 whitespace-nowrap select-none ${
                      key ? 'cursor-pointer hover:text-gray-700 text-gray-400' : 'text-gray-400'
                    } ${sortKey === key ? 'text-[#3D6034]' : ''}`}
                  >
                    {label}{key && <SortIcon col={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">No partners found</td></tr>
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
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.combined_orders || 0}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.combined_kg ? `${Number(p.combined_kg).toFixed(1)}kg` : '—'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#3D6034]">
                    {p.combined_spent ? formatCurrency(p.combined_spent) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(p.combined_last_order)}</td>
                  <td className="px-4 py-3"><NextOrderCell partner={p} /></td>
                  <td className="px-4 py-3 text-sm text-gray-400">{formatDate((p.joined_date || p.created_at || '').slice(0,10)) || '—'}</td>
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

      {showEmailModal && (() => {
        const activeNoEmail = partners.filter(p => p.status === 'active' && !p.email)
        const withEmail = partners.filter(p => p.email)
        const emailsOnly = withEmail.map(p => p.email).join(', ')
        const activeEmails = partners.filter(p => p.status === 'active' && p.email)
        const csvContent = 'Name,Email,Status\n' + withEmail.map(p =>
          `"${p.name}","${p.email}","${p.status}"`
        ).join('\n')

        function copyAll() {
          navigator.clipboard.writeText(emailsOnly)
          toast.success(`${withEmail.length} emails copied`)
        }
        function copyActive() {
          navigator.clipboard.writeText(activeEmails.map(p => p.email).join(', '))
          toast.success(`${activeEmails.length} active partner emails copied`)
        }
        function downloadCsv() {
          const blob = new Blob([csvContent], { type: 'text/csv' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'kyos-partner-emails.csv'
          a.click()
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '85vh' }}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Partner Email List</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{withEmail.length} of {partners.length} partners have an email saved</p>
                </div>
                <button onClick={() => setShowEmailModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>

              {/* Missing emails alert */}
              {activeNoEmail.length > 0 && (
                <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-700">⚠ {activeNoEmail.length} active partners missing an email:</p>
                  <p className="text-xs text-amber-600 mt-1">{activeNoEmail.map(p => p.name).join(', ')}</p>
                  <p className="text-[10px] text-amber-500 mt-1">Go to their partner profile to add an email address.</p>
                </div>
              )}

              <div className="p-4 flex gap-2">
                <button onClick={copyActive} className="flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg bg-[#3D6034] text-white hover:bg-[#2E4A27]">
                  <Copy size={13} /> Copy Active ({activeEmails.length})
                </button>
                <button onClick={copyAll} className="flex-1 inline-flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  <Copy size={13} /> Copy All ({withEmail.length})
                </button>
                <button onClick={downloadCsv} className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                  <Download size={13} />
                </button>
              </div>

              <div className="px-4 pb-2">
                <textarea
                  readOnly
                  className="w-full text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3 resize-none font-mono"
                  rows={3}
                  value={emailsOnly}
                  onClick={e => e.target.select()}
                />
                <p className="text-[10px] text-gray-400 mt-1">Click the box to select all · paste into Gmail BCC or Mailchimp</p>
              </div>

              <div className="overflow-y-auto flex-1 px-4 pb-4">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 py-2">Cafe</th>
                      <th className="text-left text-xs font-medium text-gray-400 py-2">Email</th>
                      <th className="text-left text-xs font-medium text-gray-400 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withEmail.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-xs font-medium text-gray-800 pr-3">{p.name}</td>
                        <td className="py-2 text-xs text-gray-500">{p.email}</td>
                        <td className="py-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            p.status === 'active' ? 'bg-[#EEF3EC] text-[#3D6034]' :
                            p.status === 'sample_sent' ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                    {activeNoEmail.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0 bg-amber-50/40">
                        <td className="py-2 text-xs font-medium text-gray-700 pr-3">{p.name}</td>
                        <td className="py-2 text-xs text-amber-500 italic">no email — add in profile</td>
                        <td className="py-2"><span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-[#EEF3EC] text-[#3D6034]">active</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
