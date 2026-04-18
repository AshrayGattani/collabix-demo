import { cors, json, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return methodNotAllowed(res);
  const slug = req.query?.slug || req.params?.slug;
  if (!slug) return json(res, 400, { error: 'slug_required' });
  const { data, error } = await admin
    .from('shared_reports')
    .select('snapshot, expires_at, created_at')
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return json(res, 404, { error: 'not_found' });
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    return json(res, 410, { error: 'expired' });
  return json(res, 200, { snapshot: data.snapshot, created_at: data.created_at });
}
