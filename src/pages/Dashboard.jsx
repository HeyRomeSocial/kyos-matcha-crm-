import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus, reorderUrgency } from '../lib/utils'
import {
  Users, Package, TrendingUp, AlertCircle, ShoppingBag, Plus,
  Settings2, X, ChevronRight, CheckCircle, Circle, Clock
} from 'lucide-react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, LineElement, PointElement, Filler
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { format, subMonths, startOfMonth, endOfMonth, isPast, parseISO } from 'date-fns'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement, Filler)

// ─── Widget registry ──────────────────────────────────────────────────────────
const WIDGETS = [
  { id: 'kpis',      label: 'KPI Cards',           defaultOn: true },
  { id: 'chart',     label: 'Revenue Chart',        defaultOn: true },
  { id: 'goals',     label: 'Monthly Goals',        defaultOn: true },
  { id: 'tasks',     label: 'Open Tasks',           defaultOn: true },
  { id: 'partners',  label: 'Top 10 Partners',      defaultOn: true },
  { id: 'reorders',  label: 'Upcoming Reorders',    defaultOn: true },
  { id: 'invoices',  label: 'Recent Invoices',      defaultOn: true },
  { id: 'mission',   label: 'Mission Progress',     defaultOn: false },
]

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

      {/* Centre — animated counter */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <p
          className="text-white font-bold tracking-tight tabular-nums"
          style={{ fontSize: 'clamp(56px, 7vw, 96px)', lineHeight: 1, textShadow: '0 2px 28px rgba(0,0,0,0.45)' }}
        >
          {Math.round(animated).toLocaleString('en-GB')}
        </p>
        <p className="text-white/85 font-semibold uppercase mt-4" style={{ letterSpacing: '0.4em', fontSize: 'clamp(11px, 1.1vw, 15px)' }}>
          Matchas Served Across The UK
        </p>
      </div>
    </div>
  )
}

function loadPrefs() {
  try {
    const saved = localStorage.getItem('km_dashboard_widgets')
    if (saved) return JSON.parse(saved)
  } catch {}
  return Object.fromEntries(WIDGETS.map(w => [w.id, w.defaultOn]))
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

// ─── Customise Panel ──────────────────────────────────────────────────────────
function CustomisePanel({ prefs, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-80 h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Customise Dashboard</h2>
            <p className="text-xs text-gray-400 mt-0.5">Toggle widgets on or off</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 p-5 space-y-2 overflow-y-auto">
          {WIDGETS.map(w => (
            <label
              key={w.id}
              className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">{w.label}</span>
              <div
                className={`w-10 h-6 rounded-full transition-colors relative ${prefs[w.id] ? 'bg-[#3D6034]' : 'bg-gray-200'}`}
                onClick={() => onChange(w.id, !prefs[w.id])}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${prefs[w.id] ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
            </label>
          ))}
        </div>
        <div className="p-5 border-t border-gray-100">
          <button
            onClick={() => {
              const defaults = Object.fromEntries(WIDGETS.map(w => [w.id, w.defaultOn]))
              Object.entries(defaults).forEach(([id, val]) => onChange(id, val))
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
  const [loading, setLoading] = useState(true)

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
      const [{ data: p }, { data: o }, { data: t }, { data: g }] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
        supabase.from('tasks').select('*').neq('status', 'done').order('due_date', { ascending: true }).limit(5),
        supabase.from('goals').select('*').eq('month', currentMonthStr).maybeSingle(),
      ])
      setPartners(p || [])
      setOrders(o || [])
      setTasks(t || [])
      setCurrentGoal(g || null)
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
    s + (o.line_items || []).reduce((a, li) =>
      li.desc?.toLowerCase().includes('matcha') ? a + (Number(li.qty) || 0) : a
    , 0)
  , 0)
  const crmRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const crmOrders = orders.length

  // Combined totals = historical + CRM
  const totalKgAllTime = historicalKg + crmKg
  const totalRevenueAllTime = historicalRevenue + crmRevenue
  const totalOrdersAllTime = historicalOrders + crmOrders

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

  // Chart — 12 months
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), 11 - i)
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

  // Top 10 partners — calculated live from orders
  const partnerRevMap = orders.reduce((acc, o) => {
    if (!o.partner_id) return acc
    acc[o.partner_id] = acc[o.partner_id] || { revenue: 0, kg: 0, orders: 0, name: o.partner_name }
    acc[o.partner_id].revenue += Number(o.total) || 0
    acc[o.partner_id].kg += (o.line_items || []).reduce((s, li) =>
      li.desc?.toLowerCase().includes('matcha') ? s + (Number(li.qty) || 0) : s, 0)
    acc[o.partner_id].orders += 1
    return acc
  }, {})
  const topPartners = Object.entries(partnerRevMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
  const maxRevenue = topPartners[0]?.revenue || 1

  // Mission milestones
  const milestones = [
    { label: '100 Active Partners', current: activePartners, target: 100 },
    { label: '1,000 KG Supplied', current: totalKgAllTime, target: 1000, unit: 'kg' },
    { label: '£100k Revenue', current: totalRevenueAllTime, target: 100000, unit: '£' },
  ]

  // Goals actuals
  const goalRevenue = orders.filter(o => o.date >= thisMonthStart && o.date <= thisMonthEnd).reduce((s, o) => s + (o.total || 0), 0)

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

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

      {/* ── Customise button ── */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{Object.values(prefs).filter(Boolean).length} of {WIDGETS.length} widgets showing</p>
        <button
          onClick={() => setCustomising(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Settings2 size={13} /> Customise Dashboard
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {prefs.kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard label="Active Partners" value={activePartners} sub={`${partners.length} total`} icon={Users} />
          <KpiCard label="Total KG Sold" value={`${totalKgAllTime.toFixed(1)}kg`} sub="from all invoices" icon={Package} color="#2563eb" />
          <KpiCard label="Total Invoiced" value={formatCurrency(totalRevenueAllTime)} sub={`${totalOrdersAllTime} orders`} icon={TrendingUp} trend={revTrend} />
          <KpiCard label="Paid Revenue" value={formatCurrency(totalPaid)} sub="settled invoices" icon={ShoppingBag} color="#3D6034" />
          <KpiCard label="Outstanding" value={formatCurrency(outstanding)} sub="unpaid + overdue" icon={AlertCircle} color="#dc2626" />
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
                <SectionHeader title="Top 10 Partners by Revenue" sub="Calculated live from all invoices" linkTo="/partners" navigate={navigate} />
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
                <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-sm font-medium text-[#3D6034]">{order.invoice_number}</td>
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
    </div>
  )
}
