import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { Plus, Target, TrendingUp, Package, Users, Pencil, X } from 'lucide-react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

function GoalModal({ goal, onClose, onSaved }) {
  const [form, setForm] = useState(goal || {
    month: format(new Date(), 'yyyy-MM') + '-01',
    target_revenue: '',
    target_kg: '',
    target_new_cafes: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const payload = {
      month: form.month,
      target_revenue: Number(form.target_revenue) || 0,
      target_kg: Number(form.target_kg) || 0,
      target_new_cafes: Number(form.target_new_cafes) || 0,
    }
    let error
    if (goal?.id) {
      ;({ error } = await supabase.from('goals').update(payload).eq('id', goal.id))
    } else {
      ;({ error } = await supabase.from('goals').insert(payload))
    }
    if (error) toast.error(error.message)
    else { toast.success('Goal saved'); onSaved() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold">{goal?.id ? 'Edit Goal' : 'Set Monthly Goal'}</h2>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Month</label>
            <input
              type="month"
              className="input"
              value={form.month?.slice(0, 7)}
              onChange={e => set('month', e.target.value + '-01')}
            />
          </div>
          <div>
            <label className="label">Revenue Target (£)</label>
            <input type="number" className="input" value={form.target_revenue} onChange={e => set('target_revenue', e.target.value)} placeholder="e.g. 5000" />
          </div>
          <div>
            <label className="label">KG Target</label>
            <input type="number" className="input" value={form.target_kg} onChange={e => set('target_kg', e.target.value)} placeholder="e.g. 30" />
          </div>
          <div>
            <label className="label">New Cafes Target</label>
            <input type="number" className="input" value={form.target_new_cafes} onChange={e => set('target_new_cafes', e.target.value)} placeholder="e.g. 5" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProgressBar({ value, target, color = '#3D6034' }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0
  const status = pct >= 100 ? 'hit' : pct >= 70 ? 'on_track' : 'at_risk'
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{pct.toFixed(0)}% achieved</span>
        <span className={`font-medium ${status === 'hit' ? 'text-[#3D6034]' : status === 'on_track' ? 'text-amber-500' : 'text-red-500'}`}>
          {status === 'hit' ? '✓ Goal Hit!' : status === 'on_track' ? 'On Track' : 'At Risk'}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#3D6034' : pct >= 70 ? '#f59e0b' : '#ef4444' }}
        />
      </div>
    </div>
  )
}

export default function Goals() {
  const [goals, setGoals] = useState([])
  const [partners, setPartners] = useState([])
  const [orders, setOrders] = useState([])
  const [modal, setModal] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const [{ data: g }, { data: p }, { data: o }] = await Promise.all([
      supabase.from('goals').select('*').order('month', { ascending: false }),
      supabase.from('partners').select('*'),
      supabase.from('orders').select('*'),
    ])
    setGoals(g || [])
    setPartners(p || [])
    setOrders(o || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteGoal(id) {
    await supabase.from('goals').delete().eq('id', id)
    toast.success('Goal removed')
    load()
  }

  // Calculate actuals for a given month
  function getActuals(monthStr) {
    const start = format(startOfMonth(parseISO(monthStr)), 'yyyy-MM-dd')
    const end = format(endOfMonth(parseISO(monthStr)), 'yyyy-MM-dd')

    // Revenue from orders in CRM for that month
    const monthOrders = orders.filter(o => o.date >= start && o.date <= end)
    const revenue = monthOrders.reduce((s, o) => s + (o.total || 0), 0)

    // KG from orders
    const kg = monthOrders.reduce((s, o) =>
      s + (o.line_items || []).reduce((a, li) =>
        li.desc?.toLowerCase().includes('matcha') ? a + (li.qty || 0) : a, 0), 0)

    // New cafes onboarded that month (using created_at)
    const newCafes = partners.filter(p => {
      if (!p.created_at) return false
      const d = p.created_at.slice(0, 10)
      return d >= start && d <= end
    }).length

    return { revenue, kg, newCafes }
  }

  // Current month goal
  const currentMonthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const currentGoal = goals.find(g => g.month?.slice(0, 7) === currentMonthStr.slice(0, 7))
  const currentActuals = currentGoal ? getActuals(currentGoal.month) : null

  // All-time totals for milestones
  const totalKg = partners.reduce((s, p) => s + (Number(p.total_kg) || 0), 0)
  const totalRevenue = partners.reduce((s, p) => s + (Number(p.total_kg) || 0) * (Number(p.price_per_kg) || 0), 0)
  const activeCafes = partners.filter(p => p.status === 'active').length

  const milestones = [
    { label: 'Active Cafes', current: activeCafes, target: 100, unit: 'cafes', icon: Users },
    { label: 'Total KG Supplied', current: totalKg, target: 1000, unit: 'kg', icon: Package },
    { label: 'Total Revenue', current: totalRevenue, target: 100000, unit: '£', icon: TrendingUp },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Goals & Mission</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track monthly targets and business milestones</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary">
          <Plus size={16} /> Set Goal
        </button>
      </div>

      {/* Mission milestones */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">🌱 Mission Progress</h2>
        <p className="text-xs text-gray-400 mb-5">Long-term business milestones — all time</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {milestones.map(m => {
            const pct = Math.min((m.current / m.target) * 100, 100)
            const Icon = m.icon
            return (
              <div key={m.label} className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#EEF3EC] rounded-lg">
                    <Icon size={14} className="text-[#3D6034]" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">{m.label}</span>
                </div>
                <div>
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {m.unit === '£' ? formatCurrency(m.current) : `${m.current.toFixed(m.unit === 'kg' ? 1 : 0)}${m.unit !== '£' ? m.unit : ''}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      of {m.unit === '£' ? formatCurrency(m.target) : `${m.target}${m.unit}`}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#3D6034' : '#3D6034', opacity: pct >= 100 ? 1 : 0.6 + pct * 0.004 }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct.toFixed(0)}% to goal{pct >= 100 ? ' 🎉' : ''}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current month goal */}
      {currentGoal && currentActuals && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                🎯 {format(parseISO(currentGoal.month), 'MMMM yyyy')} — Current Month
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Live progress against your targets</p>
            </div>
            <button onClick={() => setModal(currentGoal)} className="p-1.5 text-gray-400 hover:text-gray-700">
              <Pencil size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {currentGoal.target_revenue > 0 && (
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs text-gray-500 font-medium">Revenue</span>
                  <span className="text-xs text-gray-400">{formatCurrency(currentActuals.revenue)} / {formatCurrency(currentGoal.target_revenue)}</span>
                </div>
                <ProgressBar value={currentActuals.revenue} target={currentGoal.target_revenue} />
              </div>
            )}
            {currentGoal.target_kg > 0 && (
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs text-gray-500 font-medium">KG Supplied</span>
                  <span className="text-xs text-gray-400">{currentActuals.kg.toFixed(1)}kg / {currentGoal.target_kg}kg</span>
                </div>
                <ProgressBar value={currentActuals.kg} target={currentGoal.target_kg} />
              </div>
            )}
            {currentGoal.target_new_cafes > 0 && (
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs text-gray-500 font-medium">New Cafes</span>
                  <span className="text-xs text-gray-400">{currentActuals.newCafes} / {currentGoal.target_new_cafes}</span>
                </div>
                <ProgressBar value={currentActuals.newCafes} target={currentGoal.target_new_cafes} />
              </div>
            )}
          </div>
        </div>
      )}

      {!currentGoal && (
        <div className="card p-8 text-center border-dashed border-2 border-gray-200">
          <Target size={28} className="text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No goal set for this month</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Set a revenue, KG, or new cafe target to track your progress</p>
          <button onClick={() => setModal({})} className="btn-primary mx-auto">
            <Plus size={14} /> Set {format(new Date(), 'MMMM')} Goal
          </button>
        </div>
      )}

      {/* Past goals */}
      {goals.filter(g => g.month?.slice(0, 7) !== currentMonthStr.slice(0, 7)).length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Past Goals</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Month', 'Revenue Target', 'KG Target', 'New Cafes Target', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goals
                .filter(g => g.month?.slice(0, 7) !== currentMonthStr.slice(0, 7))
                .map(g => {
                  const actuals = getActuals(g.month)
                  return (
                    <tr key={g.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">
                        {format(parseISO(g.month), 'MMMM yyyy')}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {g.target_revenue > 0 ? (
                          <span className={actuals.revenue >= g.target_revenue ? 'text-[#3D6034] font-medium' : 'text-gray-500'}>
                            {actuals.revenue >= g.target_revenue ? '✓ ' : ''}{formatCurrency(g.target_revenue)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {g.target_kg > 0 ? `${g.target_kg}kg` : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">
                        {g.target_new_cafes > 0 ? g.target_new_cafes : '—'}
                      </td>
                      <td className="px-5 py-3 flex items-center gap-2">
                        <button onClick={() => setModal(g)} className="p-1.5 text-gray-300 hover:text-gray-600"><Pencil size={13} /></button>
                        <button onClick={() => deleteGoal(g.id)} className="p-1.5 text-gray-300 hover:text-red-500"><X size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <GoalModal
          goal={modal?.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
