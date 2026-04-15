import React, { useEffect, useState } from 'react';
import { SnapshotView } from '../components/SnapshotView.jsx';

export function PublicReport({ slug }) {
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    fetch(`/api/public/reports/${slug}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setSnap(j.snapshot);
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  if (err) return <div className="shell"><div className="container"><div className="error-card">Report not available.</div></div></div>;
  if (!snap) return <div className="splash">Loading report…</div>;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-dot" /> Collabix · Public report</div>
        <div className="topbar-right"><span className="muted small">Read-only snapshot</span></div>
      </header>
      <main className="container">
        <SnapshotView snapshot={snap} readOnly />
      </main>
    </div>
  );
}
