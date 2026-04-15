import React, { useEffect, useState } from 'react';
import { apiFetch } from '../supabase.js';

export function ShareModal({ projectId, onClose }) {
  const [reports, setReports] = useState([]);
  const [expiresDays, setExpiresDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(null);

  async function load() {
    const { reports } = await apiFetch(`/api/projects/${projectId}/share`);
    setReports(reports);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setBusy(true);
    try {
      const body = expiresDays ? { expires_in_days: Number(expiresDays) } : {};
      const { slug } = await apiFetch(`/api/projects/${projectId}/share`, { method: 'POST', body });
      setLatest(`${window.location.origin}/#/r/${slug}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Share a public snapshot</h3>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">
          Anyone with the link will see a frozen, read-only snapshot of your current dashboard. Good for sending to a professor or mentor.
        </p>
        <div className="stack">
          <label className="field">
            <span>Expires in (days, optional)</span>
            <input type="number" min="1" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="Never" />
          </label>
          <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create share link'}</button>
          {latest && (
            <div className="status ok">
              <div className="small">
                <a href={latest}>{latest}</a>
                <button className="btn btn-ghost small" style={{ marginLeft: 8 }} onClick={() => navigator.clipboard.writeText(latest)}>Copy</button>
              </div>
            </div>
          )}
        </div>
        <hr />
        <h4>Existing links</h4>
        {reports.length === 0 ? <div className="muted small">None yet.</div> : (
          <ul className="clean-list">
            {reports.map((r) => {
              const url = `${window.location.origin}/#/r/${r.slug}`;
              return (
                <li key={r.id}>
                  <a href={url}>{url}</a>
                  <span className="muted small"> · {new Date(r.created_at).toLocaleDateString()}{r.expires_at ? ` · expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
