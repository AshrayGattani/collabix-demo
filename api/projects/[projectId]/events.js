import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectMember } from '../../_lib/auth.js';

// Log a free-form activity event. Useful for "I worked on X" self-reports
// or webhook ingestion. Always attributes to the authenticated user.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;
  const ctx = await requireProjectMember(req, res, projectId);
  if (!ctx) return;

  if (req.method !== 'POST') return methodNotAllowed(res);
  const body = await readJson(req);
  const kind = (body.kind || 'comment').toString();
  const weight = Number(body.weight || 1);
  const { data, error } = await admin
    .from('activity_events')
    .insert({
      project_id: projectId,
      actor_id: ctx.user.id,
      kind,
      weight,
      metadata: body.metadata || {},
    })
    .select()
    .single();
  if (error) return json(res, 500, { error: error.message });
  return json(res, 201, { event: data });
}
