import { randomBytes } from 'node:crypto';
import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectAdmin } from '../../_lib/auth.js';

function makeToken() {
  return randomBytes(24).toString('base64url');
}

function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const projectId = req.query?.projectId || req.params?.projectId;

  if (req.method === 'GET') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const { data } = await admin
      .from('invitations')
      .select('*')
      .eq('project_id', projectId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });
    return json(res, 200, { invitations: data || [] });
  }

  if (req.method === 'POST') {
    const ctx = await requireProjectAdmin(req, res, projectId);
    if (!ctx) return;
    const body = await readJson(req);
    const emails = Array.isArray(body.emails) ? body.emails : body.email ? [body.email] : [];
    const role = body.role === 'admin' ? 'admin' : 'member';
    // Demo/provisioning mode: if a password is supplied, we create the auth user
    // directly with that password (auto-confirmed) and add them as a project member,
    // skipping the email flow entirely. Great for live demos and rate-limited free tier.
    const provisionPassword = typeof body.password === 'string' && body.password.length >= 6
      ? body.password
      : null;
    const sendEmail = body.sendEmail !== false && !provisionPassword;

    if (!emails.length) return json(res, 400, { error: 'email_required' });

    const { data: project } = await admin.from('projects').select('name').eq('id', projectId).single();

    const created = [];
    const provisioned = [];
    for (const raw of emails) {
      const email = String(raw || '').trim().toLowerCase();
      if (!email) continue;

      // Path A: instant provision with password (no email sent)
      if (provisionPassword) {
        // Find or create the auth user
        let userId = null;
        const { data: existing } = await admin.auth.admin.listUsers();
        const match = existing?.users?.find((u) => (u.email || '').toLowerCase() === email);
        if (match) {
          userId = match.id;
          // Update password so the admin knows the exact credentials
          await admin.auth.admin.updateUserById(match.id, { password: provisionPassword, email_confirm: true });
        } else {
          const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
            email,
            password: provisionPassword,
            email_confirm: true,
          });
          if (createErr) continue;
          userId = createRes.user.id;
        }
        // Add as project member directly
        await admin
          .from('project_members')
          .upsert({ project_id: projectId, user_id: userId, role })
          .select();
        provisioned.push({ email, password: provisionPassword, role });
        continue;
      }

      // Path B: email-based invite with a token link
      const token = makeToken();
      const { data, error } = await admin
        .from('invitations')
        .insert({
          project_id: projectId,
          email,
          token,
          role,
          invited_by: ctx.user.id,
        })
        .select()
        .single();
      if (error) continue;
      created.push(data);

      if (sendEmail) {
        const redirectTo = `${siteUrl()}/#/invite/${token}`;
        try {
          await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo,
            data: { project_name: project?.name, invite_token: token },
          });
        } catch (e) {
          // Rate-limited, user already exists, or SMTP not configured.
          // That's fine — the token link in `created` is still valid and the admin
          // can copy/paste it from the UI.
        }
      }
    }
    return json(res, 201, { invitations: created, provisioned });
  }

  return methodNotAllowed(res);
}
