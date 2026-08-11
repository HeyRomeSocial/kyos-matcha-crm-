import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { RefreshCw, Mail, CheckCircle, XCircle, Package, User, AlertCircle, Wifi, WifiOff } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function OrdersInbox() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setConnected(true)
      navigate('/orders-inbox', { replace: true })
    } else {
      checkConnection()
    }
    fetchOrders()
  }, [])

  async function checkConnection() {
    const { data } = await supabase.from('gmail_tokens').select('id').eq('id', 1).single()
    setConnected(!!data)
  }

  async function fetchOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('order_inbox')
      .select('*')
      .order('received_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      await fetchOrders()
    } catch (err) {
      alert('Error fetching emails: ' + err.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleConnect() {
    window.location.href = `${SUPABASE_URL}/functions/v1/gmail-auth`
  }

  async function updateStatus(id, status) {
    await supabase.from('order_inbox').update({ status }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }

  async function confirmOrder(order) {
    await updateStatus(order.id, 'confirmed')
    // Navigate to invoice generator with pre-filled data
    navigate(`/invoice?partner=${encodeURIComponent(order.parsed_partner || order.from_name)}&qty=${order.parsed_quantity_kg || ''}&product=${encodeURIComponent(order.parsed_product || '')}`)
  }

  const pending = orders.filter(o => o.status === 'pending')
  const done = orders.filter(o => o.status !== 'pending')

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Orders Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">partners@kyosmatcha.com</p>
        </div>
        <div className="flex items-center gap-3">
          {connected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <Wifi size={13} /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <WifiOff size={13} /> Not connected
            </span>
          )}
          {connected ? (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#3D6034] text-white text-sm font-medium rounded-lg hover:bg-[#2d4a26] disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Checking...' : 'Check for Orders'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 px-4 py-2 bg-[#3D6034] text-white text-sm font-medium rounded-lg hover:bg-[#2d4a26] transition-colors"
            >
              <Mail size={14} />
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      {/* Not connected banner */}
      {!connected && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Gmail not connected</p>
            <p className="text-amber-700 mt-0.5">Connect your partners@kyosmatcha.com inbox to start receiving orders here.</p>
          </div>
        </div>
      )}

      {/* Pending orders */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {pending.length === 0 && connected && (
            <div className="text-center py-16 text-gray-400">
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No pending orders</p>
              <p className="text-xs mt-1">Press "Check for Orders" to fetch new emails</p>
            </div>
          )}

          {pending.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Pending Review — {pending.length}
              </p>
              {pending.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onConfirm={() => confirmOrder(order)}
                  onDismiss={() => updateStatus(order.id, 'dismissed')}
                />
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mt-6">
                Completed
              </p>
              {done.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  done
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OrderCard({ order, onConfirm, onDismiss, done }) {
  const date = order.received_at
    ? new Date(order.received_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className={`bg-white border rounded-xl p-4 space-y-3 ${done ? 'opacity-60 border-gray-100' : 'border-gray-200 shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#EEF3EC] flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-[#3D6034]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {order.parsed_partner || order.from_name || order.from_email}
            </p>
            <p className="text-xs text-gray-400">{order.from_email} · {date}</p>
          </div>
        </div>
        {order.status === 'confirmed' && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium flex-shrink-0">
            <CheckCircle size={13} /> Confirmed
          </span>
        )}
        {order.status === 'dismissed' && (
          <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
            <XCircle size={13} /> Dismissed
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Product</p>
          <p className="text-sm text-gray-800">{order.parsed_product || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Quantity</p>
          <p className="text-sm text-gray-800">{order.parsed_quantity_kg ? `${order.parsed_quantity_kg} kg` : '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Subject</p>
          <p className="text-sm text-gray-800 truncate">{order.subject || '—'}</p>
        </div>
      </div>

      {order.parsed_notes && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{order.parsed_notes}</p>
      )}

      {!done && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-[#3D6034] text-white text-sm font-medium rounded-lg hover:bg-[#2d4a26] transition-colors"
          >
            Confirm — Create Invoice
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
