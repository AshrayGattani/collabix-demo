import { cors, json, readJson, methodNotAllowed } from '../_lib/http.js';
import { admin } from '../_lib/supabase.js';
import { requireUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('project_members')
      .select('role, project:projects(id, name, description, deadline, owner_id, created_at)')
      .eq('user_id', ctx.user.id);
    if (error) return json(res, 500, { error: error.message });
    const projects = (data || [])
      .filter((r) => r.project)
      .map((r) => ({ ...r.project, role: r.role }));
    return json(res, 200, { projects });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const name = (body.name || '').trim();
    if (!name) return json(res, 400, { error: 'name_required' });
    const { data, error } = await admin
      .from('projects')
      .insert({
        name,
        description: body.description || null,
        deadline: body.deadline || null,
        owner_id: ctx.user.id,
      })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, { project: data });
  }

  return methodNotAllowed(res);
}
