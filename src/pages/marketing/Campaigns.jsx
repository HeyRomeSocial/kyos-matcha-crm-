import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { Plus, X, Pencil, Trash2, Megaphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const TYPES = ['email', 'social', 'event', 'promotion', 'other']
const STATUSES = ['draft', 'active', 'paused', 'completed']

const TYPE_STYLES = {
  email:     'bg-blue-100 text-blue-700',
  social:    'bg-purple-100 text-purple-700',
  event:     'bg-amber-100 text-amber-700',
  promotion: 'bg-pink-100 text-pink-700',
  other:     'bg-gray-100 text-gray-600',
}

const STATUS_STYLES = {
  draft:     'bg-gray-100 text-gray-600',
  active:    'bg-green-100 text-[#3D6034]',
  paused:    'bg-amber-100 text-amber-600',
  completed: 'bg-blue-100 text-blue-600',
}

function CampaignModal({ campaign, onClose, onSaved }) {
  const [form, setForm] = useState(campaign || {
    title: '', type: 'email', status: 'draft',
    start_date: '', end_date: '', target: '', description: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title required'); return }
    setSaving(true)
    const payload = { ...form, start_date: form.start_date || null, end_date: form.end_date || null }
    let error
    if (campaign?.id) {
      ;({ error } = await supabase.from('campaigns').update(payload).eq('id', campaign.id))
    } else {
      ;({ error } = await supabase.from('campaigns').insert(payload))
    }
    if (error) toast.error(error.message)
    else { toast.success(campaign?.id ? 'Campaign updated' : 'Campaign created'); onSaved() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold">{campaign?.id ? 'Edit Campaign' : 'New Campaign'}</h2>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">Campaign Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. June Cafe Partner Newsletter" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input type="date" className="input" value={form.start_date || ''} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" className="input" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Target Audience</label>
            <input className="input" value={form.target || ''} onChange={e => set('target', e.target.value)} placeholder="e.g. All active cafes, London partners" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Campaign'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')

  const load = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false })
    setCampaigns(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteCampaign(id) {
    await supabase.from('campaigns').delete().eq('id', id)
    toast.success('Campaign deleted')
    load()
  }

  const filtered = campaigns.filter(c => filterStatus === 'all' || c.status === filterStatus)
  const counts = STATUSES.reduce((acc, s) => ({ ...acc, [s]: campaigns.filter(c => c.status === s).length }), {})

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">{campaigns.length} campaigns · {counts.active || 0} active</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary"><Plus size={16} /> New Campaign</button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {['all', ...STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
              filterStatus === s ? 'bg-[#3D6034] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s === 'all' ? `All (${campaigns.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      {/* Campaigns grid */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2 border-gray-200">
          <Megaphone size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No campaigns yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Create your first campaign to track marketing activity</p>
          <button onClick={() => setModal({})} className="btn-primary mx-auto">New Campaign</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[c.type]}`}>{c.type}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setModal(c)} className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-100"><Pencil size={13} /></button>
                  <button onClick={() => deleteCampaign(c.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 size={13} /></button>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{c.title}</h3>
              {c.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{c.description}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
                {c.start_date && <span>📅 {formatDate(c.start_date)}{c.end_date ? ` → ${formatDate(c.end_date)}` : ''}</span>}
                {c.target && <span>🎯 {c.target}</span>}
              </div>
              {c.notes && <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">{c.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <CampaignModal
          campaign={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
