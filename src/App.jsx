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
import Tasks from './pages/Tasks'
import Goals from './pages/Goals'
import Campaigns from './pages/marketing/Campaigns'
import Outreach from './pages/marketing/Outreach'
import MapPage from './pages/marketing/Map'
import Team from './pages/workspace/Team'
import BrandAssets from './pages/workspace/BrandAssets'
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
        <Route path="tasks" element={<Tasks />} />
        <Route path="goals" element={<Goals />} />
        <Route path="marketing/campaigns" element={<Campaigns />} />
        <Route path="marketing/outreach" element={<Outreach />} />
        <Route path="marketing/map" element={<MapPage />} />
        <Route path="workspace/team" element={<Team />} />
        <Route path="workspace/brand" element={<BrandAssets />} />
        <Route path="workspace/settings" element={<Settings />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
