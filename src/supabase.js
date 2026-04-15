import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('[collabix] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Auth will not work.');
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const err = new Error(json?.error || json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
