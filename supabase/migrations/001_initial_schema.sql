-- PULSE Production PostgreSQL Schema & Row-Level Security (RLS)
-- Enforces strict privacy separation (FR-02, NFR-05):
--   1. Public dancer identity (public_profiles) vs private body stats (private_biometrics)
--   2. Public score summary (session_results) vs private calories & second-by-second samples (session_private_data)
--   3. Opt-in post sharing (feed_posts) and torso-centered 2D pose silhouette highlights (result_highlights)

-- 1. Public dancer profiles (visible to crew & leaderboards)
create table if not exists public.public_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_-]{3,20}$'),
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  mode text not null default 'standing' check (mode in ('standing', 'seated')),
  created_at timestamptz not null default now()
);

-- 2. Private biometrics (strictly visible ONLY to the owning user: auth.uid() = user_id)
create table if not exists public.private_biometrics (
  user_id uuid primary key references public.public_profiles(id) on delete cascade,
  age int not null default 24 check (age between 13 and 100),
  sex text not null default 'other' check (sex in ('male', 'female', 'other')),
  weight_kg numeric not null default 70 check (weight_kg between 30 and 250),
  height_cm numeric not null default 170 check (height_cm between 100 and 230),
  resting_hr int not null default 65 check (resting_hr between 30 and 120),
  hr_max_override int null check (hr_max_override is null or (hr_max_override between 100 and 230 and hr_max_override > resting_hr)),
  updated_at timestamptz not null default now()
);

-- 3. Groups / crews
create table if not exists public.groups (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('friends', 'city', 'dance_type')),
  group_dance_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 4. Group memberships
