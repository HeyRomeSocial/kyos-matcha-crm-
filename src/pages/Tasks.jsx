import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { Plus, Trash2, CheckCircle, Circle, Clock, ChevronDown, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, isPast, parseISO } from 'date-fns'

const PRIORITIES = ['high', 'medium', 'low']
const STATUSES = ['todo', 'in_progress', 'done']

const PRIORITY_STYLES = {
  high:   'bg-red-100 text-red-600',
  medium: 'bg-amber-100 text-amber-600',
  low:    'bg-gray-100 text-gray-500',
}

const STATUS_LABELS = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

function TaskModal({ task, partners, onClose, onSaved, currentUser }) {
  const [form, setForm] = useState(task || {
    title: '', due_date: '', assigned_to: '', partner_id: '',
    partner_name: '', priority: 'medium', status: 'todo', notes: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const partnerObj = partners.find(p => p.id === form.partner_id)
    const payload = {
      ...form,
      partner_name: partnerObj?.name || null,
      partner_id: form.partner_id || null,
      due_date: form.due_date || null,
      created_by: currentUser,
    }
    let error
    if (task?.id) {
      ;({ error } = await supabase.from('tasks').update(payload).eq('id', task.id))
    } else {
      ;({ error } = await supabase.from('tasks').insert(payload))
    }
    if (error) toast.error(error.message)
    else { toast.success(task?.id ? 'Task updated' : 'Task created'); onSaved() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold">{task?.id ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Follow up with Cabana" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Assigned To</label>
              <input className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} placeholder="Team member name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Linked Cafe (optional)</label>
            <select className="input" value={form.partner_id || ''} onChange={e => set('partner_id', e.target.value)}>
              <option value="">No cafe linked</option>
              {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input resize-none" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [currentUser, setCurrentUser] = useState(null)

  const load = useCallback(async () => {
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('partners').select('id, name').order('name'),
    ])
    setTasks(t || [])
    setPartners(p || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    supabase.auth.getSession().then(({ data }) => setCurrentUser(data.session?.user?.id))
    const channel = supabase.channel('tasks_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  async function toggleStatus(task) {
    const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done'
    await supabase.from('tasks').update({ status: next }).eq('id', task.id)
  }

  async function deleteTask(id) {
    await supabase.from('tasks').delete().eq('id', id)
    toast.success('Task deleted')
  }

  const filtered = tasks.filter(t => {
    const ms = filterStatus === 'all' || t.status === filterStatus
    const mp = filterPriority === 'all' || t.priority === filterPriority
    return ms && mp
  })

  const counts = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.status !== 'done' && t.due_date && isPast(parseISO(t.due_date))).length,
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.filter(t => t.status !== 'done').length} open · {counts.done} done</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary">
          <Plus size={16} /> New Task
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { label: 'To Do', value: counts.todo, color: 'bg-gray-100 text-gray-600' },
          { label: 'In Progress', value: counts.in_progress, color: 'bg-blue-100 text-blue-600' },
          { label: 'Done', value: counts.done, color: 'bg-green-100 text-[#3D6034]' },
          { label: 'Overdue', value: counts.overdue, color: 'bg-red-100 text-red-600' },
        ].map(c => (
          <div key={c.label} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${c.color}`}>
            {c.label} <span className="font-bold">{c.value}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <select className="input text-xs py-1.5 w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <select className="input text-xs py-1.5 w-36" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="all">All priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Task list */}
      <div className="card divide-y divide-gray-50">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No tasks yet — click New Task to add one
          </div>
        ) : filtered.map(task => {
          const isOverdue = task.status !== 'done' && task.due_date && isPast(parseISO(task.due_date))
          const isDone = task.status === 'done'
          return (
            <div key={task.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
              {/* Toggle button */}
              <button onClick={() => toggleStatus(task)} className="mt-0.5 flex-shrink-0">
                {isDone
                  ? <CheckCircle size={18} className="text-[#3D6034]" />
                  : task.status === 'in_progress'
                  ? <Clock size={18} className="text-blue-500" />
                  : <Circle size={18} className="text-gray-300 hover:text-gray-500" />
                }
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setModal(task)}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[task.priority]}`}>
                    {task.priority}
                  </span>
                  {task.status === 'in_progress' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                      In Progress
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {task.due_date && (
                    <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {isOverdue ? '⚠ Overdue · ' : ''}{formatDate(task.due_date)}
                    </span>
                  )}
                  {task.assigned_to && (
                    <span className="text-xs text-gray-400">👤 {task.assigned_to}</span>
                  )}
                  {task.partner_name && (
                    <span className="text-xs text-[#3D6034] bg-[#EEF3EC] px-2 py-0.5 rounded-full">
                      {task.partner_name}
                    </span>
                  )}
                  {task.notes && (
                    <span className="text-xs text-gray-400 truncate max-w-xs">{task.notes}</span>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => deleteTask(task.id)}
                className="p-1.5 rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {modal !== null && (
        <TaskModal
          task={modal?.id ? modal : null}
          partners={partners}
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
