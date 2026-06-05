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
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: o }] = await Promise.all([
        supabase.from('partners').select('*'),
        supabase.from('orders').select('*').order('date', { ascending: false }),
      ])
      setPartners(p || [])
      setOrders(o || [])
      setLoading(false)
    }
    load()
  }, [])

  const activePartners = partners.filter(p => p.status === 'active').length

  // All-time totals — pulled from partners table (includes historical imported data)
  const totalKgAllTime = partners.reduce((s, p) => s + (Number(p.total_kg) || 0), 0)
  const totalRevenueAllTime = partners.reduce((s, p) => s + (Number(p.total_spent) || 0), 0)
  const totalOrdersAllTime = partners.reduce((s, p) => s + (Number(p.total_orders) || 0), 0)

  // Outstanding = unpaid/overdue invoices in CRM orders only
  const outstanding = orders
    .filter(o => getOrderStatus(o) !== 'paid')
    .reduce((s, o) => s + (o.total || 0), 0)

  // Monthly revenue chart — from CRM orders (invoiced through this system)
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(new Date(), 5 - i)
    return {
      label: format(d, 'MMM'),
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
        {/* Chart */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Monthly Revenue — Last 6 Months</h2>
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

      {/* Revenue breakdown — all cafes */}
      <div className="card">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Revenue by Cafe — All Time</h2>
            <p className="text-xs text-gray-400 mt-0.5">Total amount spent by each cafe partner · {formatCurrency(totalRevenueAllTime)} combined</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#3D6034] inline-block" /> Spent</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#EEF3EC] border border-[#b3d0ab] inline-block" /> KG</span>
          </div>
        </div>
        <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
          {[...partners]
            .filter(p => (p.total_spent || 0) > 0 || (p.total_kg || 0) > 0)
            .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
            .map((p, idx) => {
              const pct = totalRevenueAllTime > 0 ? ((p.total_spent || 0) / totalRevenueAllTime) * 100 : 0
              return (
                <div
                  key={p.id}
                  className="px-5 py-3.5 hover:bg-gray-50/60 cursor-pointer transition-colors"
                  onClick={() => navigate(`/partners/${p.id}`)}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <span className="text-xs font-medium text-gray-300 w-5 text-right flex-shrink-0">#{idx + 1}</span>
                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                        <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                          <span className="text-xs text-gray-400">{Number(p.total_kg || 0).toFixed(1)}kg</span>
                          <span className="text-xs text-gray-400">{p.total_orders || 0} orders</span>
                          <span className="text-sm font-semibold text-[#3D6034] w-24 text-right">{formatCurrency(p.total_spent || 0)}</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3D6034] rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 0.5)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
        {/* Summary footer */}
        <div className="px-5 py-4 border-t border-gray-100 bg-[#EEF3EC]/40 flex items-center justify-between">
          <span className="text-xs text-gray-500">{partners.filter(p => (p.total_spent || 0) > 0).length} cafes with revenue</span>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-gray-400">Total KG</p>
              <p className="text-sm font-bold text-gray-900">{totalKgAllTime.toFixed(1)}kg</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Revenue</p>
              <p className="text-sm font-bold text-[#3D6034]">{formatCurrency(totalRevenueAllTime)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Total Orders</p>
              <p className="text-sm font-bold text-gray-900">{totalOrdersAllTime}</p>
            </div>
          </div>
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
