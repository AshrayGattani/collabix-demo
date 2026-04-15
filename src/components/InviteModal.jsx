import React, { useEffect, useState } from 'react';
import { apiFetch } from '../supabase.js';

export function InviteModal({ projectId, onClose }) {
  const [mode, setMode] = useState('demo'); // 'demo' = create user with password, 'email' = send invite link
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState('member');
  const [password, setPassword] = useState(() => randomPw());
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    try {
      const { invitations } = await apiFetch(`/api/projects/${projectId}/invite`);
      setPending(invitations);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function send(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const list = emails.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
      if (!list.length) throw new Error('Add at least one email');
      const origin = window.location.origin;
      const body = { emails: list, role };
      if (mode === 'demo') body.password = password;
      const resp = await apiFetch(`/api/projects/${projectId}/invite`, { method: 'POST', body });

      if (mode === 'demo') {
        setMsg({
          kind: 'ok',
          msg: `Created ${resp.provisioned.length} demo account${resp.provisioned.length === 1 ? '' : 's'}. Share these credentials:`,
          accounts: resp.provisioned,
        });
      } else {
        setMsg({
          kind: 'ok',
          msg: `Sent ${resp.invitations.length} invite link${resp.invitations.length === 1 ? '' : 's'}. Copy-paste if email delivery is slow:`,
          links: resp.invitations.map((i) => ({ email: i.email, url: `${origin}/#/invite/${i.token}` })),
        });
      }
      setEmails('');
      setPassword(randomPw());
      load();
    } catch (e) {
      setMsg({ kind: 'err', msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Add teammates</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </header>

        <div className="mode-toggle">
          <button type="button" className={`chip ${mode === 'demo' ? 'active' : ''}`} onClick={() => setMode('demo')}>
            Demo accounts (no email)
          </button>
          <button type="button" className={`chip ${mode === 'email' ? 'active' : ''}`} onClick={() => setMode('email')}>
            Send invite link
          </button>
        </div>
        <p className="muted small">
          {mode === 'demo'
            ? 'Creates confirmed Supabase users with the password below and adds them to this project. Perfect for live demos — no email needed.'
            : 'Sends an invite email via Supabase and generates a join link. If email is rate-limited, copy-paste the link that appears after submitting.'}
        </p>

        <form onSubmit={send} className="stack">
          <label className="field">
            <span>Emails (comma or space separated)</span>
            <textarea rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="maya@usc.edu, alex@usc.edu" />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {mode === 'demo' && (
            <label className="field">
              <span>Shared password (same for all accounts in this batch)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                <button type="button" className="btn btn-ghost" onClick={() => setPassword(randomPw())}>Regenerate</button>
              </div>
            </label>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Working…' : mode === 'demo' ? 'Create accounts' : 'Send invites'}
          </button>
        </form>

        {msg && (
          <div className={`status ${msg.kind}`}>
            {msg.msg}
            {msg.accounts && (
              <div className="stack" style={{ marginTop: 8 }}>
                {msg.accounts.map((a) => (
                  <div key={a.email} className="small">
                    <b>{a.email}</b> · password: <code>{a.password}</code>
                    <button className="btn btn-ghost small" style={{ marginLeft: 8 }}
                      onClick={() => navigator.clipboard.writeText(`${a.email} / ${a.password}`)}>Copy</button>
                  </div>
                ))}
                <div className="muted small">They sign in at this URL using email + password:</div>
                <div className="small"><code>{window.location.origin}</code></div>
              </div>
            )}
            {msg.links && (
              <div className="stack" style={{ marginTop: 8 }}>
                {msg.links.map((l) => (
                  <div key={l.url} className="small">
                    <b>{l.email}</b> · <a href={l.url}>{l.url}</a>
                    <button className="btn btn-ghost small" style={{ marginLeft: 8 }} onClick={() => navigator.clipboard.writeText(l.url)}>Copy</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <hr />
        <h4>Pending email invites</h4>
        {pending.length === 0 ? <div className="muted small">No pending invitations.</div> : (
          <ul className="clean-list">
            {pending.map((i) => (
              <li key={i.id}>
                {i.email} · {i.role} · <span className="muted small">expires {new Date(i.expires_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function randomPw() {
  const words = ['river','tiger','cloud','piano','maple','orbit','delta','pixel','quartz','solar','nova','ember'];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(10 + Math.random() * 90);
  return `${a}-${b}-${n}`;
}
