import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Partners from './pages/Partners'
import PartnerDetail from './pages/PartnerDetail'
import InvoiceGenerator from './pages/InvoiceGenerator'
import OrdersLog from './pages/OrdersLog'
import Settings from './pages/Settings'

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-[#3D6034] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute session={session}>
            <Layout session={session} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="partners" element={<Partners />} />
        <Route path="partners/:id" element={<PartnerDetail />} />
        <Route path="invoice" element={<InvoiceGenerator />} />
        <Route path="orders" element={<OrdersLog />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
