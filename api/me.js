import { cors, json, methodNotAllowed } from './_lib/http.js';
import { admin } from './_lib/supabase.js';
import { requireUser } from './_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res);
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { data: profile } = await admin.from('profiles').select('*').eq('id', ctx.user.id).maybeSingle();
  json(res, 200, { user: ctx.user, profile });
}
