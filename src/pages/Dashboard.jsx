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

export function Dashboard({ projectId }) {
  const { user, signOut } = useAuth();
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [tab, setTab] = useState('overview');
  const [thresholds, setThresholds] = useState({});
  const [seeding, setSeeding] = useState(false);

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

  useEffect(() => { load(thresholds); /* eslint-disable-next-line */ }, [projectId, thresholds]);

  const isAdmin = snap?.members?.find((m) => m.user_id === user.id)?.role !== 'member';

  async function seed(reset = false) {
    setSeeding(true);
    try {
      const resp = await apiFetch(`/api/projects/${projectId}/seed-demo`, {
        method: 'POST',
        body: { reset },
      });
      alert(
        `Seeded ${resp.created.length} virtual teammates, ${resp.tasks} tasks, ${resp.events} activity events.\n\n` +
          resp.created.map((c) => `• ${c.name} — profile: ${c.profile}`).join('\n')
      );
      load();
    } catch (e) {
      alert('Seed failed: ' + (e.body?.error || e.message) + (e.body?.step ? ` (at step: ${e.body.step})` : ''));
    } finally {
      setSeeding(false);
    }
  }

  if (err) return <div className="shell"><div className="container"><div className="error-card">Could not load project: {err}</div></div></div>;
  if (!snap) return <div className="splash">Loading dashboard…</div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost" onClick={() => navigate('/')}>← Projects</button>
          <div className="brand"><span className="brand-dot" /> {snap.project.name}</div>
        </div>
        <div className="topbar-right">
          {isAdmin && <button className="btn btn-ghost" onClick={() => setShowInvite(true)}>Invite</button>}
          {isAdmin && <button className="btn btn-ghost" onClick={() => setShowShare(true)}>Share</button>}
          {isAdmin && (
            <>
              <button className="btn btn-ghost" disabled={seeding} onClick={() => seed(false)} title="Add demo members + tasks + 21 days of activity">
                {seeding ? 'Seeding…' : 'Seed demo'}
              </button>
              <button className="btn btn-ghost" disabled={seeding} onClick={() => confirm('Remove previous demo data and re-seed?') && seed(true)} title="Wipe previous demo data and reseed">
                Reset demo
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={() => load(thresholds)}>Refresh</button>
          <button className="btn btn-ghost" onClick={() => exportReportPdf(snap)}>Export PDF</button>
          <span className="muted small">{user.email}</span>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>Tasks</button>
      </nav>

      <main className="container">
        {snap.members.length <= 1 && snap.tasks.length === 0 && (
          <div className="empty-hint">
            <b>Your dashboard is empty.</b> Click <b>Seed demo</b> in the top bar to populate 5 teammates with distinct profiles (quiet, late spike, steady, overloaded, rising), 10 tasks across all priorities, and 21 days of activity. Then play with the <b>Signal tuning</b> sliders to watch signals flip live.
          </div>
        )}
        {tab === 'overview' && (
          <>
            <SnapshotView snapshot={snap} />
            <TuningPanel value={snap.thresholds || thresholds} onChange={setThresholds} />
          </>
        )}
        {tab === 'tasks' && (
          <TaskPanel projectId={projectId} snapshot={snap} onChange={() => load(thresholds)} currentUserId={user.id} />
        )}
      </main>

      {showInvite && <InviteModal projectId={projectId} onClose={() => { setShowInvite(false); load(); }} />}
      {showShare && <ShareModal projectId={projectId} onClose={() => setShowShare(false)} />}
    </div>
  );
}
