import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { Plus, X, Pencil, Trash2, Search, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { isPast, parseISO } from 'date-fns'

const STATUSES = ['to_contact','contacted','responded','meeting_booked','sample_sent','converted','not_interested']
const CHANNELS = ['email','instagram','phone','referral','event','other']

const STATUS_LABELS = {
  to_contact: 'To Contact', contacted: 'Contacted', responded: 'Responded',
  meeting_booked: 'Meeting Booked', sample_sent: 'Sample Sent',
  converted: 'Converted ✓', not_interested: 'Not Interested',
}

const STATUS_STYLES = {
  to_contact:      'bg-gray-100 text-gray-600',
  contacted:       'bg-blue-100 text-blue-600',
  responded:       'bg-purple-100 text-purple-600',
  meeting_booked:  'bg-amber-100 text-amber-600',
  sample_sent:     'bg-orange-100 text-orange-600',
  converted:       'bg-green-100 text-[#3D6034]',
  not_interested:  'bg-red-100 text-red-500',
}

function OutreachModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item || {
    business_name: '', contact_name: '', email: '', phone: '',
    location: '', instagram: '', status: 'to_contact',
    channel: 'email', follow_up_date: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.business_name.trim()) { toast.error('Business name required'); return }
    setSaving(true)
    const payload = { ...form, follow_up_date: form.follow_up_date || null }
    let error
    if (item?.id) {
      ;({ error } = await supabase.from('outreach').update(payload).eq('id', item.id))
    } else {
      ;({ error } = await supabase.from('outreach').insert(payload))
    }
    if (error) toast.error(error.message)
    else { toast.success(item?.id ? 'Updated' : 'Outreach added'); onSaved() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold">{item?.id ? 'Edit Outreach' : 'Add Outreach'}</h2>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          <div>
            <label className="label">Business Name *</label>
            <input className="input" value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="e.g. Bloom Cafe" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contact Name</label>
              <input className="input" value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="e.g. London" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email || ''} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Instagram</label>
            <input className="input" value={form.instagram || ''} onChange={e => set('instagram', e.target.value)} placeholder="@handle" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Channel</label>
              <select className="input" value={form.channel} onChange={e => set('channel', e.target.value)}>
                {CHANNELS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Follow-up Date</label>
            <input type="date" className="input" value={form.follow_up_date || ''} onChange={e => set('follow_up_date', e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Outreach() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('outreach').select('*').order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteItem(id) {
    await supabase.from('outreach').delete().eq('id', id)
    toast.success('Removed')
    load()
  }

  const filtered = items.filter(i => {
    const ms = filterStatus === 'all' || i.status === filterStatus
    const mq = !search || i.business_name.toLowerCase().includes(search.toLowerCase()) ||
      i.contact_name?.toLowerCase().includes(search.toLowerCase())
    return ms && mq
  })

  const pipelineCounts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: items.filter(i => i.status === s).length }), {})

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Outreach</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} prospects · {pipelineCounts.converted} converted</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary"><Plus size={16} /> Add Prospect</button>
      </div>

      {/* Pipeline summary */}
      <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
            className={`card p-3 text-center cursor-pointer hover:shadow-md transition-all ${filterStatus === s ? 'ring-2 ring-[#3D6034]' : ''}`}
          >
            <p className="text-lg font-bold text-gray-900">{pipelineCounts[s] || 0}</p>
            <p className={`text-xs mt-0.5 font-medium px-1.5 py-0.5 rounded-full inline-block ${STATUS_STYLES[s]}`}>
              {STATUS_LABELS[s].replace(' ✓', '')}
            </p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input pl-8" placeholder="Search prospects…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Business', 'Contact', 'Location', 'Channel', 'Status', 'Follow-up', 'Notes', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Send size={24} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No prospects yet — add your first outreach target</p>
                  </td>
                </tr>
              ) : filtered.map(item => {
                const overdue = item.follow_up_date && item.status !== 'converted' && item.status !== 'not_interested' && isPast(parseISO(item.follow_up_date))
                return (
                  <tr key={item.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{item.business_name}</p>
                      {item.instagram && <p className="text-xs text-gray-400">{item.instagram}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.contact_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.location || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{item.channel}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {item.follow_up_date ? (
                        <span className={overdue ? 'text-red-500 font-medium text-xs' : 'text-gray-500 text-xs'}>
                          {overdue ? '⚠ ' : ''}{formatDate(item.follow_up_date)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{item.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal(item)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Pencil size={13} /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <OutreachModal
          item={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
