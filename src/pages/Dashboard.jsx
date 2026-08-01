import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus, reorderUrgency, lineItemKg } from '../lib/utils'
import {
  Users, Package, TrendingUp, AlertCircle, ShoppingBag, Plus,
  Settings2, X, ChevronRight, CheckCircle, Circle, Clock
} from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, LineElement, PointElement, Filler
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { format, subMonths, startOfMonth, endOfMonth, isPast, parseISO, getDaysInMonth } from 'date-fns'
import { Download, Calendar, DollarSign, Edit2, Check, History, Send } from 'lucide-react'
import { restockInventory, adjustInventory } from '../lib/inventory'
import { syncToSheets } from '../lib/sheetsSync'
import toast from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, Filler)

// ─── Widget registry ──────────────────────────────────────────────────────────
const KPI_CARDS = [
  { id: 'kpi_kg',        label: 'Total KG Sold',        defaultOn: true },
  { id: 'kpi_revenue',   label: 'Total Revenue',         defaultOn: true },
  { id: 'kpi_partners',  label: 'Partners Ordering',     defaultOn: true },
  { id: 'kpi_outstanding', label: 'Outstanding',         defaultOn: true },
  { id: 'kpi_mtd',       label: 'Revenue MTD',           defaultOn: true },
  { id: 'kpi_kg_mtd',   label: 'KG MTD',                defaultOn: true },
  { id: 'kpi_ytd',       label: 'Revenue YTD',           defaultOn: true },
  { id: 'kpi_alltime',   label: 'All Time Revenue',      defaultOn: true },
  { id: 'kpi_pouches',      label: 'Retail Pouches Sold',        defaultOn: true },
  { id: 'kpi_kits',         label: 'Starter Kits Sold',          defaultOn: true },
  { id: 'kpi_no_order',       label: 'Active — No Order This Month', defaultOn: true },
  { id: 'kpi_samples_mtd',   label: 'Samples Sent This Month',      defaultOn: true },
  { id: 'kpi_samples_total', label: 'Samples Sent All Time',        defaultOn: true },
  { id: 'kpi_converted',     label: 'Converted from Sample',        defaultOn: true },
]

const WIDGETS = [
  { id: 'kpis',       label: 'KPI Cards',            defaultOn: true },
  { id: 'daily',      label: 'Daily Revenue Chart',  defaultOn: true },
  { id: 'conversion', label: 'Conversion Gauge',     defaultOn: true },
  { id: 'chart',      label: '12-Month Revenue',     defaultOn: true },
  { id: 'goals',      label: 'Monthly Goals',        defaultOn: true },
  { id: 'tasks',      label: 'Open Tasks',           defaultOn: true },
  { id: 'partners',   label: 'Top 5 Partners',       defaultOn: true },
  { id: 'reorders',   label: 'Upcoming Reorders',           defaultOn: true },
  { id: 'invoices',   label: 'Recent Invoices',             defaultOn: true },
  { id: 'no_order',   label: 'Active — No Order This Month', defaultOn: true },
  { id: 'inventory',  label: 'Matcha Inventory',            defaultOn: true },
  { id: 'mission',    label: 'Mission Progress',            defaultOn: false },
  { id: 'samples',    label: 'Recent Samples Sent',         defaultOn: true },
]

// Conversion gauge — SVG semicircle
function ConversionGauge({ ordering, total, sampleSent, prospects }) {
  const pct = total > 0 ? (ordering / total) * 100 : 0
  // Arc geometry: semicircle from 180° to 0°, radius 60, centre (80,85)
  const angle = Math.PI * (1 - pct / 100)
  const x = 80 + 60 * Math.cos(angle)
  const y = 85 - 60 * Math.sin(angle)
  const largeArc = pct > 50 ? 0 : 0
  return (
    <div>
      <svg viewBox="0 0 160 100" className="w-full h-auto">
        <path d="M20,85 A60,60 0 0,1 140,85" fill="none" stroke="#EEF3EC" strokeWidth="14" strokeLinecap="round" />
        {pct > 0 && (
          <path
            d={`M20,85 A60,60 0 ${largeArc},1 ${x.toFixed(1)},${y.toFixed(1)}`}
            fill="none" stroke="#3D6034" strokeWidth="14" strokeLinecap="round"
          />
        )}
        <text x="80" y="70" textAnchor="middle" fontSize="24" fontWeight="700" fill="#111">{pct.toFixed(0)}%</text>
        <text x="80" y="88" textAnchor="middle" fontSize="9" fill="#9ca3af">{ordering} of {total} converted</text>
      </svg>
      <div className="flex justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3D6034] inline-block" />Ordering {ordering}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-300 inline-block" />Sample {sampleSent}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Prospect {prospects}</span>
      </div>
    </div>
  )
}

// Animated count-up — rolls the number from its previous value to the target
function useCountUp(target, duration = 2200) {
  const [display, setDisplay] = useState(0)
  const fromRef = React.useRef(0)
  const rafRef = React.useRef(null)

  useEffect(() => {
    const from = fromRef.current
    const start = performance.now()
    function tick(now) {
      const t = Math.min((now - start) / duration, 1)
      // ease-out cubic — fast start, gentle landing
      const eased = 1 - Math.pow(1 - t, 3)
      const value = from + (target - from) * eased
      setDisplay(value)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

// Split-flap clock style digit card
function FlipDigit({ char }) {
  const isDigit = /\d/.test(char)
  if (!isDigit) {
    // Comma separator — no card
    return (
      <span style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: 'clamp(28px, 3.2vw, 44px)',
        fontWeight: 700,
        alignSelf: 'flex-end',
        paddingBottom: 'clamp(6px, 0.8vw, 12px)',
        margin: '0 1px',
      }}>{char}</span>
    )
  }
  return (
    <span style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 'clamp(40px, 4.6vw, 64px)',
      height: 'clamp(56px, 6.4vw, 88px)',
      background: 'rgba(20,33,15,0.92)',
      borderRadius: 'clamp(8px, 0.9vw, 12px)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      fontFamily: 'Inter, sans-serif',
      fontWeight: 700,
      fontSize: 'clamp(34px, 3.8vw, 54px)',
      color: '#EEF3EC',
      lineHeight: 1,
      margin: '0 2px',
      overflow: 'hidden',
    }}>
      {char}
      {/* horizontal flip line */}
      <span style={{
        position: 'absolute', left: 0, right: 0, top: '50%',
        height: '1.5px', background: 'rgba(0,0,0,0.45)',
      }} />
      {/* top half subtle shade */}
      <span style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: '50%',
        background: 'rgba(255,255,255,0.04)',
      }} />
    </span>
  )
}

