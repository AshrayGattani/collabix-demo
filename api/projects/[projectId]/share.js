import { randomBytes } from 'node:crypto';
import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectAdmin, requireProjectMember } from '../../_lib/auth.js';
import { computeSnapshot } from '../../_lib/metrics.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;

  if (req.method === 'GET') {
    const ctx = await requireProjectMember(req, res, projectId);
    if (!ctx) return;
    const { data } = await admin
      .from('shared_reports')
      .select('id, slug, created_at, expires_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    return json(res, 200, { reports: data || [] });
  }

  if (req.method === 'POST') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const body = await readJson(req);
    const slug = randomBytes(8).toString('base64url');

    const [projectRes, membersRes, tasksRes, eventsRes] = await Promise.all([
      admin.from('projects').select('*').eq('id', projectId).single(),
      admin
        .from('project_members')
        .select('user_id, role, display_name, joined_at, profile:profiles!inner(email, full_name, avatar_url)')
        .eq('project_id', projectId),
      admin.from('tasks').select('*').eq('project_id', projectId),
      admin
        .from('activity_events')
        .select('*')
        .eq('project_id', projectId)
        .gte('occurred_at', new Date(Date.now() - 60 * 86400000).toISOString()),
    ]);

    const members = (membersRes.data || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      email: m.profile?.email,
      display_name: m.display_name || m.profile?.full_name || m.profile?.email,
      avatar_url: m.profile?.avatar_url,
    }));
    const snapshot = computeSnapshot({
      project: projectRes.data,
      members,
      tasks: tasksRes.data || [],
      events: eventsRes.data || [],
    });

    const expires_at = body.expires_in_days
      ? new Date(Date.now() + Number(body.expires_in_days) * 86400000).toISOString()
      : null;
    const { data, error } = await admin
      .from('shared_reports')
      .insert({
        project_id: projectId,
        slug,
        snapshot,
        created_by: ctx.user.id,
        expires_at,
      })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, { report: data, slug });
  }

  return methodNotAllowed(res);
}
