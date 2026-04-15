# Collabix

Signals-first project intelligence for student teams and small squads. Multi-tenant, Google-login, invite-by-email, PDF reports, shareable public snapshots, weekly digest cron. Free to host on Vercel + Supabase.

## What you get

- **Auth**: Google OAuth + magic links (Supabase Auth). No passwords to manage.
- **Workspaces**: each user can create and belong to multiple projects.
- **Invitations**: admins invite by email; recipients get a join link. Works even if the user hasn't signed up yet.
- **Tasks**: lightweight Kanban (todo / in progress / review / done), priorities, due dates, assignees, actor-attributed activity events.
- **Signals**: quiet member, late spike, overloaded; team-level balance & consistency; deadline risk.
- **Visuals**: 21-day contribution heatmap, radar chart.
- **PDF export**: one-click download of the current report.
- **Public share links**: frozen read-only snapshots for professors/mentors, optional expiry.
- **Weekly digest cron**: every Monday 14:00 UTC a digest row is generated per project (pluggable mailer).
- **Row-level security**: Supabase RLS enforces that users only see their own projects' data.

## Quick start (local)

1. Create a Supabase project (free tier is fine).
2. In Supabase SQL editor, paste the contents of `supabase/schema.sql` and run it. Then open `supabase/demo-migration.sql` and run that too — it relaxes a few FKs so the one-click demo seeder works.
3. Supabase → Authentication → Providers → enable **Google** (add OAuth client ID + secret from Google Cloud). Also enable **Email** for magic links.
4. Supabase → Authentication → URL Configuration → add `http://localhost:5173` and your Vercel URL to "Site URL" and redirect allow list.
5. Copy env:

   ```bash
   cp .env.example .env
   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
   ```

6. Install and run:

   ```bash
   npm install
   npm run dev:all
   ```

   - Vite dev server: http://localhost:5173
   - API dev server: http://localhost:3000 (Vite proxies /api to it)

## Deploy to Vercel (free)

1. Push this repo to GitHub.
2. Import into Vercel. Framework preset: **Vite**.
3. Add the same env vars from `.env.example` under Vercel → Settings → Environment Variables. Leave `SITE_URL` blank — `VERCEL_URL` is used automatically.
4. Deploy. Vercel picks up `api/**` as serverless functions and `vercel.json` adds the weekly cron.
5. Back in Supabase, add your Vercel domain to the allowed redirect list.

## How the signals work

All signals are pure functions of tasks + `activity_events`. An event is created automatically when a task is created or marked done; admins or integrations can log other events via `POST /api/projects/:id/events`.

- **Quiet**: fewer than 2 events in the last 7 days.
- **Late spike**: ≥3 events in the last 7 days AND more than 2× the prior 21-day window AND prior window ≥ 1.
- **Overloaded**: >5 open tasks assigned OR ≥2 urgent open tasks.
- **Balance**: Shannon entropy of per-member activity shares, normalized to [0,1].
- **Consistency**: 1 − (coefficient of variation of daily activity over 14 days).
- **Deadline risk**: combines days left with open-task ratio → low / medium / high / critical.

## File layout

```
api/
  _lib/{http,auth,supabase,metrics}.js     shared server helpers
  me.js                                    current user profile
  projects/index.js                        list / create
  projects/[projectId]/
    index.js                               overview snapshot, patch, delete
    tasks/{index,[id]}.js                  CRUD
    invite.js                              list / create invitations
    members.js                             list / update / remove
    share.js                               list / create public snapshots
    events.js                              log a custom activity event
  invitations/[token].js                   accept invite
  public/reports/[slug].js                 anonymous report read
  cron/weekly-digest.js                    Vercel cron target
src/
  App.jsx, main.jsx, supabase.js, styles.css
  hooks/useAuth.js
  pages/{Login,Projects,Dashboard,AcceptInvite,PublicReport}.jsx
  components/{SnapshotView,TaskPanel,MemberPicker,InviteModal,ShareModal,pdfExport}.js(x)
server/local.js                            Express router that mirrors Vercel routing
supabase/schema.sql                        tables, RLS, triggers
vercel.json                                rewrites + cron config
```

## Scripts

- `npm run dev` — Vite only
- `npm run dev:api` — API only
- `npm run dev:all` — both concurrently
- `npm run build` — production build
- `npm run preview` — preview the production build

## Security notes

- The service-role key is **only** used server-side in `api/_lib/supabase.js`. Never expose it to the browser.
- All API routes require a Supabase access token via `Authorization: Bearer`. Project membership is checked on every request.
- RLS policies in `schema.sql` are defense in depth — even if a key leaks, users cannot read other projects' data.
- Public snapshots store a JSON copy taken at share time and never re-read live data, so revoking a member doesn't retroactively change a shared report.

## Future hooks

- Swap the digest "log-only" path for a real mailer (Resend, Postmark) by reading the latest `digest_generated` event and sending `metadata.html`.
- Add GitHub integration: webhook → `POST /api/projects/:id/events` with `kind: 'commit'`.
- Add a Slack slash-command that reports today's signals.
