import { cors, json, readJson, methodNotAllowed } from '../../../_lib/http.js';
import { admin } from '../../../_lib/supabase.js';
import { requireProjectMember } from '../../../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;
  const id = req.query?.id || req.params?.id;
  const ctx = await requireProjectMember(req, res, projectId);
  if (!ctx) return;

  if (req.method === 'PATCH') {
    const body = await readJson(req);
    const patch = {};
    for (const k of ['title', 'description', 'status', 'priority', 'assignee_id', 'due_date']) {
      if (k in body) patch[k] = body[k];
    }
    const { data: before } = await admin.from('tasks').select('*').eq('id', id).single();
    const { data, error } = await admin
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    const events = [];
    if (before && patch.status && patch.status !== before.status) {
      events.push({
        project_id: projectId,
        actor_id: ctx.user.id,
        kind: patch.status === 'done' ? 'task_completed' : 'status_change',
        weight: patch.status === 'done' ? 2 : 1,
        metadata: { task_id: id, from: before.status, to: patch.status },
      });
    }
    if (events.length) await admin.from('activity_events').insert(events);
    return json(res, 200, { task: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await admin.from('tasks').delete().eq('id', id).eq('project_id', projectId);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(res);
}
