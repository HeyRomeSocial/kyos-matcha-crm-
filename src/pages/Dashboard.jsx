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

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">All-time overview across all cafe partners</p>
      </div>

      {/* KPIs — all sourced from partners table for historical accuracy */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
        <KpiCard
          label="Total Orders"
          value={totalOrdersAllTime}
          icon={ShoppingBag}
          sub="all time"
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

      {/* Top cafes by revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Top Cafes by Revenue</h2>
            <p className="text-xs text-gray-400 mt-0.5">All time</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Cafe', 'Total KG', 'Total Spent', 'Orders'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...partners]
                .filter(p => p.total_spent > 0)
                .sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
                .slice(0, 8)
                .map(p => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => navigate(`/partners/${p.id}`)}>
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{p.name}</td>
                    <td className="px-5 py-3 text-sm text-gray-600">{Number(p.total_kg || 0).toFixed(1)}kg</td>
                    <td className="px-5 py-3 text-sm font-medium text-[#3D6034]">{formatCurrency(p.total_spent)}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{p.total_orders || 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Recent CRM orders */}
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
    </div>
  )
}
