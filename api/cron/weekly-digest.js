import { cors, json } from '../_lib/http.js';
import { admin } from '../_lib/supabase.js';
import { computeSnapshot } from '../_lib/metrics.js';

// Vercel Cron hits this endpoint with Authorization: Bearer <CRON_SECRET>.
// Configure `CRON_SECRET` as an env var and reference it in vercel.json.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (secret && header !== `Bearer ${secret}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  const siteUrl =
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173');

  const { data: projects } = await admin.from('projects').select('*');
  let sent = 0;

  for (const project of projects || []) {
    const [membersRes, tasksRes, eventsRes] = await Promise.all([
      admin
        .from('project_members')
        .select('user_id, role, display_name, profile:profiles!inner(email, full_name, avatar_url)')
        .eq('project_id', project.id),
      admin.from('tasks').select('*').eq('project_id', project.id),
      admin
        .from('activity_events')
        .select('*')
        .eq('project_id', project.id)
        .gte('occurred_at', new Date(Date.now() - 28 * 86400000).toISOString()),
    ]);
    const members = (membersRes.data || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      email: m.profile?.email,
      display_name: m.display_name || m.profile?.full_name || m.profile?.email,
      avatar_url: m.profile?.avatar_url,
    }));
    if (!members.length) continue;

    const snap = computeSnapshot({
      project,
      members,
      tasks: tasksRes.data || [],
      events: eventsRes.data || [],
    });

    const subject = `Collabix weekly digest — ${project.name}`;
    const body = digestHtml(project, snap, siteUrl);

    // Supabase's inviteUserByEmail sends email but is for invites only.
    // Real digest sending should go through a transactional mailer (Resend, Postmark).
    // We log the digest row so the product has a history, and let an external
    // mailer plugin read from `digest_log` if configured. This keeps the MVP free.
    await admin.from('activity_events').insert({
      project_id: project.id,
      actor_id: members[0].user_id,
      kind: 'digest_generated',
      weight: 0,
      metadata: { subject, recipients: members.map((m) => m.email), html: body },
    });
    sent += 1;
  }

  return json(res, 200, { ok: true, digests: sent });
}

function digestHtml(project, snap, siteUrl) {
  const risk = snap.signals.deadlineRisk;
  const quiet = snap.members.filter((m) => m.signals.includes('quiet')).map((m) => m.display_name);
  const spikes = snap.members.filter((m) => m.signals.includes('late_spike')).map((m) => m.display_name);
  const overloaded = snap.members.filter((m) => m.signals.includes('overloaded')).map((m) => m.display_name);
  return `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui">
  <h2>${project.name} — weekly digest</h2>
  <p>Balance ${Math.round(snap.signals.balance * 100)}% · Consistency ${Math.round(snap.signals.consistency * 100)}% · Deadline risk: <b>${risk.level}</b></p>
  ${quiet.length ? `<p>Quiet this week: ${quiet.join(', ')}</p>` : ''}
  ${spikes.length ? `<p>Late spike: ${spikes.join(', ')}</p>` : ''}
  ${overloaded.length ? `<p>Overloaded: ${overloaded.join(', ')}</p>` : ''}
  <p><a href="${siteUrl}/p/${project.id}">Open dashboard</a></p>
  </body></html>`;
}
