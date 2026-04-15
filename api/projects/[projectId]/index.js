import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectMember, requireProjectAdmin } from '../../_lib/auth.js';
import { computeSnapshot } from '../../_lib/metrics.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;
  if (!projectId) return json(res, 400, { error: 'project_id_required' });

  if (req.method === 'GET') {
    const ctx = await requireProjectMember(req, res, projectId);
    if (!ctx) return;
    const [projectRes, membersRes, tasksRes, eventsRes] = await Promise.all([
      admin.from('projects').select('*').eq('id', projectId).single(),
      admin
        .from('project_members')
        .select('user_id, role, display_name, email, joined_at')
        .eq('project_id', projectId),
      admin.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      admin
        .from('activity_events')
        .select('*')
        .eq('project_id', projectId)
        .gte('occurred_at', new Date(Date.now() - 60 * 86400000).toISOString())
        .order('occurred_at', { ascending: false })
        .limit(5000),
    ]);
    if (projectRes.error) return json(res, 404, { error: 'project_not_found' });
    const project = projectRes.data;
    const rawMembers = membersRes.data || [];
    const realUserIds = rawMembers.map((m) => m.user_id);
    let profileMap = {};
    if (realUserIds.length) {
      const { data: profs } = await admin
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', realUserIds);
      profileMap = Object.fromEntries((profs || []).map((p) => [p.id, p]));
    }
    const members = rawMembers.map((m) => {
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
    const thresholds = {};
    for (const k of ['quietWindowDays','quietMaxEvents','spikeRecentDays','spikePriorDays','spikeRecentMin','spikeRatio','overloadOpenTasks','overloadUrgentTasks']) {
      if (req.query?.[k] != null) thresholds[k] = Number(req.query[k]);
    }
    const snapshot = computeSnapshot({
      project,
      members,
      tasks: tasksRes.data || [],
      events: eventsRes.data || [],
      thresholds,
    });
    return json(res, 200, snapshot);
  }

  if (req.method === 'PATCH') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const body = await readJson(req);
    const patch = {};
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.description === 'string') patch.description = body.description;
    if ('deadline' in body) patch.deadline = body.deadline || null;
    const { data, error } = await admin.from('projects').update(patch).eq('id', projectId).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { project: data });
  }

  if (req.method === 'DELETE') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const { data: proj } = await admin.from('projects').select('owner_id').eq('id', projectId).single();
    if (!proj || proj.owner_id !== ctx.user.id) return json(res, 403, { error: 'only_owner_can_delete' });
    const { error } = await admin.from('projects').delete().eq('id', projectId);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(res);
}