create table if not exists public.group_members (
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.public_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 5. Session results (public summary metrics; no private calories or raw samples)
create table if not exists public.session_results (
  id text primary key,
  player_id uuid not null references public.public_profiles(id) on delete cascade,
  dance_id text not null,
  completed boolean not null,
  total_points int not null default 0 check (completed or total_points = 0),
  accuracy_pct numeric not null check (accuracy_pct >= 0 and accuracy_pct <= 100),
  level text not null check (level in ('bronze', 'silver', 'gold', 'superstar')),
  duration_sec int not null default 0,
  best_window_start_sec numeric not null default 0,
  has_heart_rate boolean not null default false,
  avg_bpm int null,
  created_at timestamptz not null default now()
);

-- 6. Session private data (calories & per-second HR/accuracy samples; strictly owner-only)
create table if not exists public.session_private_data (
  result_id text primary key references public.session_results(id) on delete cascade,
  player_id uuid not null references public.public_profiles(id) on delete cascade,
  calories_kcal numeric not null default 0,
  samples jsonb not null default '[]'::jsonb
);

-- 7. Social feed posts (opt-in shared_calories_kcal and shared_avg_bpm only when toggled on)
create table if not exists public.feed_posts (
  id text primary key,
  author_id uuid not null references public.public_profiles(id) on delete cascade,
  result_id text not null references public.session_results(id) on delete cascade,
  show_calories boolean not null default false,
  show_heart_rate boolean not null default false,
  has_clip boolean not null default false,
  shared_calories_kcal numeric null,
  shared_avg_bpm int null,
  created_at timestamptz not null default now()
);

-- 8. Post group associations
create table if not exists public.post_groups (
  post_id text not null references public.feed_posts(id) on delete cascade,
  group_id text not null references public.groups(id) on delete cascade,
  primary key (post_id, group_id)
);

-- 9. Post kudos
create table if not exists public.post_kudos (
  post_id text not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.public_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 10. Earned badges
create table if not exists public.earned_badges (
  badge_id text not null,
  player_id uuid not null references public.public_profiles(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (badge_id, player_id)
);

-- 11. Result highlights (15s torso-centered 2D pose silhouette samples, ~15 KB JSON, never raw video)
create table if not exists public.result_highlights (
  result_id text primary key references public.session_results(id) on delete cascade,
  player_id uuid not null references public.public_profiles(id) on delete cascade,
  start_sec numeric not null,
  duration_sec numeric not null,
  samples jsonb not null
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_session_results_player_created
  on public.session_results (player_id, created_at desc);

create index if not exists idx_session_results_dance_leaderboard
  on public.session_results (dance_id, completed, total_points desc);

create index if not exists idx_feed_posts_created
  on public.feed_posts (created_at desc);

create index if not exists idx_post_groups_group
  on public.post_groups (group_id);

create index if not exists idx_group_members_user
  on public.group_members (user_id);

-- ============================================================================
-- Table Privileges (GRANT to anon & authenticated; RLS enforces row access)
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on
  public.public_profiles,
  public.groups,
  public.group_members,
  public.session_results,
  public.feed_posts,
  public.post_groups,
  public.post_kudos,
  public.earned_badges,
  public.result_highlights
to anon, authenticated;

grant insert, update on
  public.public_profiles,
  public.session_results,
  public.result_highlights
to authenticated;

grant select, insert, update, delete on
  public.private_biometrics,
  public.session_private_data
to authenticated;

grant insert, delete on
  public.group_members,
  public.feed_posts,
  public.post_kudos
to authenticated;

grant insert on
  public.post_groups,
  public.earned_badges
to authenticated;

-- ============================================================================
-- Row-Level Security (RLS)
-- ============================================================================
alter table public.public_profiles enable row level security;
alter table public.private_biometrics enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.session_results enable row level security;
alter table public.session_private_data enable row level security;
alter table public.feed_posts enable row level security;
alter table public.post_groups enable row level security;
alter table public.post_kudos enable row level security;
alter table public.earned_badges enable row level security;
alter table public.result_highlights enable row level security;

-- 1. public_profiles policies
create policy "public_profiles_select_all"
  on public.public_profiles for select
  to anon, authenticated
  using (true);

create policy "public_profiles_insert_own"
  on public.public_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "public_profiles_update_own"
  on public.public_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. private_biometrics policies (strictly owner-only)
create policy "private_biometrics_select_own"
  on public.private_biometrics for select
  to authenticated
  using (auth.uid() = user_id);

create policy "private_biometrics_insert_own"
  on public.private_biometrics for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "private_biometrics_update_own"
  on public.private_biometrics for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "private_biometrics_delete_own"
  on public.private_biometrics for delete
  to authenticated
  using (auth.uid() = user_id);

-- 3. groups policies
create policy "groups_select_all"
  on public.groups for select
  to anon, authenticated
  using (true);

-- 4. group_members policies
create policy "group_members_select_all"
  on public.group_members for select
  to anon, authenticated
  using (true);

create policy "group_members_insert_own"
  on public.group_members for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "group_members_delete_own"
  on public.group_members for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. session_results policies (completed runs are public; quit-early runs visible only to owner)
create policy "session_results_select_completed_or_own"
  on public.session_results for select
  to anon, authenticated
  using (completed = true or auth.uid() = player_id);

create policy "session_results_insert_own"
  on public.session_results for insert
  to authenticated
  with check (auth.uid() = player_id);

create policy "session_results_update_own"
  on public.session_results for update
  to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

-- 6. session_private_data policies (strictly owner-only)
create policy "session_private_data_select_own"
  on public.session_private_data for select
  to authenticated
  using (auth.uid() = player_id);

create policy "session_private_data_insert_own"
  on public.session_private_data for insert
  to authenticated
  with check (auth.uid() = player_id);

create policy "session_private_data_update_own"
  on public.session_private_data for update
  to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

create policy "session_private_data_delete_own"
  on public.session_private_data for delete
  to authenticated
  using (auth.uid() = player_id);

-- 7. feed_posts policies
create policy "feed_posts_select_all"
  on public.feed_posts for select
  to anon, authenticated
  using (true);

create policy "feed_posts_insert_own"
  on public.feed_posts for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "feed_posts_delete_own"
  on public.feed_posts for delete
  to authenticated
  using (auth.uid() = author_id);

-- 8. post_groups policies
create policy "post_groups_select_all"
  on public.post_groups for select
  to anon, authenticated
  using (true);

create policy "post_groups_insert_own_post"
  on public.post_groups for insert
  to authenticated
  with check (
    exists (
      select 1 from public.feed_posts fp
      where fp.id = post_groups.post_id
        and fp.author_id = auth.uid()
    )
  );

-- 9. post_kudos policies
create policy "post_kudos_select_all"
  on public.post_kudos for select
  to anon, authenticated
  using (true);

create policy "post_kudos_insert_own"
  on public.post_kudos for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "post_kudos_delete_own"
  on public.post_kudos for delete
  to authenticated
  using (auth.uid() = user_id);

-- 10. earned_badges policies
create policy "earned_badges_select_all"
  on public.earned_badges for select
  to anon, authenticated
  using (true);

create policy "earned_badges_insert_own"
  on public.earned_badges for insert
  to authenticated
  with check (auth.uid() = player_id);

-- 11. result_highlights policies (owner OR anyone viewing a post that explicitly shared the clip)
create policy "result_highlights_select_owner_or_shared_clip"
  on public.result_highlights for select
  to anon, authenticated
  using (
    auth.uid() = player_id
    or exists (
      select 1 from public.feed_posts fp
      where fp.result_id = result_highlights.result_id
        and fp.has_clip = true
    )
  );

create policy "result_highlights_insert_own"
  on public.result_highlights for insert
  to authenticated
  with check (auth.uid() = player_id);

create policy "result_highlights_update_own"
  on public.result_highlights for update
  to authenticated
  using (auth.uid() = player_id)
  with check (auth.uid() = player_id);

-- ============================================================================
-- Realtime Publication
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feed_posts'
    ) then
      alter publication supabase_realtime add table public.feed_posts;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_kudos'
    ) then
      alter publication supabase_realtime add table public.post_kudos;
    end if;
  end if;
end $$;