function HeroBanner({ totalKg, activePartners, today }) {
  const matchasServed = Math.round(totalKg * 500)
  const animated = useCountUp(matchasServed)

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '2 / 1' }}>
      <img
        src="/hero-products.jpg"
        alt="Kyo's Matcha products"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: 'center center' }}
        onError={e => { e.currentTarget.src = '/matcha-hero.jpg' }}
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(22,40,16,0.45) 0%, rgba(22,40,16,0.65) 100%)' }} />

      {/* Top row — logo + date */}
      <div className="absolute top-5 left-7 right-7 flex items-start justify-between">
        <img src="/logo.png" alt="Kyos Matcha" className="h-7 w-auto brightness-0 invert" />
        <div className="text-right">
          <p className="text-white/60 text-xs">{today}</p>
          <p className="text-white/80 text-xs mt-0.5">{activePartners} active partners</p>
        </div>
      </div>

      {/* Counter — positioned in the upper area so products stay visible */}
      <div className="absolute inset-x-0 flex flex-col items-center text-center px-4" style={{ top: '18%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {Math.round(animated).toLocaleString('en-GB').split('').map((char, i) => (
            <FlipDigit key={i} char={char} />
          ))}
        </div>
        <p className="text-white/85 font-semibold uppercase mt-5" style={{ letterSpacing: '0.4em', fontSize: 'clamp(11px, 1.1vw, 15px)' }}>
          Matchas Served Across The UK
        </p>
      </div>
    </div>
  )
}

function loadPrefs() {
  try {
    const saved = localStorage.getItem('km_dashboard_widgets')
    if (saved) {
      const parsed = JSON.parse(saved)
      // backfill any new widget or KPI keys missing from older saved prefs
      WIDGETS.forEach(w => { if (!(w.id in parsed)) parsed[w.id] = w.defaultOn })
      KPI_CARDS.forEach(k => { if (!(k.id in parsed)) parsed[k.id] = k.defaultOn })
      return parsed
    }
  } catch {}
  return Object.fromEntries([
    ...WIDGETS.map(w => [w.id, w.defaultOn]),
    ...KPI_CARDS.map(k => [k.id, k.defaultOn]),
  ])
}

