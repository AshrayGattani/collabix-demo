import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) console.warn('[collabix] SUPABASE_URL is not set');

// Admin client — uses service role, bypasses RLS. Use only for trusted server ops
// (sending invites, writing public reports, cron jobs).
export const admin = serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// Per-request user client — RLS applies, acts as the authenticated user.
export function userClient(accessToken) {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {},
  });
}

export function getAccessToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}
