import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Save, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Settings() {
  const [users, setUsers] = useState([])
  const [fromAddress, setFromAddress] = useState({
    name: 'Kyos Matcha',
    line1: '30 Seagull Lane',
    line2: 'E16 1PY, London',
  })
  const [banking, setBanking] = useState({
    accountName: 'KM WELNESS LTD',
    sortCode: '04-00-05',
    accountNumber: '86383529',
  })
  const [session, setSession] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
  }, [])

  function handleSave() {
    toast.success('Settings saved (stored locally for this session)')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Configure your CRM defaults</p>
      </div>

      {/* Logged-in user */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Your Account</h2>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#EEF3EC] flex items-center justify-center text-[#3D6034] font-semibold text-sm">
            {session?.user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{session?.user?.email}</p>
            <p className="text-xs text-gray-400">Authenticated team member</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border border-gray-100">
          To invite new team members, go to your Supabase project → Authentication → Users → Invite user.
        </p>
      </div>

      {/* Invoice FROM */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Invoice — From Address</h2>
        <div>
          <label className="label">Business Name</label>
          <input className="input" value={fromAddress.name} onChange={e => setFromAddress(a => ({ ...a, name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Address Line 1</label>
          <input className="input" value={fromAddress.line1} onChange={e => setFromAddress(a => ({ ...a, line1: e.target.value }))} />
        </div>
        <div>
          <label className="label">Address Line 2</label>
          <input className="input" value={fromAddress.line2} onChange={e => setFromAddress(a => ({ ...a, line2: e.target.value }))} />
        </div>
      </div>

      {/* Banking */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Banking Details</h2>
        <div>
          <label className="label">Account Name</label>
          <input className="input" value={banking.accountName} onChange={e => setBanking(b => ({ ...b, accountName: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sort Code</label>
            <input className="input" value={banking.sortCode} onChange={e => setBanking(b => ({ ...b, sortCode: e.target.value }))} />
          </div>
          <div>
            <label className="label">Account Number</label>
            <input className="input" value={banking.accountNumber} onChange={e => setBanking(b => ({ ...b, accountNumber: e.target.value }))} />
          </div>
        </div>
        <p className="text-xs text-gray-400">These details appear on every invoice PDF.</p>
      </div>

      <button onClick={handleSave} className="btn-primary">
        <Save size={15} /> Save Settings
      </button>

      {/* Danger zone */}
      <div className="card p-5 border-red-100">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-red-400" />
          <h2 className="text-sm font-semibold text-red-500">Danger Zone</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Permanently delete all partner and order data. This cannot be undone.
          Use the Supabase dashboard to perform destructive operations safely.
        </p>
        <a
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-red-400 hover:underline"
        >
          Open Supabase Dashboard →
        </a>
      </div>
    </div>
  )
}
