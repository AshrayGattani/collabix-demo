import React, { useEffect, useState } from 'react';
import { apiFetch } from '../supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import { navigate } from '../App.jsx';

export function Projects() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', deadline: '' });
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { projects } = await apiFetch('/api/projects');
      setProjects(projects);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { project } = await apiFetch('/api/projects', { method: 'POST', body: form });
      navigate(`/p/${project.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-dot" /> Collabix</div>
        <div className="topbar-right">
          <span className="muted small">{user?.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="container">
        <div className="page-head">
          <div>
            <h1>Your projects</h1>
            <p className="muted">Pick a workspace or start a new one.</p>
          </div>
        </div>

        <section className="card stack">
          <h3>Create a new project</h3>
          <form onSubmit={create} className="grid-form">
            <label className="field">
              <span>Name</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CSCI 577A Team 5" />
            </label>
            <label className="field">
              <span>Deadline (optional)</span>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </label>
            <label className="field span-2">
              <span>Description</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's this project about?" />
            </label>
            <div className="span-2">
              <button className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create project'}</button>
              {error && <span className="error"> {error}</span>}
            </div>
          </form>
        </section>

        <section className="stack">
          <h3>Open projects</h3>
          {projects === null ? (
            <div className="skeleton-card" />
          ) : projects.length === 0 ? (
            <div className="empty">No projects yet. Create your first one above.</div>
          ) : (
            <div className="project-grid">
              {projects.map((p) => (
                <button key={p.id} className="project-card" onClick={() => navigate(`/p/${p.id}`)}>
                  <div className="project-card-head">
                    <h4>{p.name}</h4>
                    <span className={`chip chip-${p.role}`}>{p.role}</span>
                  </div>
                  {p.description && <p className="muted small">{p.description}</p>}
                  {p.deadline && <div className="small">Deadline: {p.deadline}</div>}
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
