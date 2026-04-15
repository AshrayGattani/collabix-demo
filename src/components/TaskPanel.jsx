import React, { useMemo, useState } from 'react';
import { apiFetch } from '../supabase.js';
import { MemberPicker } from './MemberPicker.jsx';

const COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
];

export function TaskPanel({ projectId, snapshot, onChange, currentUserId }) {
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ title: '', priority: 'medium', assignee_id: currentUserId, due_date: '' });

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
    } finally {
      setBusy(false);
    }
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
    if (filter === 'all') return snapshot.tasks;
    if (filter === 'mine') return snapshot.tasks.filter((t) => t.assignee_id === currentUserId);
    return snapshot.tasks.filter((t) => t.assignee_id === filter);
  }, [filter, snapshot.tasks, currentUserId]);

  const grouped = COLUMNS.map((c) => ({ ...c, items: filtered.filter((t) => t.status === c.id) }));

  return (
    <div className="stack">
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
        <div className="filter-row">
          <strong>Filter:</strong>
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`chip ${filter === 'mine' ? 'active' : ''}`} onClick={() => setFilter('mine')}>Mine</button>
          {snapshot.members.map((m) => (
            <button key={m.user_id} className={`chip ${filter === m.user_id ? 'active' : ''}`} onClick={() => setFilter(m.user_id)}>
              {m.display_name}
            </button>
          ))}
        </div>

        <div className="board">
          {grouped.map((col) => (
            <div key={col.id} className="board-col">
              <div className="board-col-head">{col.label} <span className="muted small">{col.items.length}</span></div>
              {col.items.map((t) => {
                const assignee = snapshot.members.find((m) => m.user_id === t.assignee_id);
                return (
                  <div key={t.id} className={`task-card priority-${t.priority}`}>
                    <div className="task-title">{t.title}</div>
                    <div className="task-meta">
                      <span className={`pill pill-${t.priority}`}>{t.priority}</span>
                      {t.due_date && <span className="muted small">due {t.due_date}</span>}
                    </div>
                    <div className="task-assignee">
                      <MemberPicker
                        members={snapshot.members}
                        value={t.assignee_id}
                        onChange={(v) => update(t, { assignee_id: v || null })}
                        allowUnassigned
                        compact
                      />
                    </div>
                    <div className="task-actions">
                      <select value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
                        {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <button className="btn btn-ghost small" onClick={() => remove(t)}>Delete</button>
                    </div>
                  </div>
                );
              })}
              {col.items.length === 0 && <div className="muted small">Nothing here.</div>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
