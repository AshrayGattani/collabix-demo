import React, { useMemo, useState } from 'react';
import { apiFetch } from '../supabase.js';
import { MemberPicker } from './MemberPicker.jsx';

const COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function TaskPanel({ projectId, snapshot, onChange, currentUserId, viewAsId }) {
  const [busy, setBusy] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState(viewAsId || 'all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', priority: 'medium', assignee_id: currentUserId, due_date: '' });
  const [dragId, setDragId] = useState(null);

  async function createTask(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        body: { ...form, assignee_id: form.assignee_id || null, due_date: form.due_date || null },
      });
      setForm({ title: '', priority: 'medium', assignee_id: currentUserId, due_date: '' });
      onChange();
    } finally { setBusy(false); }
  }

  async function update(task, patch) {
    await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: 'PATCH', body: patch });
    onChange();
  }

  async function remove(task) {
    if (!confirm(`Delete "${task.title}"?`)) return;
    await apiFetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: 'DELETE' });
    onChange();
  }

  const filtered = useMemo(() => {
    let tasks = snapshot.tasks;
    if (filterAssignee === 'mine') tasks = tasks.filter((t) => t.assignee_id === currentUserId);
    else if (filterAssignee !== 'all') tasks = tasks.filter((t) => t.assignee_id === filterAssignee);
    if (filterPriority !== 'all') tasks = tasks.filter((t) => t.priority === filterPriority);
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter((t) => t.title.toLowerCase().includes(q));
    }
    return tasks;
  }, [filterAssignee, filterPriority, search, snapshot.tasks, currentUserId]);

  const grouped = COLUMNS.map((c) => ({ ...c, items: filtered.filter((t) => t.status === c.id) }));

  // Drag-and-drop handler
  function onDrop(newStatus) {
    if (!dragId) return;
    const task = snapshot.tasks.find((t) => t.id === dragId);
    if (task && task.status !== newStatus) update(task, { status: newStatus });
    setDragId(null);
  }

  // Task summary counts
  const total = filtered.length;
  const doneCount = filtered.filter((t) => t.status === 'done').length;

  return (
    <div className="stack fade-in">
      <section className="card">
        <h3>Add task</h3>
        <form onSubmit={createTask} className="grid-form">
          <label className="field span-2">
            <span>Title</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Draft system proposal introduction" />
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="field">
            <span>Due date</span>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </label>
          <label className="field span-2">
            <span>Assignee</span>
            <MemberPicker members={snapshot.members} value={form.assignee_id} onChange={(v) => setForm({ ...form, assignee_id: v })} allowUnassigned />
          </label>
          <div className="span-2">
            <button className="btn btn-primary" disabled={busy}>Add task</button>
          </div>
        </form>
      </section>

      <section>
        <div className="filter-bar">
          <div className="filter-group">
            <label className="filter-label">Assignee</label>
            <div className="filter-chips">
              <button className={`chip ${filterAssignee === 'all' ? 'active' : ''}`} onClick={() => setFilterAssignee('all')}>All</button>
              <button className={`chip ${filterAssignee === 'mine' ? 'active' : ''}`} onClick={() => setFilterAssignee('mine')}>Mine</button>
              {snapshot.members.map((m) => (
                <button key={m.user_id} className={`chip ${filterAssignee === m.user_id ? 'active' : ''}`} onClick={() => setFilterAssignee(m.user_id)}>
                  {m.display_name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label className="filter-label">Priority</label>
            <div className="filter-chips">
              <button className={`chip ${filterPriority === 'all' ? 'active' : ''}`} onClick={() => setFilterPriority('all')}>All</button>
              {PRIORITIES.map((p) => (
                <button key={p} className={`chip chip-${p} ${filterPriority === p ? 'active' : ''}`} onClick={() => setFilterPriority(filterPriority === p ? 'all' : p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <input className="search-input" type="text" placeholder="Search tasks\u2026" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="board-summary muted small">
          Showing {total} task{total === 1 ? '' : 's'} \u00b7 {doneCount} done \u00b7 {total - doneCount} remaining
        </div>

        <div className="board">
          {grouped.map((col) => (
            <div
              key={col.id}
              className="board-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.id)}
            >
              <div className="board-col-head">
                {col.label} <span className="badge">{col.items.length}</span>
              </div>
              {col.items.map((t) => {
                const assignee = snapshot.members.find((m) => m.user_id === t.assignee_id);
                const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                return (
                  <div
                    key={t.id}
                    className={`task-card priority-${t.priority} ${overdue ? 'task-overdue' : ''}`}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="task-title">{t.title}</div>
                    <div className="task-meta">
                      <span className={`pill pill-${t.priority}`}>{t.priority}</span>
                      {t.due_date && <span className={`muted small ${overdue ? 'text-err' : ''}`}>{overdue ? 'OVERDUE' : 'due'} {t.due_date}</span>}
                    </div>
                    {assignee && (
                      <div className="task-assignee-chip">
                        <span className="avatar avatar-fallback avatar-xs">{(assignee.display_name || '?')[0]}</span>
                        <span className="small">{assignee.display_name.split(' ')[0]}</span>
                      </div>
                    )}
                    <div className="task-actions">
                      <select value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
                        {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <select value={t.priority} onChange={(e) => update(t, { priority: e.target.value })}>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button className="btn btn-ghost small" onClick={() => remove(t)}>×</button>
                    </div>
                  </div>
                );
              })}
              {col.items.length === 0 && <div className="board-empty muted small">No tasks</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
