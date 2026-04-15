import React, { useEffect, useState } from 'react';
import { apiFetch } from '../supabase.js';
import { useAuth } from '../hooks/useAuth.js';
import { navigate } from '../App.jsx';

export function AcceptInvite({ token }) {
  const { user, signOut } = useAuth();
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/api/invitations/${token}`).then(({ invitation }) => setInvite(invitation)).catch((e) => setErr(e.message));
  }, [token]);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      const { project_id } = await apiFetch(`/api/invitations/${token}`, { method: 'POST' });
      navigate(`/p/${project_id}`);
    } catch (e) {
      setErr(e.body?.message || e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !invite) return <div className="shell"><div className="container"><div className="error-card">Invite not found or expired.</div></div></div>;
  if (!invite) return <div className="splash">Loading invite…</div>;

  const emailMatch = user.email?.toLowerCase() === invite.email.toLowerCase();

  return (
    <div className="shell">
      <main className="container narrow">
        <div className="card stack center">
          <div className="brand"><span className="brand-dot" /> Collabix</div>
          <h2>You've been invited</h2>
          <p className="muted">
            Join <b>{invite.project?.name}</b> as a <b>{invite.role}</b>.
          </p>
          <p className="small muted">Invite for {invite.email} · Signed in as {user.email}</p>
          {!emailMatch && (
            <div className="warn">
              This invite was sent to a different email. Sign out and sign in as {invite.email} to accept.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
              </div>
            </div>
          )}
          {emailMatch && (
            <button className="btn btn-primary" disabled={busy} onClick={accept}>
              {busy ? 'Joining…' : 'Accept and join'}
            </button>
          )}
          {err && <div className="error">{err}</div>}
        </div>
      </main>
    </div>
  );
}
