import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { calcNextOrder } from '../lib/utils'
import { syncToSheets } from '../lib/sheetsSync'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_OPTIONS = ['prospect', 'sample_sent', 'active', 'inactive']
const FREQ_OPTIONS = [
  { label: 'Weekly (7 days)', value: 7 },
  { label: 'Fortnightly (14 days)', value: 14 },
  { label: 'Monthly (30 days)', value: 30 },
  { label: 'Custom', value: 'custom' },
]

function empty() {
  return {
    name: '', contact_name: '', email: '', phone: '', address: '',
    status: 'prospect', price_per_kg: '', shipping_fee: '',
    projected_kg_month: '', reorder_frequency_days: 14,
    last_order_date: '', next_expected_order: '', notes: '',
  }
}

export default function PartnerModal({ partner, onClose, onSaved }) {
  const [form, setForm] = useState(partner ? { ...partner } : empty())
  const [freqMode, setFreqMode] = useState(() => {
    if (!partner?.reorder_frequency_days) return 14
    const found = FREQ_OPTIONS.find(f => f.value === partner.reorder_frequency_days)
    return found ? partner.reorder_frequency_days : 'custom'
  })
  const [saving, setSaving] = useState(false)

  function set(key, val) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if ((key === 'last_order_date' || key === 'reorder_frequency_days') && next.last_order_date && next.reorder_frequency_days) {
        next.next_expected_order = calcNextOrder(next.last_order_date, next.reorder_frequency_days) || next.next_expected_order
      }
      return next
    })
  }

  function handleFreq(val) {
    setFreqMode(val)
    if (val !== 'custom') {
      set('reorder_frequency_days', val)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Partner name is required'); return }
    setSaving(true)
    const payload = {
      ...form,
      price_per_kg: form.price_per_kg ? Number(form.price_per_kg) : null,
      shipping_fee: form.shipping_fee ? Number(form.shipping_fee) : null,
      projected_kg_month: form.projected_kg_month ? Number(form.projected_kg_month) : null,
      reorder_frequency_days: form.reorder_frequency_days ? Number(form.reorder_frequency_days) : null,
      last_order_date: form.last_order_date || null,
      next_expected_order: form.next_expected_order || null,
    }
    // Auto-stamp sample_sent_at the first time status is set to sample_sent
    const wasSampleSent = partner?.status === 'sample_sent'
    if (payload.status === 'sample_sent' && !wasSampleSent && !payload.sample_sent_at) {
      payload.sample_sent_at = format(new Date(), 'yyyy-MM-dd')
    }

    let error
    if (partner?.id) {
      ;({ error } = await supabase.from('partners').update(payload).eq('id', partner.id))
    } else {
      ;({ error } = await supabase.from('partners').insert(payload))
    }
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(partner?.id ? 'Partner updated' : 'Partner added')
      syncToSheets()
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">{partner?.id ? 'Edit Partner' : 'Add Partner'}</h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Business Name *</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Cafe Bloom" />
            </div>
            <div>
              <label className="label">Contact Name</label>
              <input className="input" value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 High Street, London, EC1A 1BB" />
            </div>
            <div>
              <label className="label">Price per KG (£)</label>
              <input type="number" step="0.01" className="input" value={form.price_per_kg} onChange={e => set('price_per_kg', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Shipping Fee (£)</label>
              <input type="number" step="0.01" className="input" value={form.shipping_fee} onChange={e => set('shipping_fee', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Projected KG / Month</label>
              <input type="number" step="0.1" className="input" value={form.projected_kg_month} onChange={e => set('projected_kg_month', e.target.value)} />
            </div>
            <div>
              <label className="label">Reorder Frequency</label>
              <select className="input" value={freqMode} onChange={e => handleFreq(Number(e.target.value) || e.target.value)}>
                {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            {freqMode === 'custom' && (
              <div>
                <label className="label">Custom Days</label>
                <input type="number" className="input" value={form.reorder_frequency_days} onChange={e => set('reorder_frequency_days', e.target.value)} placeholder="e.g. 21" />
              </div>
            )}
            <div>
              <label className="label">Last Order Date</label>
              <input type="date" className="input" value={form.last_order_date || ''} onChange={e => set('last_order_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Next Expected Order</label>
              <input type="date" className="input" value={form.next_expected_order || ''} onChange={e => set('next_expected_order', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Partner'}
          </button>
        </div>
      </div>
    </div>
  )
}
