import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectMember, requireProjectAdmin } from '../../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;

  if (req.method === 'GET') {
    const ctx = await requireProjectMember(req, res, projectId);
    if (!ctx) return;
    const { data } = await admin
      .from('project_members')
      .select('user_id, role, display_name, email, joined_at')
      .eq('project_id', projectId);
    const ids = (data || []).map((m) => m.user_id);
    let profileMap = {};
    if (ids.length) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', ids);
      profileMap = Object.fromEntries((profs || []).map((p) => [p.id, p]));
    }
    const members = (data || []).map((m) => {
      const p = profileMap[m.user_id];
      return {
        user_id: m.user_id,
        role: m.role,
        email: m.email || p?.email,
        display_name: m.display_name || p?.full_name || p?.email || m.email || 'Member',
        avatar_url: p?.avatar_url,
        joined_at: m.joined_at,
      };
    });
    return json(res, 200, { members });
  }

  if (req.method === 'PATCH') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const body = await readJson(req);
    if (!body.user_id) return json(res, 400, { error: 'user_id_required' });
    const patch = {};
    if (body.role) patch.role = body.role;
    if ('display_name' in body) patch.display_name = body.display_name;
    const { data, error } = await admin
      .from('project_members')
      .update(patch)
      .eq('project_id', projectId)
      .eq('user_id', body.user_id)
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { member: data });
  }

  if (req.method === 'DELETE') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const body = await readJson(req);
    if (!body.user_id) return json(res, 400, { error: 'user_id_required' });
    const { data: proj } = await admin.from('projects').select('owner_id').eq('id', projectId).single();
    if (body.user_id === proj?.owner_id) return json(res, 400, { error: 'cannot_remove_owner' });
    const { error } = await admin
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', body.user_id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(res);
}
