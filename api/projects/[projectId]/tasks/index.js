import { cors, json, readJson, methodNotAllowed } from '../../../_lib/http.js';
import { admin } from '../../../_lib/supabase.js';
import { requireProjectMember } from '../../../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;
  const ctx = await requireProjectMember(req, res, projectId);
  if (!ctx) return;

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { tasks: data || [] });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const title = (body.title || '').trim();
    if (!title) return json(res, 400, { error: 'title_required' });
    const { data, error } = await admin
      .from('tasks')
      .insert({
        project_id: projectId,
        title,
        description: body.description || null,
        status: body.status || 'todo',
        priority: body.priority || 'medium',
        assignee_id: body.assignee_id || null,
        due_date: body.due_date || null,
        created_by: ctx.user.id,
      })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    await admin.from('activity_events').insert({
      project_id: projectId,
      actor_id: ctx.user.id,
      kind: 'task_created',
      weight: 1,
      metadata: { task_id: data.id, title: data.title },
    });
    return json(res, 201, { task: data });
  }

  return methodNotAllowed(res);
}
