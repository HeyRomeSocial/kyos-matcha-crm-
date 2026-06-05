import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, getOrderStatus, reorderUrgency } from '../lib/utils'
import { Users, Package, TrendingUp, AlertCircle, ShoppingBag, Plus } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isPast } from 'date-fns'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

function KpiCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className="p-2 bg-[#EEF3EC] rounded-lg">
          <Icon size={18} className="text-[#3D6034]" />
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge-paid">Paid</span>
  if (status === 'overdue') return <span className="badge-overdue">Overdue</span>
  return <span className="badge-unpaid">Unpaid</span>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [orders, setOrders] = useState([])
  const [tasks, setTasks] = useState([])
  const [currentGoal, setCurrentGoal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const currentMonthStr = format(startOfMonth(new Date()), 'yyyy-MM-dd')
      const [{ data: p }, { data: o }, { data: t }, { data: g }] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
        supabase.from('tasks').select('*').neq('status', 'done').order('due_date', { ascending: true }).limit(5),
        supabase.from('goals').select('*').eq('month', currentMonthStr).single(),
      ])
      setPartners(p || [])
      setOrders(o || [])
      setTasks(t || [])
      setCurrentGoal(g || null)
      setLoading(false)
    }
    load()
  }, [])

  const activePartners = partners.filter(p => p.status === 'active').length

  // All-time totals — KG × price_per_kg for accurate revenue
  const totalKgAllTime = partners.reduce((s, p) => s + (Number(p.total_kg) || 0), 0)
  const totalRevenueAllTime = partners.reduce((s, p) => s + (Number(p.total_kg) || 0) * (Number(p.price_per_kg) || 0), 0)
  const totalOrdersAllTime = partners.reduce((s, p) => s + (Number(p.total_orders) || 0), 0)

  // Outstanding = unpaid/overdue invoices in CRM orders only
  const outstanding = orders
    .filter(o => getOrderStatus(o) !== 'paid')
    .reduce((s, o) => s + (o.total || 0), 0)

  // Monthly revenue chart — 12 months
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), 11 - i)
    return {
      label: format(d, 'MMM yy'),
      start: format(startOfMonth(d), 'yyyy-MM-dd'),
      end: format(endOfMonth(d), 'yyyy-MM-dd'),
    }
  })
  const monthlyRevenue = months.map(m =>
    orders
      .filter(o => o.date >= m.start && o.date <= m.end)
      .reduce((s, o) => s + (o.total || 0), 0)
  )

  const chartData = {
    labels: months.map(m => m.label),
    datasets: [{
      label: 'Revenue (£)',
      data: monthlyRevenue,
      backgroundColor: '#3D6034',
      borderRadius: 6,
      borderSkipped: false,
    }],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `£${ctx.raw.toFixed(2)}` } } },
    scales: {
      y: { ticks: { callback: v => `£${v}` }, grid: { color: '#f3f4f6' } },
      x: { grid: { display: false } },
    },
  }

  // Upcoming reorders (next 14 days)
  const in14 = format(new Date(Date.now() + 14 * 86400000), 'yyyy-MM-dd')
  const upcoming = partners
    .filter(p => p.next_expected_order && p.next_expected_order <= in14 && p.status === 'active')
    .sort((a, b) => a.next_expected_order.localeCompare(b.next_expected_order))

  const recentOrders = orders.slice(0, 5)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Hero Banner */}
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: '220px' }}>
        {/* Background photo */}
        <img
          src="/matcha-hero.jpg"
          alt="Matcha fields"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 60%' }}
        />
        {/* Dark green overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(30,50,22,0.82) 0%, rgba(30,50,22,0.55) 60%, rgba(30,50,22,0.25) 100%)' }} />

        {/* Content */}
        <div className="absolute inset-0 flex items-center px-10">
          <div className="flex-1">
            <img src="/logo.png" alt="Kyos Matcha" className="h-9 w-auto mb-4 brightness-0 invert" />
            <p className="text-white/70 text-sm">{today}</p>
            <p className="text-white/90 text-sm mt-1">{activePartners} active cafes across the UK</p>
          </div>

          {/* Stat pills */}
          <div className="flex items-center gap-4">
            <div className="text-center bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-4">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Total KG</p>
              <p className="text-white text-2xl font-bold mt-1">{totalKgAllTime.toFixed(0)}kg</p>
              <p className="text-white/50 text-xs mt-0.5">supplied all time</p>
            </div>
            <div className="text-center bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-4">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Revenue</p>
              <p className="text-white text-2xl font-bold mt-1">{formatCurrency(totalRevenueAllTime)}</p>
              <p className="text-white/50 text-xs mt-0.5">all time</p>
            </div>
            <div className="text-center bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-4">
              <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Orders</p>
              <p className="text-white text-2xl font-bold mt-1">{totalOrdersAllTime}</p>
              <p className="text-white/50 text-xs mt-0.5">all time</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active Cafes"
          value={activePartners}
          icon={Users}
          sub={`${partners.length} total`}
        />
        <KpiCard
          label="Total KG Supplied"
          value={`${totalKgAllTime.toFixed(1)}kg`}
          icon={Package}
          sub="all time"
        />
        <KpiCard
          label="Total Revenue"
          value={formatCurrency(totalRevenueAllTime)}
          icon={TrendingUp}
          sub="all time"
        />
        <KpiCard
          label="Outstanding"
          value={formatCurrency(outstanding)}
          icon={AlertCircle}
          sub="unpaid + overdue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart — 12 months */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Monthly Revenue — Last 12 Months</h2>
          <p className="text-xs text-gray-400 mb-4">Based on invoices created in this CRM</p>
          <div className="h-56">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Upcoming reorders */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Upcoming Reorders</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-400">No reorders in the next 14 days.</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(p => {
                const urgency = reorderUrgency(p.next_expected_order)
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className={`text-xs mt-0.5 ${urgency === 'overdue' ? 'text-red-500' : urgency === 'soon' ? 'text-amber-500' : 'text-gray-400'}`}>
                        {formatDate(p.next_expected_order)}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/invoice', { state: { partnerId: p.id } })}
                      className="p-1.5 rounded-lg bg-[#EEF3EC] text-[#3D6034] hover:bg-[#d8e8d4] transition-colors"
                      title="Create Invoice"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Goals + Tasks row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current month goal */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">🎯 {format(new Date(), 'MMMM')} Goals</h2>
              <p className="text-xs text-gray-400 mt-0.5">Current month targets</p>
            </div>
            <button onClick={() => navigate('/goals')} className="text-xs text-[#3D6034] hover:underline">View all →</button>
          </div>
          {currentGoal ? (
            <div className="space-y-4">
              {currentGoal.target_revenue > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Revenue</span>
                    <span>{formatCurrency(orders.filter(o => o.date >= format(startOfMonth(new Date()),'yyyy-MM-dd')).reduce((s,o)=>s+(o.total||0),0))} / {formatCurrency(currentGoal.target_revenue)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3D6034] rounded-full" style={{ width: `${Math.min((orders.filter(o => o.date >= format(startOfMonth(new Date()),'yyyy-MM-dd')).reduce((s,o)=>s+(o.total||0),0) / currentGoal.target_revenue)*100,100)}%` }} />
                  </div>
                </div>
              )}
              {currentGoal.target_kg > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>KG Supplied</span>
                    <span>— / {currentGoal.target_kg}kg</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3D6034] rounded-full" style={{ width: '0%' }} />
                  </div>
                </div>
              )}
              {currentGoal.target_new_cafes > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>New Cafes</span>
                    <span>— / {currentGoal.target_new_cafes}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3D6034] rounded-full" style={{ width: '0%' }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No goal set for this month</p>
              <button onClick={() => navigate('/goals')} className="btn-primary mx-auto text-xs">Set a Goal</button>
            </div>
          )}
        </div>

        {/* Open tasks */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">✅ Open Tasks</h2>
              <p className="text-xs text-gray-400 mt-0.5">Your team's pending items</p>
            </div>
            <button onClick={() => navigate('/tasks')} className="text-xs text-[#3D6034] hover:underline">View all →</button>
          </div>
          {tasks.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No open tasks</p>
              <button onClick={() => navigate('/tasks')} className="btn-primary mx-auto text-xs">Add a Task</button>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => {
                const overdue = t.due_date && isPast(parseISO(t.due_date))
                return (
                  <div key={t.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{t.title}</p>
                      <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                        {overdue ? '⚠ Overdue · ' : ''}{t.due_date ? formatDate(t.due_date) : 'No due date'}
                        {t.assigned_to ? ` · ${t.assigned_to}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revenue by cafe — all time */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">All-Time Revenue by Cafe</h2>
          <p className="text-xs text-gray-400 mt-0.5">Total KG ordered × price per KG agreed with each cafe</p>
        </div>
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">#</th>
                <th className="text-left text-xs font-medium text-gray-400 px-5 py-3">Cafe</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Total KG</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Price / KG</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Orders</th>
                <th className="text-right text-xs font-medium text-gray-400 px-5 py-3">Total Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...partners]
                .filter(p => (p.total_kg || 0) > 0 && (p.price_per_kg || 0) > 0)
                .sort((a, b) => {
                  const ra = (a.total_kg || 0) * (a.price_per_kg || 0)
                  const rb = (b.total_kg || 0) * (b.price_per_kg || 0)
                  return rb - ra
                })
                .map((p, idx) => {
                  const revenue = (p.total_kg || 0) * (p.price_per_kg || 0)
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-[#EEF3EC]/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/partners/${p.id}`)}
                    >
                      <td className="px-5 py-3 text-xs text-gray-300 font-medium">{idx + 1}</td>
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        {p.contact_name && <p className="text-xs text-gray-400">{p.contact_name}</p>}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-700 text-right font-medium">{Number(p.total_kg).toFixed(1)}kg</td>
                      <td className="px-5 py-3 text-sm text-gray-500 text-right">{formatCurrency(p.price_per_kg)}</td>
                      <td className="px-5 py-3 text-sm text-gray-500 text-right">{p.total_orders || 0}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="text-sm font-bold text-[#3D6034]">{formatCurrency(revenue)}</span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
            {/* Grand total row */}
            <tfoot>
              <tr className="bg-[#EEF3EC] border-t-2 border-[#b3d0ab]">
                <td className="px-5 py-4" colSpan={2}>
                  <span className="text-sm font-bold text-[#3D6034]">Total — All Cafes</span>
                  <span className="text-xs text-[#3D6034]/60 ml-2">{partners.filter(p => (p.total_kg || 0) > 0).length} cafes</span>
                </td>
                <td className="px-5 py-4 text-right text-sm font-bold text-gray-900">
                  {totalKgAllTime.toFixed(1)}kg
                </td>
                <td className="px-5 py-4 text-right text-xs text-gray-400">avg {formatCurrency(
                  partners.filter(p => p.price_per_kg).reduce((s, p) => s + p.price_per_kg, 0) /
                  (partners.filter(p => p.price_per_kg).length || 1)
                )}/kg</td>
                <td className="px-5 py-4 text-right text-sm font-bold text-gray-900">{totalOrdersAllTime}</td>
                <td className="px-5 py-4 text-right text-sm font-bold text-[#3D6034]">
                  {formatCurrency(partners.reduce((s, p) => s + (p.total_kg || 0) * (p.price_per_kg || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Recent invoices */}
      <div className="card">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Recent Invoices</h2>
          <p className="text-xs text-gray-400 mt-0.5">Created in this CRM</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Invoice', 'Cafe', 'Total', 'Status'].map(h => (
                <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-400">
                  No invoices yet — create one in New Invoice
                </td>
              </tr>
            ) : recentOrders.map(order => {
              const status = getOrderStatus(order)
              return (
                <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-sm font-medium text-[#3D6034]">{order.invoice_number}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{order.partner_name}</td>
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">{formatCurrency(order.total)}</td>
                  <td className="px-5 py-3"><StatusBadge status={status} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
