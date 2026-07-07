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
import { Download, Calendar, DollarSign, Edit2, Check, History } from 'lucide-react'
import { restockInventory, adjustInventory } from '../lib/inventory'

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
  { id: 'kpi_no_order',     label: 'Active — No Order This Month', defaultOn: true },
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
    const days = p.last_order_date
      ? Math.floor((now - new Date(p.last_order_date)) / 86400000)
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
                  <td className="px-5 py-3 text-sm text-gray-600">{p.last_order_date ? formatDate(p.last_order_date) : 'Never'}</td>
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
      setPartners(p || [])
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

  // KG trend — CRM kg this month vs last month
  const kgThisMonth = orders
    .filter(o => o.date >= format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    .reduce((s, o) => s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0), 0)
  const kgLastMonth = orders
    .filter(o => {
      const lmStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
      const lmEnd = format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
      return o.date >= lmStart && o.date <= lmEnd
    })
    .reduce((s, o) => s + (o.line_items || []).reduce((a, li) => a + lineItemKg(li), 0), 0)
  const kgTrend = kgLastMonth > 0 ? ((kgThisMonth - kgLastMonth) / kgLastMonth) * 100 : null

  // Conversion: partners who have placed at least one order (historical or CRM)
  const crmPartnerIdsSet = new Set(orders.map(o => o.partner_id).filter(Boolean))
  const orderingPartners = partners.filter(p =>
    (Number(p.total_orders) || 0) > 0 || crmPartnerIdsSet.has(p.id)
  ).length
  const sampleSentCount = partners.filter(p => p.status === 'sample_sent').length
  const prospectCount = partners.filter(p => p.status === 'prospect').length

  // Outstanding — CRM invoices unpaid + overdue
  const outstanding = orders
    .filter(o => getOrderStatus(o) !== 'paid')
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Paid — CRM invoices marked as paid
  const totalPaid = orders
    .filter(o => getOrderStatus(o) === 'paid')
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Month-on-month revenue trend
  const thisMonthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const thisMonthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const lastMonthStart = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  const lastMonthEnd = format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
  const thisMonthRev = orders.filter(o => o.date >= thisMonthStart && o.date <= thisMonthEnd).reduce((s, o) => s + (o.total || 0), 0)
  const lastMonthRev = orders.filter(o => o.date >= lastMonthStart && o.date <= lastMonthEnd).reduce((s, o) => s + (o.total || 0), 0)
  const revTrend = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : null

  // Revenue MTD (paid only, incl. shipping)
  const revMTD = orders
    .filter(o => o.status === 'paid' && o.date >= thisMonthStart && o.date <= thisMonthEnd)
    .reduce((s, o) => s + (Number(o.total) || 0), 0)
  const revMTDLastMonth = orders
    .filter(o => o.status === 'paid' && o.date >= lastMonthStart && o.date <= lastMonthEnd)
    .reduce((s, o) => s + (Number(o.total) || 0), 0)
  const revMTDTrend = revMTDLastMonth > 0 ? ((revMTD - revMTDLastMonth) / revMTDLastMonth) * 100 : null

  // KG this month
  const sumKg = (list) => list.reduce((s, o) => s + (o.line_items || []).reduce((t, li) => t + lineItemKg(li), 0), 0)
  const kgMTD = sumKg(orders.filter(o => o.date >= thisMonthStart && o.date <= thisMonthEnd))
  const kgPrevMonth = sumKg(orders.filter(o => o.date >= lastMonthStart && o.date <= lastMonthEnd))
  const kgMTDTrend = kgPrevMonth > 0 ? ((kgMTD - kgPrevMonth) / kgPrevMonth) * 100 : null

  // Revenue YTD (paid only, incl. shipping)
  const yearStart = `${new Date().getFullYear()}-01-01`
  const revYTD = orders
    .filter(o => o.status === 'paid' && o.date >= yearStart)
    .reduce((s, o) => s + (Number(o.total) || 0), 0)

  // Chart — months from June 2026 to now
  const CRM_START = new Date(2026, 5, 1) // June 2026
  const now = new Date()
  const totalMonths = (now.getFullYear() - CRM_START.getFullYear()) * 12 + (now.getMonth() - CRM_START.getMonth()) + 1
  const months = Array.from({ length: totalMonths }, (_, i) => {
    const d = new Date(CRM_START.getFullYear(), CRM_START.getMonth() + i, 1)
    return {
      label: format(d, 'MMM yy'),
      start: format(startOfMonth(d), 'yyyy-MM-dd'),
      end: format(endOfMonth(d), 'yyyy-MM-dd'),
    }
  })
  const monthlyRevenue = months.map(m =>
    orders.filter(o => o.date >= m.start && o.date <= m.end).reduce((s, o) => s + (o.total || 0), 0)
  )
  const chartData = {
    labels: months.map(m => m.label),
    datasets: [{
      label: 'Revenue (£)',
      data: monthlyRevenue,
      backgroundColor: '#3D6034',
      borderRadius: 8,
      borderSkipped: false,
      hoverBackgroundColor: '#2E4A27',
    }],
  }
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `£${ctx.raw.toFixed(2)}` } }
    },
    scales: {
      y: { ticks: { callback: v => `£${v}` }, grid: { color: '#f3f4f6' }, border: { display: false } },
      x: { grid: { display: false }, border: { display: false } },
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

      {/* ── Top bar: customise + download report ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{Object.values(prefs).filter(Boolean).length} of {WIDGETS.length} widgets showing</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCustomising(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings2 size={13} /> Customise
          </button>
          <button
            onClick={downloadReport}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-[#3D6034] rounded-lg hover:bg-[#2E4A27] transition-colors"
          >
            <Download size={13} /> Download Report
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {prefs.kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {prefs.kpi_kg && <KpiCard label="Total KG Sold" value={`${totalKgAllTime.toFixed(1)}kg`} sub="historical + CRM" icon={Package} trend={kgTrend} />}
          {prefs.kpi_revenue && <KpiCard label="Total Revenue" value={formatCurrency(totalRevenueAllTime)} sub="historical + all paid CRM invoices" icon={TrendingUp} color="#0F6E56" />}
          {prefs.kpi_partners && <KpiCard label="Partners Ordering" value={orderingPartners} sub={`of ${partners.length} on the list`} icon={Users} color="#534AB7" />}
          {prefs.kpi_outstanding && <KpiCard label="Outstanding" value={formatCurrency(outstanding)} sub="unpaid + overdue invoices" icon={AlertCircle} color="#dc2626" />}
          {prefs.kpi_mtd && <KpiCard label={`Revenue MTD — ${format(new Date(), 'MMM yyyy')}`} value={formatCurrency(revMTD)} sub="paid invoices · this month" icon={DollarSign} trend={revMTDTrend} color="#0F6E56" />}
          {prefs.kpi_kg_mtd && <KpiCard label={`KG MTD — ${format(new Date(), 'MMM yyyy')}`} value={`${kgMTD.toFixed(1)}kg`} sub="matcha kg · this month" icon={Package} trend={kgMTDTrend} />}
          {prefs.kpi_ytd && <KpiCard label={`Revenue YTD — ${new Date().getFullYear()}`} value={formatCurrency(revYTD)} sub="paid invoices · this year" icon={DollarSign} color="#0F6E56" />}
          {prefs.kpi_alltime && <KpiCard label="All Time Revenue" value={formatCurrency(totalRevenueAllTime)} sub="historical + all paid CRM invoices" icon={DollarSign} color="#0F6E56" />}
          {prefs.kpi_pouches && <KpiCard label="Retail Pouches Sold" value={totalPouchesSold} sub="50g pouches · CRM orders" icon={ShoppingBag} color="#7C5C2E" />}
          {prefs.kpi_kits && <KpiCard label="Starter Kits Sold" value={totalStarterKitsSold} sub="kits · CRM orders" icon={Package} color="#B45309" />}
          {prefs.kpi_no_order && <KpiCard label={`No Order — ${format(new Date(), 'MMM yyyy')}`} value={noOrderThisMonth.length} sub={`of ${activePartners} active partners`} icon={AlertCircle} color="#f59e0b" />}
        </div>
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
              <SectionHeader title="Monthly Revenue" sub="Last 12 months — invoices created in CRM" navigate={navigate} />
              <div className="h-52">
                <Bar data={chartData} options={chartOptions} />
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
                    {p.last_order_date ? `Last order ${formatDate(p.last_order_date)}` : 'No orders yet'}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0 ml-2" />
              </div>
            ))}
          </div>
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
