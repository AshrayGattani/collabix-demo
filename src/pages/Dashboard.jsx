import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import { navigate } from '../App.jsx';
import { SnapshotView } from '../components/SnapshotView.jsx';
import { TaskPanel } from '../components/TaskPanel.jsx';
import { InviteModal } from '../components/InviteModal.jsx';
import { ShareModal } from '../components/ShareModal.jsx';
import { TuningPanel } from '../components/TuningPanel.jsx';
import { exportReportPdf } from '../components/pdfExport.js';
import { CalendarView } from '../components/CalendarView.jsx';

export function Dashboard({ projectId }) {
  const { user, signOut } = useAuth();
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [tab, setTab] = useState('overview');
  const [thresholds, setThresholds] = useState({});
  const [seeding, setSeeding] = useState(false);
  const [viewAs, setViewAs] = useState(null); // user_id or null for admin view

  const load = useCallback(async (th = thresholds) => {
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(th || {})) qs.set(k, String(v));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const s = await apiFetch(`/api/projects/${projectId}${suffix}`);
      setSnap(s);
    } catch (e) {
      setErr(e.message);
    }
  }, [projectId, thresholds]);

  useEffect(() => { load(thresholds); }, [projectId, thresholds]);

  const isAdmin = snap?.members?.find((m) => m.user_id === user.id)?.role !== 'member';
  const viewAsMember = viewAs ? snap?.members?.find((m) => m.user_id === viewAs) : null;

  async function renameProject() {
    const newName = prompt('New project name:', snap.project.name);
    if (!newName || newName.trim() === snap.project.name) return;
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: 'PATCH', body: { name: newName.trim() } });
      await load(thresholds);
    } catch (e) {
      alert('Rename failed: ' + (e.body?.error || e.message));
    }
  }

  async function deleteProject() {
    if (!confirm(`Delete "${snap.project.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      navigate('/');
    } catch (e) {
      alert('Delete failed: ' + (e.body?.error || e.message));
    }
  }

  async function seed(reset = false) {
    setSeeding(true);
    try {
      const resp = await apiFetch(`/api/projects/${projectId}/events?action=seed`, {
        method: 'POST',
        body: { reset },
      });
      alert(
        `Seeded ${resp.created.length} virtual teammates, ${resp.tasks} tasks, ${resp.events} activity events.\n\n` +
          resp.created.map((c) => `\u2022 ${c.name} \u2014 profile: ${c.profile}`).join('\n')
      );
      load();
    } catch (e) {
      alert('Seed failed: ' + (e.body?.error || e.message) + (e.body?.step ? ` (at step: ${e.body.step})` : ''));
    } finally {
      setSeeding(false);
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '1') setTab('overview');
      else if (e.key === '2') setTab('tasks');
      else if (e.key === '3') setTab('calendar');
      else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) load(thresholds);
      else if (e.key === 'Escape') setViewAs(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [thresholds]);

  if (err) return <div className="shell"><div className="container"><div className="error-card">Could not load project: {err}</div></div></div>;
  if (!snap) return <div className="splash"><div className="loader" /><div>Loading dashboard\u2026</div></div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>← Projects</button>
          <div className="brand"><span className="brand-dot" /> {snap.project.name}</div>
        </div>
        <div className="topbar-right">
          {isAdmin && snap.members.length > 1 && (
            <div className="view-as-wrap">
              <select
                className="view-as-select"
                value={viewAs || ''}
                onChange={(e) => setViewAs(e.target.value || null)}
              >
                <option value="">Admin view</option>
                {snap.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    View as {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && <button className="btn btn-ghost" onClick={renameProject}>Rename</button>}
          {isAdmin && <button className="btn btn-ghost" onClick={() => setShowInvite(true)}>Invite</button>}
          {isAdmin && <button className="btn btn-ghost" onClick={() => setShowShare(true)}>Share</button>}
          {isAdmin && (
            <>
              <button className="btn btn-ghost" disabled={seeding} onClick={() => seed(false)} title="Add demo members + tasks + 21 days of activity">
                {seeding ? 'Seeding\u2026' : 'Seed demo'}
              </button>
              <button className="btn btn-ghost" disabled={seeding} onClick={() => confirm('Remove previous demo data and re-seed?') && seed(true)} title="Wipe previous demo data and reseed">
                Reset demo
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={() => load(thresholds)}>Refresh</button>
          <button className="btn btn-ghost" onClick={() => exportReportPdf(snap)}>Export PDF</button>
          {isAdmin && <button className="btn btn-ghost btn-danger" onClick={deleteProject}>Delete</button>}
          <span className="muted small">{user.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {viewAsMember && (
        <div className="view-as-banner">
          Viewing as <b>{viewAsMember.display_name}</b>
          <button className="btn btn-ghost small" onClick={() => setViewAs(null)}>Exit (Esc)</button>
        </div>
      )}

      <nav className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview <span className="muted small kbd">1</span>
        </button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks <span className="muted small kbd">2</span>
        </button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>
          Activity
        </button>
        <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
          Calendar <span className="muted small kbd">3</span>
        </button>
      </nav>

      <main className="container">
        {snap.members.length <= 1 && snap.tasks.length === 0 && (
          <div className="empty-hint">
            <b>Your dashboard is empty.</b> Click <b>Seed demo</b> in the top bar to populate 5 teammates with distinct profiles (quiet, late spike, steady, overloaded, rising), 10 tasks across all priorities, and 21 days of activity. Then play with the <b>Signal tuning</b> sliders to watch signals flip live.
          </div>
        )}
        {tab === 'overview' && (
          <>
            <SnapshotView snapshot={snap} viewAsId={viewAs} />
            <TuningPanel value={snap.thresholds || thresholds} onChange={setThresholds} />
          </>
        )}
        {tab === 'tasks' && (
          <TaskPanel projectId={projectId} snapshot={snap} onChange={() => load(thresholds)} currentUserId={viewAs || user.id} viewAsId={viewAs} />
        )}
        {tab === 'activity' && (
          <ActivityFeed snapshot={snap} viewAsId={viewAs} />
        )}
        {tab === 'calendar' && (
          <CalendarView
            tasks={snap.tasks}
            members={snap.members}
            events={buildFlatEvents(snap.members)}
            viewAsId={viewAs}
            onSelectMember={(id) => setViewAs(id)}
            projectDeadline={snap.project.deadline}
          />
        )}
      </main>

      {showInvite && <InviteModal projectId={projectId} onClose={() => { setShowInvite(false); load(); }} />}
      {showShare && <ShareModal projectId={projectId} onClose={() => setShowShare(false)} />}

      <footer className="dash-footer">
        <span className="muted small">Keyboard: <kbd>1</kbd> Overview · <kbd>2</kbd> Tasks · <kbd>3</kbd> Calendar · <kbd>R</kbd> Refresh · <kbd>Esc</kbd> Exit view-as</span>
      </footer>
    </div>
  );
}

// Build flat event array from per-member recentEvents (for calendar + feed)
function buildFlatEvents(members) {
  return members.flatMap((m) =>
    (m.recentEvents || []).map((e) => ({ ...e, actor_id: m.user_id, name: m.display_name }))
  );
}

// Activity Feed tab — project-level timeline combining all members' events
function ActivityFeed({ snapshot, viewAsId }) {
  const { members } = snapshot;
  const nameMap = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]));
  const allEvents = members
    .flatMap((m) => (m.recentEvents || []).map((e) => ({ ...e, user_id: m.user_id, name: m.display_name })))
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
    .slice(0, 30);
  const filtered = viewAsId ? allEvents.filter((e) => e.user_id === viewAsId) : allEvents;

  return (
    <section className="card fade-in">
      <div className="section-head">
        <h3>Activity feed</h3>
        <span className="muted small">{filtered.length} recent events{viewAsId ? ` for ${nameMap[viewAsId]}` : ''}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="muted">No activity recorded yet.</div>
      ) : (
        <ul className="timeline feed-timeline">
          {filtered.map((e, i) => (
            <li key={i} className="feed-item">
              <span className="tl-dot" />
              <div>
                <div className="small"><b>{e.name}</b> <span className="muted">{e.kind.replace(/_/g, ' ')}</span></div>
                <div className="muted small">{relTime(e.occurred_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function relTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
