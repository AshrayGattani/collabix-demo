import React, { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { Login } from './pages/Login.jsx';
import { Projects } from './pages/Projects.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { AcceptInvite } from './pages/AcceptInvite.jsx';
import { PublicReport } from './pages/PublicReport.jsx';

// Tiny hash router: #/, #/login, #/p/<id>, #/invite/<token>, #/r/<slug>
function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { hash, parts };
}

export function navigate(to) {
  window.location.hash = to;
}

export function App() {
  const { user, loading } = useAuth();
  const { parts } = useRoute();

  // Public report is accessible without login
  if (parts[0] === 'r' && parts[1]) return <PublicReport slug={parts[1]} />;

  if (loading) return <div className="splash">Loading…</div>;

  if (!user) {
    // Accept invite flow requires login — show login with continuation
    if (parts[0] === 'invite' && parts[1]) {
      return <Login continueTo={`#/invite/${parts[1]}`} />;
    }
    return <Login />;
  }

  if (parts[0] === 'invite' && parts[1]) return <AcceptInvite token={parts[1]} />;
  if (parts[0] === 'p' && parts[1]) return <Dashboard projectId={parts[1]} />;
  return <Projects />;
}
