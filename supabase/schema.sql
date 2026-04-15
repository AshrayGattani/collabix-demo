-- Collabix multi-tenant schema
-- Run this in the Supabase SQL editor after creating your project.
-- Requires the "pgcrypto" extension for gen_random_uuid().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row, holds display info
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects: a workspace owned by one user
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  deadline date,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);

-- ---------------------------------------------------------------------------
-- project_members: membership + role
-- ---------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members(user_id);

-- Helper: is the current user a member of this project?
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- invitations: email -> project, with token for click-to-join
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'member' check (role in ('admin','member')),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_project_idx on public.invitations(project_id);
create index if not exists invitations_email_idx on public.invitations(lower(email));

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);

-- ---------------------------------------------------------------------------
-- activity_events: actor-based signal feed
-- kind: commit | task_completed | task_created | comment | review | status_change
-- ---------------------------------------------------------------------------
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  weight numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists activity_events_project_idx on public.activity_events(project_id, occurred_at desc);
create index if not exists activity_events_actor_idx on public.activity_events(actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- shared_reports: public snapshot of a project report
-- ---------------------------------------------------------------------------
create table if not exists public.shared_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null unique,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shared_reports_project_idx on public.shared_reports(project_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_events enable row level security;
alter table public.shared_reports enable row level security;

-- profiles: readable by anyone authenticated (so we can show team member names)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- projects: visible to members; anyone can insert (becomes owner via trigger/app logic)
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select using (public.is_project_member(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (owner_id = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (public.is_project_admin(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete using (owner_id = auth.uid());

-- project_members: members can see their project's roster; admins can manage
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select using (public.is_project_member(project_id));

drop policy if exists project_members_insert_self on public.project_members;
create policy project_members_insert_self on public.project_members
  for insert with check (user_id = auth.uid());

drop policy if exists project_members_admin_manage on public.project_members;
create policy project_members_admin_manage on public.project_members
  for all using (public.is_project_admin(project_id));

-- invitations: admins can read/write their project invitations
drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations
  for all using (public.is_project_admin(project_id));

-- tasks: members read/write
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.is_project_member(project_id));

drop policy if exists tasks_modify on public.tasks;
create policy tasks_modify on public.tasks
  for all using (public.is_project_member(project_id));

-- activity_events: members read; actor can insert own events
drop policy if exists activity_select on public.activity_events;
create policy activity_select on public.activity_events
  for select using (public.is_project_member(project_id));

drop policy if exists activity_insert on public.activity_events;
create policy activity_insert on public.activity_events
  for insert with check (
    actor_id = auth.uid() and public.is_project_member(project_id)
  );

-- shared_reports: admins can create; public reads happen via service role
drop policy if exists shared_reports_admin on public.shared_reports;
create policy shared_reports_admin on public.shared_reports
  for all using (public.is_project_admin(project_id));

-- ---------------------------------------------------------------------------
-- Seed trigger: make project creator an owner member automatically
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- Touch updated_at on tasks
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_updated_at();
