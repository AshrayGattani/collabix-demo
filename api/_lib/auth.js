import { admin, userClient, getAccessToken } from './supabase.js';
import { json } from './http.js';

export async function getUser(req) {
  const token = getAccessToken(req);
  if (!token || !admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return { user: data.user, token };
}

export async function requireUser(req, res) {
  const ctx = await getUser(req);
  if (!ctx) { json(res, 401, { error: 'unauthorized' }); return null; }
  return ctx;
}

export async function requireProjectMember(req, res, projectId) {
  const ctx = await requireUser(req, res);
  if (!ctx) return null;
  const { data, error } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  if (error || !data) { json(res, 403, { error: 'forbidden' }); return null; }
  return { ...ctx, role: data.role };
}

export async function requireProjectAdmin(req, res, projectId) {
  const ctx = await requireProjectMember(req, res, projectId);
  if (!ctx) return null;
  if (!['owner', 'admin'].includes(ctx.role)) {
    json(res, 403, { error: 'forbidden' });
    return null;
  }
  return ctx;
}
