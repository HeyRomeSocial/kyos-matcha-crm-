import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/utils'
import { UserCircle, Mail, CheckSquare } from 'lucide-react'

export default function Team() {
  const [session, setSession] = useState(null)
  const [tasks, setTasks] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    supabase.from('tasks').select('*').neq('status', 'done').then(({ data }) => setTasks(data || []))
  }, [])

  // Group tasks by assignee
  const byAssignee = tasks.reduce((acc, t) => {
    const key = t.assigned_to || 'Unassigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const members = Object.entries(byAssignee).sort((a, b) => b[1].length - a[1].length)

  const PRIORITY_COLORS = { high: 'text-red-500', medium: 'text-amber-500', low: 'text-gray-400' }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Team</h1>
        <p className="text-sm text-gray-500 mt-0.5">Team members and their open tasks</p>
      </div>

      {/* Logged in user */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">You</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#EEF3EC] flex items-center justify-center text-[#3D6034] font-bold text-lg">
            {session?.user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{session?.user?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">Authenticated team member</p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-[#EEF3EC]/60 rounded-lg border border-[#b3d0ab]/40">
          <p className="text-xs text-gray-500">
            To invite new team members: <strong>Supabase → Authentication → Users → Invite user</strong>
          </p>
        </div>
      </div>

      {/* Task assignment overview */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Open Tasks by Team Member</h2>
        {members.length === 0 ? (
          <div className="card p-8 text-center">
            <CheckSquare size={24} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No open tasks assigned yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {members.map(([name, memberTasks]) => (
              <div key={name} className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EEF3EC] flex items-center justify-center text-[#3D6034] font-semibold text-sm">
                      {name[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{memberTasks.length} open task{memberTasks.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {memberTasks.map(t => (
                    <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.priority === 'high' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{t.title}</p>
                        {t.partner_name && <p className="text-xs text-[#3D6034]">{t.partner_name}</p>}
                      </div>
                      {t.due_date && <p className="text-xs text-gray-400 flex-shrink-0">{formatDate(t.due_date)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
