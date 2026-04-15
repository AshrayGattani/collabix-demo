import React, { useState } from 'react';
import { supabase } from '../supabase.js';

export function Login({ continueTo }) {
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const redirectTarget =
    window.location.origin + '/' + (continueTo ? continueTo.replace(/^#?\/?/, '') : '');

  async function signInPassword(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange in useAuth will flip the UI automatically
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTarget },
      });
      if (error) throw error;
      setStatus({ kind: 'ok', msg: `Magic link sent to ${email}. Check your inbox.` });
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTarget },
      });
    } catch (err) {
      setStatus({ kind: 'err', msg: err.message });
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-dot" /> Collabix
        </div>
        <h1>Signals-first project intelligence</h1>
        <p className="muted">
          See what's really happening on your team — workload balance, quiet members, late spikes, deadline risk.
        </p>

        <button className="btn btn-google" onClick={google} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div className="sep"><span>or</span></div>

        <div className="mode-toggle">
          <button
            type="button"
            className={`chip ${mode === 'password' ? 'active' : ''}`}
            onClick={() => { setMode('password'); setStatus(null); }}
          >
            Email + password
          </button>
          <button
            type="button"
            className={`chip ${mode === 'magic' ? 'active' : ''}`}
            onClick={() => { setMode('magic'); setStatus(null); }}
          >
            Magic link
          </button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={signInPassword} className="stack">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="fineprint">
              Demo users are created by an admin in Supabase. Ask your team lead for credentials.
            </p>
          </form>
        ) : (
          <form onSubmit={sendMagicLink} className="stack">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}

        {status && <div className={`status ${status.kind}`}>{status.msg}</div>}

        <p className="fineprint">By continuing you agree to use Collabix responsibly with your team.</p>
      </div>
      <div className="auth-hero">
        <div className="hero-card">
          <div className="hero-pill">Live signals</div>
          <h2>Not just a task list — a pulse on your team.</h2>
          <ul className="hero-list">
            <li>🔕 Quiet member detection</li>
            <li>⚡ Late-spike alerts before deadlines</li>
            <li>⚖️ Workload balance score</li>
            <li>📈 21-day contribution heatmap</li>
            <li>📤 Shareable PDF reports for your professor</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