function savePrefs(prefs) {
  localStorage.setItem('km_dashboard_widgets', JSON.stringify(prefs))
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, trend, color = '#3D6034' }) {
  return (
    <div className="card p-5 flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold mt-1.5 text-gray-900 tracking-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        {trend != null && (
          <span className={`inline-flex items-center text-xs font-medium mt-1 ${trend >= 0 ? 'text-[#3D6034]' : 'text-red-500'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}% vs last month
          </span>
        )}
      </div>
      <div className="p-2.5 rounded-xl flex-shrink-0" style={{ backgroundColor: color + '18' }}>
        <Icon size={18} style={{ color }} />
      </div>
    </div>
  )
}

function SectionHeader({ title, sub, linkTo, navigate }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {linkTo && (
        <button onClick={() => navigate(linkTo)} className="flex items-center gap-1 text-xs text-[#3D6034] hover:underline">
          View all <ChevronRight size={12} />
        </button>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge-paid">Paid</span>
  if (status === 'overdue') return <span className="badge-overdue">Overdue</span>
  return <span className="badge-unpaid">Unpaid</span>
}

function InventoryWidget({ inventory, onUpdate }) {
  const [restocking, setRestocking] = useState(null)
  const [editing, setEditing]       = useState(null)
  const [saving, setSaving]         = useState(false)
  const [history, setHistory]       = useState(null) // { item, logs }

  async function openHistory(item) {
    const { data } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('inventory_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setHistory({ item, logs: data || [] })
  }

  async function handleRestock() {
    if (!restocking || !restocking.qty) return
    setSaving(true)
    await restockInventory(restocking.item.id, restocking.qty, restocking.notes)
    await onUpdate()
    setRestocking(null)
    setSaving(false)
    toast.success(`${restocking.item.name} restocked +${restocking.qty}kg`)
  }

  async function handleAdjust() {
    if (!editing || editing.qty === '') return
    setSaving(true)
    await adjustInventory(editing.item.id, editing.qty)
    await onUpdate()
    setEditing(null)
    setSaving(false)
    toast.success(`${editing.item.name} updated`)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">🍵 Matcha Inventory</h2>
          <p className="text-xs text-gray-400 mt-0.5">Auto-deducted when invoices are created</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {inventory.map(item => {
          const stock  = Number(item.stock_kg)
          const thresh = Number(item.low_stock_threshold_kg)
          const pct    = thresh > 0 ? Math.min((stock / (thresh * 4)) * 100, 100) : 100
          const isLow  = stock <= thresh && stock > 0
          const isOut  = stock === 0

          return (
            <div key={item.id} className={`rounded-xl border p-4 ${isOut ? 'border-red-200 bg-red-50' : isLow ? 'border-amber-200 bg-amber-50' : 'border-[#d1e7cc] bg-[#EEF3EC]'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openHistory(item)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700"
                    title="View history"
                  >
                    <History size={13} />
                  </button>
                  <button
                    onClick={() => setEditing({ item, qty: stock })}
                    className="p-1 rounded text-gray-400 hover:text-gray-700"
                    title="Edit stock"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
              </div>

              {editing?.item.id === item.id ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    step="0.1"
                    className="input text-sm w-24 py-1"
                    value={editing.qty}
                    onChange={e => setEditing(ed => ({ ...ed, qty: e.target.value }))}
                    autoFocus
                  />
                  <span className="text-xs text-gray-500">kg</span>
                  <button onClick={handleAdjust} disabled={saving} className="p-1.5 rounded-lg bg-[#3D6034] text-white">
                    <Check size={12} />
                  </button>
                  <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg bg-gray-100 text-gray-500">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <p className={`text-3xl font-bold mt-1 ${isOut ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-[#1a3a12]'}`}>
                  {stock.toFixed(1)}<span className="text-base font-normal ml-1">kg</span>
                </p>
              )}

              <div className="mt-3 h-2 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOut ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-[#3D6034]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={`text-xs mt-1.5 ${isOut ? 'text-red-500 font-semibold' : isLow ? 'text-amber-600 font-semibold' : 'text-[#3D6034]'}`}>
                {isOut ? '✖ Out of stock' : isLow ? `⚠ Low — threshold ${thresh}kg` : `● In stock · threshold ${thresh}kg`}
              </p>

              <button
                onClick={() => setRestocking({ item, qty: '', notes: '' })}
                className="mt-3 w-full text-xs font-medium py-1.5 rounded-lg bg-white/80 hover:bg-white text-[#3D6034] border border-[#b3d0ab] transition-colors"
              >
                + Restock
              </button>
            </div>
          )
        })}
      </div>

      {/* Restock modal */}
      {restocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-semibold">Restock — {restocking.item.name}</h3>
            <p className="text-xs text-gray-500">Current stock: <strong>{Number(restocking.item.stock_kg).toFixed(1)}kg</strong></p>
            <div>
              <label className="label">Add KG</label>
              <input
                type="number" step="0.1" min="0"
                className="input"
                placeholder="e.g. 20"
                value={restocking.qty}
                onChange={e => setRestocking(r => ({ ...r, qty: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                placeholder="e.g. New batch from supplier"
                value={restocking.notes}
                onChange={e => setRestocking(r => ({ ...r, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRestocking(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleRestock} disabled={saving || !restocking.qty} className="btn-primary flex-1">
                {saving ? 'Saving…' : `+ ${restocking.qty || '0'}kg`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{history.item.name} — History</h3>
              <button onClick={() => setHistory(null)} className="p-1 rounded text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 space-y-2">
              {history.logs.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No history yet</p>}
              {history.logs.map(log => {
                const isPositive = log.qty_change > 0
                const typeLabel = log.type === 'sale' ? 'Sale' : log.type === 'restock' ? 'Restock' : 'Adjustment'
                const typeColor = log.type === 'sale' ? 'text-red-500' : 'text-[#3D6034]'
                return (
                  <div key={log.id} className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-gray-700">{typeLabel}</p>
                      {log.notes && <p className="text-xs text-gray-400">{log.notes}</p>}
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {format(new Date(log.created_at), 'dd MMM yyyy · HH:mm')}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${typeColor}`}>
                      {isPositive ? '+' : ''}{log.qty_change}kg
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoOrderModal({ partners, onClose, navigate }) {
  const now = new Date()
  const rows = partners.map(p => {
    const days = p.combined_last_order
      ? Math.floor((now - new Date(p.combined_last_order)) / 86400000)
      : null
    return { ...p, daysSince: days }
  }).sort((a, b) => (b.daysSince ?? 9999) - (a.daysSince ?? 9999))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Active Partners — No Order This Month</h2>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} partners · sorted by longest gap since last order</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-100">
                {['Partner','Contact','Email','Last Order','Days Since',''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr
                  key={p.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                  onClick={() => { onClose(); navigate(`/partners/${p.id}`) }}
                >
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    {p.phone && <p className="text-xs text-gray-400 mt-0.5">{p.phone}</p>}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{p.contact_name || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {p.email
                      ? <a href={`mailto:${p.email}`} onClick={e => e.stopPropagation()} className="text-[#3D6034] hover:underline">{p.email}</a>
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{p.combined_last_order ? formatDate(p.combined_last_order) : 'Never'}</td>
                  <td className="px-5 py-3">
                    {p.daysSince != null ? (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        p.daysSince > 60 ? 'bg-red-100 text-red-600' :
                        p.daysSince > 30 ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.daysSince}d ago
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); onClose(); navigate('/invoice', { state: { partnerId: p.id } }) }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[#EEF3EC] text-[#3D6034] hover:bg-[#d8e8d4] font-medium whitespace-nowrap"
                    >
                      + Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Customise Panel ──────────────────────────────────────────────────────────
function Toggle({ on, onClick }) {
  return (
    <div className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${on ? 'bg-[#3D6034]' : 'bg-gray-200'}`} onClick={onClick}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
    </div>
  )
}

function CustomisePanel({ prefs, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-80 h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Customise Dashboard</h2>
            <p className="text-xs text-gray-400 mt-0.5">Toggle widgets and KPI cards</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Widgets */}
          <div className="p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Widgets</p>
            {WIDGETS.map(w => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-700">{w.label}</span>
                <Toggle on={prefs[w.id]} onClick={() => onChange(w.id, !prefs[w.id])} />
              </div>
            ))}
          </div>

          {/* KPI Cards sub-section */}
          <div className="px-5 pb-5 space-y-2 border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">KPI Cards</p>
            {KPI_CARDS.map(k => (
              <div key={k.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-700">{k.label}</span>
                <Toggle on={prefs[k.id]} onClick={() => onChange(k.id, !prefs[k.id])} />
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-gray-100">
          <button
            onClick={() => {
              [...WIDGETS, ...KPI_CARDS].forEach(w => onChange(w.id, w.defaultOn))
            }}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-700"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(loadPrefs)
  const [customising, setCustomising] = useState(false)
  const [partners, setPartners] = useState([])
  const [orders, setOrders] = useState([])
  const [tasks, setTasks] = useState([])
  const [currentGoal, setCurrentGoal] = useState(null)
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [hoverOrder, setHoverOrder] = useState(null)
  const [showNoOrderModal, setShowNoOrderModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [period, setPeriod] = useState('week')
  const [periodOffset, setPeriodOffset] = useState(0) // 0 = current, 1 = one back, etc.
  const [showAllTime, setShowAllTime] = useState(true)

  async function handleSyncNow() {
    setSyncing(true)
    await syncToSheets()
    setSyncing(false)
    toast.success('Synced to Google Sheets')
  }

  function toggleWidget(id, val) {
    setPrefs(p => {
      const next = { ...p, [id]: val }
      savePrefs(next)
      return next
    })
  }

  useEffect(() => {
    async function load() {
      const currentMonthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const [{ data: p }, { data: o }, { data: t }, { data: g }, { data: inv }] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
        supabase.from('tasks').select('*').neq('status', 'done').order('due_date', { ascending: true }).limit(5),
        supabase.from('goals').select('*').eq('month', currentMonthStr).maybeSingle(),
        supabase.from('inventory').select('*').order('name'),
      ])
      const ordersByPartner = (o || []).reduce((acc, order) => {
        if (!order.partner_id) return acc
        if (!acc[order.partner_id] || order.date > acc[order.partner_id]) acc[order.partner_id] = order.date
        return acc
      }, {})
      setPartners((p || []).map(partner => ({
        ...partner,
        combined_last_order: [partner.last_order_date, ordersByPartner[partner.id]].filter(Boolean).sort().pop() || null,
      })))
      setOrders(o || [])
      setTasks(t || [])
      setCurrentGoal(g || null)
      setInventory(inv || [])
      setLoading(false)
    }
    load()

    // Real-time: refresh dashboard when orders or partners change
    const channel = supabase.channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // ── Computed values ──
  const activePartners = partners.filter(p => p.status === 'active').length

  // Historical baseline from CSV import (stored on partners table)
  const historicalKg = partners.reduce((s, p) => s + (Number(p.total_kg) || 0), 0)
  const historicalRevenue = partners.reduce((s, p) => s + (Number(p.total_kg) || 0) * (Number(p.price_per_kg) || 0), 0)
  const historicalOrders = partners.reduce((s, p) => s + (Number(p.total_orders) || 0), 0)

  // CRM orders — invoices created through this system
  const crmKg = orders.reduce((s, o) =>
    s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0)
  , 0)
  const crmRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0)
  const crmOrders = orders.length

  // Combined totals = historical + CRM
  const totalKgAllTime = historicalKg + crmKg
  const totalRevenueAllTime = historicalRevenue + crmRevenue
  const totalOrdersAllTime = historicalOrders + crmOrders

  // Retail pouches sold (50g units) across all CRM orders
  const totalPouchesSold = orders.reduce((s, o) =>
    s + (o.line_items || []).reduce((a, li) => {
      const desc = (li.desc || '').toLowerCase()
      if (desc.includes('50g') || desc.includes('retail pouch') || (desc.includes('pouch') && !desc.includes('matcha')))
        return a + (Number(li.qty) || 0)
      return a
    }, 0)
  , 0)

  // Starter kits sold across all CRM orders
  const totalStarterKitsSold = orders.reduce((s, o) =>
    s + (o.line_items || []).reduce((a, li) =>
      (li.desc || '').toLowerCase().includes('starter') ? a + (Number(li.qty) || 0) : a
    , 0)
  , 0)

  // Conversion: partners who have placed at least one order (historical or CRM)
  const crmPartnerIdsSet = new Set(orders.map(o => o.partner_id).filter(Boolean))
  const orderingPartners = partners.filter(p =>
    (Number(p.total_orders) || 0) > 0 || crmPartnerIdsSet.has(p.id)
  ).length
  const sampleSentCount = partners.filter(p => p.status === 'sample_sent').length
  const prospectCount = partners.filter(p => p.status === 'prospect').length

  // Sample stats
  const thisMonthKey = format(new Date(), 'yyyy-MM')
  const lastMonthKey = format(subMonths(new Date(), 1), 'yyyy-MM')
  const samplesSentThisMonth = partners.filter(p => p.sample_sent_at && p.sample_sent_at.slice(0,7) === thisMonthKey).length
  const samplesSentLastMonth = partners.filter(p => p.sample_sent_at && p.sample_sent_at.slice(0,7) === lastMonthKey).length
  const samplesMTDTrend = samplesSentLastMonth > 0 ? ((samplesSentThisMonth - samplesSentLastMonth) / samplesSentLastMonth) * 100 : null
  const samplesSentAllTime = partners.filter(p => p.sample_sent_at).length

  // Converted from sample = had sample_sent_at AND has placed at least one order
  const convertedFromSample = partners.filter(p => p.sample_sent_at && ((Number(p.total_orders) || 0) > 0 || crmPartnerIdsSet.has(p.id))).length
  const conversionRate = samplesSentAllTime > 0 ? ((convertedFromSample / samplesSentAllTime) * 100).toFixed(0) : 0

  // Recent sample sends — last 5
  const recentSamples = [...partners]
    .filter(p => p.sample_sent_at)
    .sort((a, b) => b.sample_sent_at.localeCompare(a.sample_sent_at))
    .slice(0, 5)

  // Outstanding — CRM invoices unpaid + overdue
  const outstanding = orders
    .filter(o => getOrderStatus(o) !== 'paid')
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Paid — CRM invoices marked as paid
  const totalPaid = orders
    .filter(o => getOrderStatus(o) === 'paid')
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Convenience refs for widgets that always show current-month context (goals, daily chart, no-order list)
  const _now = new Date()
  const lastMonthStart = format(startOfMonth(subMonths(_now, 1)), 'yyyy-MM-dd')
  const lastMonthEnd = format(endOfMonth(subMonths(_now, 1)), 'yyyy-MM-dd')

  // KG helper (used below and in chart)
  const sumKg = (list) => list.reduce((s, o) => s + (o.line_items || []).reduce((t, li) => t + lineItemKg(li), 0), 0)

  // Revenue YTD (paid only)
  const revYTD = orders
    .filter(o => o.status === 'paid' && o.date >= `${_now.getFullYear()}-01-01`)
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // ── Period date ranges (offset-aware) ──
  const now = new Date()
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1

  function getPeriodRange(p, offset) {
    if (p === 'day') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      const ds = format(d, 'yyyy-MM-dd')
      return { start: ds, end: ds }
    }
    if (p === 'week') {
      const wS = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - offset * 7)
      const wE = new Date(wS.getFullYear(), wS.getMonth(), wS.getDate() + 6)
      return { start: format(wS, 'yyyy-MM-dd'), end: format(wE, 'yyyy-MM-dd') }
    }
    if (p === 'month') {
      const d = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), offset)
      return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') }
    }
    // year
    const yr = now.getFullYear() - offset
    return { start: `${yr}-01-01`, end: `${yr}-12-31` }
  }

  function getPeriodLabel(p, offset) {
    if (p === 'day') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
      if (offset === 0) return `Today — ${format(d, 'd MMM yyyy')}`
      if (offset === 1) return `Yesterday — ${format(d, 'd MMM yyyy')}`
      return format(d, 'EEEE, d MMM yyyy')
    }
    if (p === 'week') {
      const wS = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - offset * 7)
      const wE = new Date(wS.getFullYear(), wS.getMonth(), wS.getDate() + 6)
      const label = offset === 0 ? 'This Week' : offset === 1 ? 'Last Week' : `${offset} Weeks Ago`
      return `${label} — ${format(wS, 'd MMM')}–${format(wE, 'd MMM yyyy')}`
    }
    if (p === 'month') {
      const d = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), offset)
      const label = offset === 0 ? 'This Month' : offset === 1 ? 'Last Month' : format(d, 'MMMM yyyy')
      return `${label} — ${format(d, 'MMMM yyyy')}`
    }
    const yr = now.getFullYear() - offset
    return offset === 0 ? `This Year — ${yr}` : `${yr}`
  }

  const todayStr = format(now, 'yyyy-MM-dd')
  const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  const pRange  = getPeriodRange(period, periodOffset)
  const ppRange = getPeriodRange(period, periodOffset + 1)
  const periodLabel = getPeriodLabel(period, periodOffset)

  const periodOrders     = orders.filter(o => o.date >= pRange.start && o.date <= pRange.end)
  const prevPeriodOrders = orders.filter(o => o.date >= ppRange.start && o.date <= ppRange.end)

  const periodRevenue     = periodOrders.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const prevPeriodRevenue = prevPeriodOrders.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const periodRevTrend    = prevPeriodRevenue > 0 ? ((periodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100 : null
  const periodPaid        = periodOrders.filter(o => getOrderStatus(o) === 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0)
  const periodOutstanding = periodOrders.filter(o => getOrderStatus(o) !== 'paid').reduce((s, o) => s + (Number(o.total) || 0), 0)

  const periodKg          = sumKg(periodOrders)
  const prevPeriodKg      = sumKg(prevPeriodOrders)
  const periodKgTrend     = prevPeriodKg > 0 ? ((periodKg - prevPeriodKg) / prevPeriodKg) * 100 : null

  const periodOrderCount  = periodOrders.length
  const prevOrderCount    = prevPeriodOrders.length
  const periodOrderTrend  = prevOrderCount > 0 ? ((periodOrderCount - prevOrderCount) / prevOrderCount) * 100 : null
  const periodAOV         = periodOrderCount > 0 ? periodRevenue / periodOrderCount : 0

  const periodActiveCafes = new Set(periodOrders.map(o => o.partner_id).filter(Boolean)).size

  // New cafes = partners whose first ever order falls in this period
  const firstOrderByPartner2 = orders.reduce((acc, o) => {
    if (!o.partner_id || !o.date) return acc
    if (!acc[o.partner_id] || o.date < acc[o.partner_id]) acc[o.partner_id] = o.date
    return acc
  }, {})
  // New Cafés = partners whose joined_date (or created_at fallback) falls in this period
  const periodNewCafes = partners.filter(p => {
    const d = (p.joined_date || (p.created_at || '').slice(0, 10))
    return d >= pRange.start && d <= pRange.end
  }).length

  const periodSamples     = partners.filter(p => p.sample_sent_at && p.sample_sent_at >= pRange.start && p.sample_sent_at <= pRange.end).length
  const prevPeriodSamples = partners.filter(p => p.sample_sent_at && p.sample_sent_at >= ppRange.start && p.sample_sent_at <= ppRange.end).length
  const periodSampleTrend = prevPeriodSamples > 0 ? ((periodSamples - prevPeriodSamples) / prevPeriodSamples) * 100 : null

  // ── Chart — period-aware ──
  function buildChartSlices() {
    if (period === 'day') {
      // Last 7 days
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)
        const ds = format(d, 'yyyy-MM-dd')
        return { label: format(d, 'EEE d'), start: ds, end: ds }
      })
    }
    if (period === 'week') {
      // Last 8 weeks
      return Array.from({ length: 8 }, (_, i) => {
        const wOff = 7 - i
        const wS = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - (wOff - 1) * 7)
        const wE = new Date(wS.getFullYear(), wS.getMonth(), wS.getDate() + 6)
        return { label: `W${format(wS, 'w')}`, start: format(wS, 'yyyy-MM-dd'), end: format(wE, 'yyyy-MM-dd') }
      })
    }
    if (period === 'year') {
      // Months in current year
      return Array.from({ length: now.getMonth() + 1 }, (_, i) => {
        const d = new Date(now.getFullYear(), i, 1)
        return { label: format(d, 'MMM'), start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') }
      })
    }
    // month: months from CRM start to now
    const CRM_START = new Date(2026, 5, 1)
    const totalM = (now.getFullYear() - CRM_START.getFullYear()) * 12 + (now.getMonth() - CRM_START.getMonth()) + 1
    return Array.from({ length: totalM }, (_, i) => {
      const d = new Date(CRM_START.getFullYear(), CRM_START.getMonth() + i, 1)
      return { label: format(d, 'MMM yy'), start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') }
    })
  }

  const chartSlices = buildChartSlices()
  const chartRevenues = chartSlices.map(s => orders.filter(o => o.date >= s.start && o.date <= s.end).reduce((t, o) => t + (o.total || 0), 0))
  const chartKgs = chartSlices.map(s => sumKg(orders.filter(o => o.date >= s.start && o.date <= s.end)))

  const kgLabelPlugin = {
    id: 'kgLabels',
    afterDatasetsDraw(chart) {
      const { ctx, data, scales: { x, y } } = chart
      data.datasets[0].data.forEach((val, i) => {
        const kg = chartKgs[i]
        if (!kg) return
        const xPos = x.getPixelForValue(i)
        const yPos = y.getPixelForValue(val)
        ctx.save()
        ctx.fillStyle = '#6b7280'
        ctx.font = '11px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${kg.toFixed(1)} kg`, xPos, yPos - 8)
        ctx.restore()
      })
    }
  }

  const chartData = {
    labels: chartSlices.map(s => s.label),
    datasets: [{
      type: 'bar',
      label: 'Revenue (£)',
      data: chartRevenues,
      backgroundColor: chartSlices.map((_, i) => i === chartSlices.length - 1 ? '#6B9E5E' : '#3D6034'),
      borderRadius: 6,
      borderSkipped: false,
      hoverBackgroundColor: '#2E4A27',
      maxBarThickness: 56,
    }],
  }
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: ctx => `  £${Number(ctx.raw).toLocaleString('en-GB', { minimumFractionDigits: 2 })}  ·  ${chartKgs[ctx.dataIndex]?.toFixed(1)} kg`,
        },
      },
    },
    scales: {
      y: {
        ticks: { callback: v => `£${Number(v).toLocaleString('en-GB')}`, color: '#9ca3af', font: { size: 11 } },
        grid: { color: '#f3f4f6' },
        border: { display: false },
      },
      x: {
        ticks: { color: '#6b7280', font: { size: 12 } },
        grid: { display: false },
        border: { display: false },
      },
    },
  }

  // Upcoming reorders
  const in14 = format(new Date(Date.now() + 14 * 86400000), 'yyyy-MM-dd')
  const upcoming = partners
    .filter(p => p.next_expected_order && p.next_expected_order <= in14 && p.status === 'active')
    .sort((a, b) => a.next_expected_order.localeCompare(b.next_expected_order))
    .slice(0, 8)

  // Active partners with no order this month
  const orderedThisMonth = new Set(
    orders.filter(o => o.date >= thisMonthStart && o.date <= thisMonthEnd).map(o => o.partner_id)
  )
  const noOrderThisMonth = partners
    .filter(p => p.status === 'active' && !orderedThisMonth.has(p.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  // Top 5 partners — calculated live from orders
  const partnerRevMap = orders.reduce((acc, o) => {
    if (!o.partner_id) return acc
    acc[o.partner_id] = acc[o.partner_id] || { revenue: 0, kg: 0, orders: 0, name: o.partner_name }
    acc[o.partner_id].revenue += Number(o.total) || 0
    acc[o.partner_id].kg += (o.line_items || []).reduce((s, li) => s + lineItemKg(li), 0)
    acc[o.partner_id].orders += 1
    return acc
  }, {})
  const topPartners = Object.entries(partnerRevMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
  const maxRevenue = topPartners[0]?.revenue || 1

  // Mission milestones
  const milestones = [
    { label: '100 Active Partners', current: activePartners, target: 100 },
    { label: '1,000 KG Supplied', current: totalKgAllTime, target: 1000, unit: 'kg' },
    { label: '£100k Revenue', current: totalRevenueAllTime, target: 100000, unit: '£' },  // includes shipping
  ]

  // Goals actuals
  const goalRevenue = orders.filter(o => o.date >= thisMonthStart && o.date <= thisMonthEnd).reduce((s, o) => s + (o.total || 0), 0)

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // ── Daily revenue chart ──
  const [dailyMonthOffset, setDailyMonthOffset] = useState(0) // 0 = current month
  const dailyMonth = subMonths(new Date(), dailyMonthOffset)
  const daysInMonth = getDaysInMonth(dailyMonth)
  const dailyMonthPrefix = format(dailyMonth, 'yyyy-MM')
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const dayStr = `${dailyMonthPrefix}-${String(i + 1).padStart(2, '0')}`
    return orders
      .filter(o => o.date === dayStr)
      .reduce((s, o) => s + (Number(o.total) || 0), 0)
  })
  const dailyChartData = {
    labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
    datasets: [{
      data: dailyData,
      borderColor: '#3D6034',
      backgroundColor: 'rgba(61,96,52,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: '#3D6034',
      borderWidth: 2.5,
    }],
  }
  const dailyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: items => `${items[0].label} ${format(dailyMonth, 'MMM yyyy')}`,
          label: ctx => `£${ctx.raw.toFixed(2)}`,
        },
      },
    },
    scales: {
      y: { ticks: { callback: v => `£${v}` }, grid: { color: '#f3f4f6' }, border: { display: false } },
      x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 10 } },
    },
  }

  // ── CSV report download ──
  function downloadReport() {
    const esc = v => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = []
    lines.push(`Kyos Matcha CRM Report — ${format(new Date(), 'd MMM yyyy HH:mm')}`)
    lines.push('')
    lines.push('PARTNERS')
    lines.push('Name,Status,Contact,Email,Price/KG,Total Orders,Total KG,Total Spent,Last Order')
    partners.forEach(p => {
      const crmOrdersFor = orders.filter(o => o.partner_id === p.id)
      const crmKgFor = crmOrdersFor.reduce((s, o) => s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0), 0)
      const crmSpentFor = crmOrdersFor.reduce((s, o) => s + (Number(o.total) || 0), 0)
      const histKg = Number(p.total_kg) || 0
      const histOrders = Number(p.total_orders) || 0
      const histSpent = histKg * (Number(p.price_per_kg) || 0)
      const lastOrder = [p.last_order_date, ...crmOrdersFor.map(o => o.date)].filter(Boolean).sort().pop() || ''
      lines.push([
        esc(p.name), esc(p.status), esc(p.contact_name), esc(p.email),
        p.price_per_kg || '', histOrders + crmOrdersFor.length,
        (histKg + crmKgFor).toFixed(1), (histSpent + crmSpentFor).toFixed(2), lastOrder,
      ].join(','))
    })
    lines.push('')
    lines.push('INVOICES')
    lines.push('Invoice #,Partner,Date,Subtotal,Total,Status,PDF URL')
    orders.forEach(o => {
      lines.push([
        esc(o.invoice_number), esc(o.partner_name), o.date || '',
        (Number(o.subtotal) || 0).toFixed(2), (Number(o.total) || 0).toFixed(2),
        getOrderStatus(o), esc(o.invoice_pdf_url),
      ].join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kyos-crm-report-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-7xl">

      {/* ── Hero banner with matchas served counter ── */}
      <HeroBanner
        totalKg={totalKgAllTime}
        activePartners={activePartners}
        today={today}
      />

      {/* ── Top bar: period toggle + actions ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {['day','week','month','year'].map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setPeriodOffset(0) }}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  period === p ? 'bg-white text-[#3D6034] shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {/* Prev / Next navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPeriodOffset(o => o + 1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 text-sm"
              title="Previous period"
            >‹</button>
            <button
              onClick={() => setPeriodOffset(o => Math.max(0, o - 1))}
              disabled={periodOffset === 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
              title="Next period"
            >›</button>
            {periodOffset > 0 && (
              <button
                onClick={() => setPeriodOffset(0)}
                className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-[#EEF3EC] text-[#3D6034] hover:bg-[#d8e8d4]"
              >Today</button>
            )}
          </div>
          {/* Quick jump dropdown — shows available options for the selected period */}
          <select
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#3D6034]"
            value={periodOffset}
            onChange={e => setPeriodOffset(Number(e.target.value))}
          >
            {period === 'month' && Array.from({ length: 24 }, (_, i) => {
              const d = subMonths(new Date(now.getFullYear(), now.getMonth(), 1), i)
              return <option key={i} value={i}>{format(d, 'MMMM yyyy')}</option>
            })}
            {period === 'week' && Array.from({ length: 26 }, (_, i) => {
              const wS = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - i * 7)
              const wE = new Date(wS.getFullYear(), wS.getMonth(), wS.getDate() + 6)
              return <option key={i} value={i}>{i === 0 ? 'This week' : i === 1 ? 'Last week' : `${format(wS, 'd MMM')}–${format(wE, 'd MMM yyyy')}`}</option>
            })}
            {period === 'year' && Array.from({ length: 5 }, (_, i) => (
              <option key={i} value={i}>{now.getFullYear() - i}</option>
            ))}
            {period === 'day' && Array.from({ length: 30 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
              return <option key={i} value={i}>{i === 0 ? 'Today' : i === 1 ? 'Yesterday' : format(d, 'EEE d MMM')}</option>
            })}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAllTime(v => !v)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showAllTime ? 'bg-[#EEF3EC] text-[#3D6034] border-[#3D6034]/30' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <TrendingUp size={13} /> All Time {showAllTime ? 'On' : 'Off'}
          </button>
          <button onClick={handleSyncNow} disabled={syncing} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync to Sheets'}
          </button>
          <button onClick={() => setCustomising(true)} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Settings2 size={13} /> Customise
          </button>
          <button onClick={downloadReport} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#3D6034] rounded-lg hover:bg-[#2E4A27] transition-colors">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* ── All Time strip ── */}
      {showAllTime && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-gray-100 rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          {[
            { label: 'All Time Revenue', value: formatCurrency(totalRevenueAllTime), sub: 'Historical + CRM' },
            { label: 'Total KG Sold', value: `${totalKgAllTime.toFixed(1)} kg`, sub: 'Historical + CRM' },
            { label: 'Partners Ordering', value: orderingPartners, sub: `of ${partners.length} total` },
            { label: 'Sample Conversion', value: `${conversionRate}%`, sub: `${convertedFromSample} of ${samplesSentAllTime} sampled` },
            { label: 'Total Invoices', value: orders.length, sub: 'Created in CRM' },
          ].map(item => (
            <div key={item.label} className="bg-white px-5 py-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{item.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1 tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Period KPI Cards ── */}
      {prefs.kpis && (
        <>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{periodLabel}</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Featured revenue card */}
            <div className="card p-5 bg-[#3D6034] border-[#3D6034] text-white">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">Revenue Invoiced</p>
                <div className="p-2 rounded-xl bg-white/10"><DollarSign size={16} className="text-white" /></div>
              </div>
              <p className="text-3xl font-bold tracking-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(periodRevenue)}</p>
              <p className="text-xs text-white/60 mt-1">{formatCurrency(periodPaid)} paid · {formatCurrency(periodOutstanding)} outstanding</p>
              {periodRevTrend != null && (
                <span className={`inline-flex items-center text-xs font-semibold mt-2 px-2 py-0.5 rounded-full ${periodRevTrend >= 0 ? 'bg-white/20 text-white' : 'bg-red-400/30 text-white'}`}>
                  {periodRevTrend >= 0 ? '↑' : '↓'} {Math.abs(periodRevTrend).toFixed(1)}% vs previous
                </span>
              )}
            </div>
            <KpiCard label="Orders" value={periodOrderCount} sub={`AOV ${formatCurrency(periodAOV)}`} icon={ShoppingBag} trend={periodOrderTrend} />
            <KpiCard label="Matcha Shipped" value={`${periodKg.toFixed(1)} kg`} sub="Invoiced this period" icon={Package} trend={periodKgTrend} />
            <KpiCard label="Active Cafés" value={periodActiveCafes} sub={`${activePartners} active partners overall`} icon={Users} color="#534AB7" />
            <KpiCard label="New Cafés" value={periodNewCafes} sub="Added to CRM this period" icon={Users} color="#0F6E56" />
            <KpiCard label="Samples Sent" value={periodSamples} sub={`${samplesSentAllTime} all time`} icon={Send} trend={periodSampleTrend} color="#7C3AED" />
          </div>
          {/* Extra KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {prefs.kpi_outstanding && <KpiCard label="Outstanding" value={formatCurrency(outstanding)} sub="all unpaid + overdue" icon={AlertCircle} color="#dc2626" />}
            {prefs.kpi_no_order && <KpiCard label={`No Order — ${format(new Date(), 'MMM yyyy')}`} value={noOrderThisMonth.length} sub={`of ${activePartners} active partners`} icon={AlertCircle} color="#f59e0b" />}
            {prefs.kpi_pouches && <KpiCard label="Retail Pouches Sold" value={totalPouchesSold} sub="50g pouches · CRM orders" icon={ShoppingBag} color="#7C5C2E" />}
            {prefs.kpi_kits && <KpiCard label="Starter Kits Sold" value={totalStarterKitsSold} sub="kits · CRM orders" icon={Package} color="#B45309" />}
          </div>
        </>
      )}

      {/* ── Daily Revenue + Conversion ── */}
      {(prefs.daily || prefs.conversion) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {prefs.daily && (
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Daily Revenue</h2>
                  <p className="text-xs text-gray-400 mt-0.5">CRM invoices · all revenue</p>
                </div>
                <select
                  className="input text-xs py-1.5 w-36"
                  value={dailyMonthOffset}
                  onChange={e => setDailyMonthOffset(Number(e.target.value))}
                >
                  {Array.from({ length: 6 }, (_, i) => (
                    <option key={i} value={i}>{format(subMonths(new Date(), i), 'MMMM yyyy')}</option>
                  ))}
                </select>
              </div>
              <div className="h-52">
                <Line data={dailyChartData} options={dailyChartOptions} />
              </div>
            </div>
          )}

          {prefs.conversion && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900">Conversion</h2>
              <p className="text-xs text-gray-400 mt-0.5 mb-3">Partners who placed an order</p>
              <ConversionGauge
                ordering={orderingPartners}
                total={partners.length}
                sampleSent={sampleSentCount}
                prospects={prospectCount}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Chart + Goals + Tasks ── */}
      {(prefs.chart || prefs.goals || prefs.tasks) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {prefs.chart && (
            <div className="card p-5 lg:col-span-2">
              <SectionHeader title="Revenue Chart" sub={{ day: 'Last 7 days', week: 'Last 8 weeks', month: 'Since Jun 2026', year: `${now.getFullYear()} by month` }[period]} navigate={navigate} />
              <div className="h-52">
                <Bar data={chartData} options={chartOptions} plugins={[kgLabelPlugin]} />
              </div>
            </div>
          )}

          <div className="space-y-5">
            {/* Goals */}
            {prefs.goals && (
              <div className="card p-5">
                <SectionHeader title={`🎯 ${format(new Date(), 'MMMM')} Goals`} linkTo="/goals" navigate={navigate} />
                {currentGoal ? (
                  <div className="space-y-3">
                    {currentGoal.target_revenue > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>Revenue</span>
                          <span className="font-medium">{formatCurrency(goalRevenue)} <span className="text-gray-400">/ {formatCurrency(currentGoal.target_revenue)}</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#3D6034] rounded-full transition-all" style={{ width: `${Math.min((goalRevenue / currentGoal.target_revenue) * 100, 100)}%` }} />
                        </div>
                      </div>
                    )}
                    {currentGoal.target_kg > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>KG Target</span>
                          <span className="font-medium text-gray-400">— / {currentGoal.target_kg}kg</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full" />
                      </div>
                    )}
                    {currentGoal.target_new_cafes > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>New Partners</span>
                          <span className="font-medium text-gray-400">— / {currentGoal.target_new_cafes}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs text-gray-400 mb-2">No goal set for this month</p>
                    <button onClick={() => navigate('/goals')} className="text-xs text-[#3D6034] hover:underline font-medium">Set a goal →</button>
                  </div>
                )}
              </div>
            )}

            {/* Tasks */}
            {prefs.tasks && (
              <div className="card p-5">
                <SectionHeader title="✅ Open Tasks" linkTo="/tasks" navigate={navigate} />
                {tasks.length === 0 ? (
                  <div className="text-center py-3">
                    <p className="text-xs text-gray-400 mb-1">No open tasks</p>
                    <button onClick={() => navigate('/tasks')} className="text-xs text-[#3D6034] hover:underline">Add a task →</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map(t => {
                      const overdue = t.due_date && isPast(parseISO(t.due_date))
                      return (
                        <div key={t.id} className="flex items-start gap-2.5 py-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{t.title}</p>
                            <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                              {overdue ? '⚠ ' : ''}{t.due_date ? formatDate(t.due_date) : 'No due date'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Top Partners + Reorders ── */}
      {(prefs.partners || prefs.reorders) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {prefs.partners && (
            <div className="card overflow-hidden lg:col-span-2">
              <div className="p-5 border-b border-gray-100">
                <SectionHeader title="Top 5 Partners by Revenue" sub="Calculated live from all invoices" linkTo="/partners" navigate={navigate} />
              </div>
              <div className="divide-y divide-gray-50">
                {topPartners.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">No invoices yet — create one to see rankings</p>
                ) : topPartners.map((p, idx) => {
                  const pct = (p.revenue / maxRevenue) * 100
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-[#EEF3EC]/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/partners/${p.id}`)}
                    >
                      <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${idx === 0 ? 'text-amber-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-400' : 'text-gray-300'}`}>
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                          <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                            <span className="text-xs text-gray-400">{p.kg.toFixed(1)}kg · {p.orders} {p.orders === 1 ? 'order' : 'orders'}</span>
                            <span className="text-sm font-bold text-[#3D6034]">{formatCurrency(p.revenue)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#3D6034] rounded-full" style={{ width: `${pct}%`, opacity: 0.5 + pct * 0.005 }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {prefs.reorders && (
            <div className="card p-5">
              <SectionHeader title="Upcoming Reorders" sub="Next 14 days" linkTo="/partners" navigate={navigate} />
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No reorders due soon</p>
              ) : (
                <div className="space-y-1">
                  {upcoming.map(p => {
                    const urgency = reorderUrgency(p.next_expected_order)
                    return (
                      <div key={p.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className={`text-xs mt-0.5 ${urgency === 'overdue' ? 'text-red-500 font-medium' : urgency === 'soon' ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
                            {urgency === 'overdue' ? '⚠ Overdue · ' : ''}{formatDate(p.next_expected_order)}
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/invoice', { state: { partnerId: p.id } })}
                          className="ml-2 p-1.5 rounded-lg bg-[#EEF3EC] text-[#3D6034] hover:bg-[#d8e8d4] transition-colors flex-shrink-0"
                          title="Create Invoice"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Active Partners — No Order This Month ── */}
      {prefs.no_order && noOrderThisMonth.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-0">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">{`⚠ Active Partners — No Order in ${format(new Date(), 'MMMM yyyy')}`}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{`${noOrderThisMonth.length} partner${noOrderThisMonth.length !== 1 ? 's' : ''} haven't ordered this month`}</p>
              </div>
              <button onClick={() => setShowNoOrderModal(true)} className="flex items-center gap-1 text-xs text-[#3D6034] hover:underline">
                View all <ChevronRight size={12} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-50">
            {noOrderThisMonth.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/partners/${p.id}`)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.combined_last_order ? `Last order ${formatDate(p.combined_last_order)}` : 'No orders yet'}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0 ml-2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sample Pipeline ── */}
      {prefs.samples && recentSamples.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Sample Pipeline</h2>
                <p className="text-xs text-gray-400 mt-0.5">{samplesSentThisMonth} sent this month · {convertedFromSample} of {samplesSentAllTime} converted ({conversionRate}%)</p>
              </div>
              <button onClick={() => navigate('/partners?filter=sample_sent')} className="flex items-center gap-1 text-xs text-[#3D6034] hover:underline">
                View all <ChevronRight size={12} />
              </button>
            </div>
            {/* Summary pills */}
            <div className="flex gap-2 mt-3">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">{samplesSentAllTime - convertedFromSample} awaiting</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">{convertedFromSample} converted</span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">{conversionRate}% rate</span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Partner', 'Sampled', 'Days Since', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSamples.map(p => {
                const hasOrdered = (Number(p.total_orders) || 0) > 0 || crmPartnerIdsSet.has(p.id)
                const daysSince = p.sample_sent_at ? Math.floor((new Date() - new Date(p.sample_sent_at)) / 86400000) : null
                return (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer" onClick={() => navigate(`/partners/${p.id}`)}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      {p.contact_name && <p className="text-xs text-gray-400 mt-0.5">{p.contact_name}</p>}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">{formatDate(p.sample_sent_at)}</td>
                    <td className="px-5 py-3">
                      {daysSince != null && (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          hasOrdered ? 'bg-gray-100 text-gray-500' :
                          daysSince > 30 ? 'bg-red-50 text-red-600' :
                          daysSince > 14 ? 'bg-amber-50 text-amber-600' :
                          'bg-purple-50 text-purple-600'
                        }`}>{daysSince}d ago</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {hasOrdered
                        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">✓ Converted</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">Awaiting</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      {!hasOrdered && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate('/invoice', { state: { partnerId: p.id } }) }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#EEF3EC] text-[#3D6034] hover:bg-[#d8e8d4] font-medium whitespace-nowrap"
                        >
                          + Invoice
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Matcha Inventory ── */}
      {prefs.inventory && (
        <InventoryWidget
          inventory={inventory}
          onUpdate={async () => {
            const { data } = await supabase.from('inventory').select('*').order('name')
            setInventory(data || [])
          }}
        />
      )}

      {/* ── Mission Progress ── */}
      {prefs.mission && (
        <div className="card p-5">
          <SectionHeader title="🌱 Mission Progress" sub="Long-term business milestones" linkTo="/goals" navigate={navigate} />
          <div className="grid grid-cols-3 gap-8">
            {milestones.map(m => {
              const pct = Math.min((m.current / m.target) * 100, 100)
              return (
                <div key={m.label}>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium text-gray-600">{m.label}</span>
                    <span className="text-xs text-gray-400">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3D6034] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {m.unit === '£' ? formatCurrency(m.current) : `${m.current.toFixed(m.unit === 'kg' ? 1 : 0)}${m.unit || ''}`} of {m.unit === '£' ? formatCurrency(m.target) : `${m.target}${m.unit || ''}`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Recent Invoices ── */}
      {prefs.invoices && (
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <SectionHeader title="Recent Invoices" sub="Created in this CRM" linkTo="/orders" navigate={navigate} />
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Invoice', 'Partner', 'Date', 'Total', 'Status'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 6).length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No invoices yet</td></tr>
              ) : orders.slice(0, 6).map(order => (
                <tr
                  key={order.id}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer"
                  onMouseEnter={() => setHoverOrder(order)}
                  onMouseLeave={() => setHoverOrder(null)}
                  onClick={() => navigate('/orders')}
                >
                  <td className="px-5 py-3 text-sm font-medium text-[#3D6034] relative">
                    {order.invoice_number}
                    {/* Hover preview card */}
                    {hoverOrder?.id === order.id && (
                      <div
                        className="absolute left-24 top-0 z-40 w-72 bg-white rounded-xl border border-gray-200 shadow-xl p-4"
                        style={{ pointerEvents: 'none' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-[#3D6034]">{order.invoice_number}</span>
                          <StatusBadge status={getOrderStatus(order)} />
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{order.partner_name} · {formatDate(order.date)}</p>
                        <div className="space-y-1.5 mb-3">
                          {(order.line_items || []).map((li, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-gray-600 truncate mr-2">{li.desc} × {li.qty}</span>
                              <span className="text-gray-900 font-medium flex-shrink-0">
                                {formatCurrency((Number(li.qty) || 0) * (Number(li.price) || 0))}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-sm font-bold border-t border-gray-100 pt-2">
                          <span>Total</span>
                          <span className="text-[#3D6034]">{formatCurrency(order.total)}</span>
                        </div>
                        {order.bill_email && (
                          <p className="text-xs text-gray-400 mt-2">✉ {order.bill_email}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">{order.partner_name}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{formatDate(order.date)}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{formatCurrency(order.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={getOrderStatus(order)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Customise panel ── */}
      {customising && (
        <CustomisePanel
          prefs={prefs}
          onChange={toggleWidget}
          onClose={() => setCustomising(false)}
        />
      )}

      {/* ── No Order Modal ── */}
      {showNoOrderModal && (
        <NoOrderModal
          partners={noOrderThisMonth}
          onClose={() => setShowNoOrderModal(false)}
          navigate={navigate}
        />
      )}
    </div>
  )
}
