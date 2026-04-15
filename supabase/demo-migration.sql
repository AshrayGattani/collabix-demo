-- Run this AFTER schema.sql. It relaxes a couple of FKs so demo/"virtual"
-- members can live in the database without a matching auth.users row.

-- project_members.user_id: keep the type but drop the FK to auth.users and
-- add an email column so we can identify demo members directly.
alter table public.project_members
  drop constraint if exists project_members_user_id_fkey;

alter table public.project_members
  add column if not exists email text;

-- activity_events.actor_id: same — drop FK so demo events attribute to
-- virtual users without needing an auth row.
alter table public.activity_events
  drop constraint if exists activity_events_actor_id_fkey;

-- tasks.assignee_id: drop FK so tasks can be assigned to demo members.
alter table public.tasks
  drop constraint if exists tasks_assignee_id_fkey;

-- Helper: derive a display name for a member that works whether or not
-- a profile exists (real user vs demo member).
create or replace view public.v_member_display as
  select
    pm.project_id,
    pm.user_id,
    pm.role,
    pm.joined_at,
    coalesce(pm.display_name, p.full_name, pm.email, p.email, 'Member') as display_name,
    coalesce(pm.email, p.email) as email,
    p.avatar_url
  from public.project_members pm
  left join public.profiles p on p.id = pm.user_id;

grant select on public.v_member_display to anon, authenticated;
