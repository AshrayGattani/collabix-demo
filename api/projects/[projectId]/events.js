import { randomUUID } from 'node:crypto';
import { cors, json, readJson, methodNotAllowed } from '../../_lib/http.js';
import { admin } from '../../_lib/supabase.js';
import { requireProjectMember, requireProjectAdmin } from '../../_lib/auth.js';

// Combined router (saves a Vercel serverless slot):
//   POST /api/projects/:pid/events              -> log a free-form activity event
//   POST /api/projects/:pid/events?action=seed  -> seed demo data (admin only)
//   (we also rewrite /api/projects/:pid/seed-demo -> here via vercel.json)
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res);

  const projectId = req.query?.projectId || req.params?.projectId;
  const action = (req.query?.action || '').toString();

  // Seed-demo is admin-gated and has its own body contract.
  const urlPath = (req.url || '').split('?')[0];
  const isSeed = action === 'seed' || action === 'seed-demo' || urlPath.endsWith('/seed-demo');
  if (isSeed) return seedDemo(req, res, projectId);

  return logEvent(req, res, projectId);
}

async function logEvent(req, res, projectId) {
  const ctx = await requireProjectMember(req, res, projectId);
  if (!ctx) return;
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

async function seedDemo(req, res, projectId) {
  const ctx = await requireProjectAdmin(req, res, projectId);
  if (!ctx) return;
  const body = await readJson(req);
  const reset = body.reset || req.query?.reset === '1';

  if (reset) {
    const { data: prev } = await admin
      .from('project_members')
      .select('user_id, email')
      .eq('project_id', projectId)
      .neq('user_id', ctx.user.id);
    const demoIds = (prev || []).filter((m) => (m.email || '').startsWith('demo-')).map((m) => m.user_id);
    if (demoIds.length) {
      await admin.from('activity_events').delete().in('actor_id', demoIds).eq('project_id', projectId);
      await admin.from('tasks').delete().in('assignee_id', demoIds).eq('project_id', projectId);
      await admin.from('project_members').delete().in('user_id', demoIds).eq('project_id', projectId);
    }
  }

  const demoMembers = [
    { name: 'Alex Chen',     email: demoEmail('alex'),   profile: 'quiet',      role: 'member' },
    { name: 'Maya Patel',    email: demoEmail('maya'),   profile: 'late_spike', role: 'member' },
    { name: 'Jordan Rivera', email: demoEmail('jordan'), profile: 'steady',     role: 'admin'  },
    { name: 'Sam Kim',       email: demoEmail('sam'),    profile: 'overloaded', role: 'member' },
    { name: 'Priya Raman',   email: demoEmail('priya'),  profile: 'rising',     role: 'member' },
  ].map((m) => ({ ...m, user_id: randomUUID() }));

  const memberRows = demoMembers.map((m) => ({
    project_id: projectId,
    user_id: m.user_id,
    role: m.role,
    display_name: m.name,
    email: m.email,
  }));
  const { error: memErr } = await admin.from('project_members').insert(memberRows);
  if (memErr) return json(res, 500, { step: 'project_members', error: memErr.message });

  const allMembers = [
    { user_id: ctx.user.id, name: 'You', profile: 'steady' },
    ...demoMembers.map((m) => ({ user_id: m.user_id, name: m.name, profile: m.profile })),
  ];

  const taskSpec = [
    { title: 'Draft system proposal introduction', status: 'done',        priority: 'medium', assignTo: 'Alex Chen' },
    { title: 'Wireframe main dashboard flow',      status: 'done',        priority: 'high',   assignTo: 'Maya Patel' },
    { title: 'Set up Supabase schema + RLS',       status: 'in_progress', priority: 'high',   assignTo: 'Jordan Rivera' },
    { title: 'Design radar chart palette',         status: 'in_progress', priority: 'medium', assignTo: 'Priya Raman' },
    { title: 'Write test plan for signals engine', status: 'review',      priority: 'medium', assignTo: 'Maya Patel' },
    { title: 'Prepare sprint 3 demo slides',       status: 'todo',        priority: 'urgent', assignTo: 'Sam Kim' },
    { title: 'Collect user feedback from pilot',   status: 'todo',        priority: 'high',   assignTo: 'Sam Kim' },
    { title: 'Polish landing page hero copy',      status: 'todo',        priority: 'low',    assignTo: 'Priya Raman' },
    { title: 'Fix flaky auth redirect bug',        status: 'todo',        priority: 'urgent', assignTo: 'Sam Kim' },
    { title: 'Document public share API',          status: 'review',      priority: 'low',    assignTo: 'Jordan Rivera' },
  ];
  const nameToId = Object.fromEntries(demoMembers.map((m) => [m.name, m.user_id]));
  const taskRows = taskSpec.map((t, i) => ({
    project_id: projectId,
    title: t.title,
    status: t.status,
    priority: t.priority,
    assignee_id: nameToId[t.assignTo] || null,
    created_by: ctx.user.id,
    due_date: new Date(Date.now() + (i + 2) * 2 * 86400000).toISOString().slice(0, 10),
  }));
  const { error: taskErr } = await admin.from('tasks').insert(taskRows);
  if (taskErr) return json(res, 500, { step: 'tasks', error: taskErr.message });

  const DAY = 86400000;
  const now = Date.now();
  const events = [];
  function push(userId, daysAgo, weight = 1, kind = 'commit') {
    const t = now - daysAgo * DAY - Math.floor(Math.random() * DAY);
    events.push({
      project_id: projectId,
      actor_id: userId,
      kind,
      weight,
      metadata: { seeded: true },
      occurred_at: new Date(t).toISOString(),
    });
  }

  for (const m of allMembers) {
    switch (m.profile) {
      case 'quiet':
        for (let d = 10; d < 21; d++) for (let k = 0; k < rand(1, 3); k++) push(m.user_id, d, 1);
        break;
      case 'late_spike':
        for (let d = 10; d < 21; d++) if (Math.random() < 0.3) push(m.user_id, d, 1);
        for (let d = 0; d < 5; d++) for (let k = 0; k < rand(2, 5); k++) push(m.user_id, d, 1);
        break;
      case 'overloaded':
        for (let d = 0; d < 21; d++) for (let k = 0; k < rand(2, 4); k++) push(m.user_id, d, 1);
        break;
      case 'rising':
        for (let d = 20; d >= 0; d--) {
          const intensity = Math.max(0, Math.round((21 - d) / 5));
          for (let k = 0; k < intensity; k++) push(m.user_id, d, 1);
        }
        break;
      default:
        for (let d = 0; d < 21; d++) if (Math.random() < 0.7) push(m.user_id, d, 1);
    }
  }
  if (events.length) {
    const { error: evErr } = await admin.from('activity_events').insert(events);
    if (evErr) return json(res, 500, { step: 'activity_events', error: evErr.message });
  }

  return json(res, 201, {
    ok: true,
    created: demoMembers.map((m) => ({ name: m.name, email: m.email, profile: m.profile })),
    tasks: taskRows.length,
    events: events.length,
  });
}

function demoEmail(base) { return `demo-${base}-${Math.random().toString(36).slice(2, 6)}@collabix.dev`; }
function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
