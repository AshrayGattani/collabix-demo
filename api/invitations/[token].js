import { cors, json, methodNotAllowed } from '../_lib/http.js';
import { admin } from '../_lib/supabase.js';
import { requireUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const token = req.query?.token || req.params?.token;
  if (!token) return json(res, 400, { error: 'token_required' });

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('invitations')
      .select('id, project_id, email, role, expires_at, accepted_at, project:projects(name, description)')
      .eq('token', token)
      .maybeSingle();
    if (error || !data) return json(res, 404, { error: 'invite_not_found' });
    return json(res, 200, { invitation: data });
  }

  if (req.method === 'POST') {
    const ctx = await requireUser(req, res);
    if (!ctx) return;
    const { data: invite } = await admin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (!invite) return json(res, 404, { error: 'invite_not_found' });
    if (invite.accepted_at) return json(res, 400, { error: 'already_accepted' });
    if (new Date(invite.expires_at).getTime() < Date.now())
      return json(res, 400, { error: 'invite_expired' });
    const userEmail = (ctx.user.email || '').toLowerCase();
    if (invite.email.toLowerCase() !== userEmail) {
      return json(res, 403, {
        error: 'email_mismatch',
        message: `This invite is for ${invite.email}. You are signed in as ${userEmail}.`,
      });
    }

    const { error: memErr } = await admin
      .from('project_members')
      .insert({ project_id: invite.project_id, user_id: ctx.user.id, role: invite.role })
      .select();
    // ignore unique-constraint errors (already a member)
    if (memErr && !String(memErr.message).includes('duplicate')) {
      return json(res, 500, { error: memErr.message });
    }
    await admin.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
    return json(res, 200, { project_id: invite.project_id });
  }

  return methodNotAllowed(res);
}
