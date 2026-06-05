import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Users, FileText, ClipboardList, Settings,
  LogOut, Menu, X, CheckSquare, Target, Megaphone, Send,
  Briefcase, Image, UserCircle
} from 'lucide-react'

const navGroups = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    ]
  },
  {
    label: 'CRM',
    items: [
      { to: '/partners', label: 'Cafes', icon: Users },
      { to: '/invoice', label: 'New Invoice', icon: FileText },
      { to: '/orders', label: 'Orders', icon: ClipboardList },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
      { to: '/goals', label: 'Goals', icon: Target },
    ]
  },
  {
    label: 'Marketing',
    items: [
      { to: '/marketing/campaigns', label: 'Campaigns', icon: Megaphone },
      { to: '/marketing/outreach', label: 'Outreach', icon: Send },
    ]
  },
  {
    label: 'Workspace',
    items: [
      { to: '/workspace/team', label: 'Team', icon: UserCircle },
      { to: '/workspace/brand', label: 'Brand Assets', icon: Image },
      { to: '/workspace/settings', label: 'Settings', icon: Settings },
    ]
  },
]

export default function Layout({ session }) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 bg-white border-r border-gray-100 flex flex-col
        transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-gray-100 flex-shrink-0">
          <img src="/logo.png" alt="Kyos Matcha" className="h-8 w-auto" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-3 mb-1">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-[#EEF3EC] text-[#3D6034]'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    <Icon size={15} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-gray-100 flex-shrink-0">
          <div className="px-3 py-1.5 mb-1">
            <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden h-16 flex items-center px-4 border-b border-gray-100 bg-white">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-50">
            <Menu size={20} />
          </button>
          <img src="/logo.png" alt="Kyos Matcha" className="ml-3 h-7 w-auto" />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
