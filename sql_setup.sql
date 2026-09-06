-- ============================================================================
-- Flësh  ·  Supabase setup (run this in the Supabase SQL editor, once)
--
-- IMPORTANT:
--   * This ONLY creates ONE table (`flesh_state`) plus RLS policies scoped to
--     `flesh_*`. It never touches, reads, or drops any of your other tables,
--     so your other app's data is completely untouched.
--   * Row Level Security is enabled on `flesh_state`, so each signed-in user
--     can ONLY see/edit their OWN single row (their auth.uid()).
--   * The anon/publishable key (the one in the frontend) cannot read or write
--     any row it doesn't own.
--   * ALWAYS use the anon key in the browser. NEVER put the `service_role` key
--     in client code.
-- ============================================================================

-- ---------------------------------------------------------------
-- 1) Turn on Row Level Security for the schema we touch (safe default).
-- ---------------------------------------------------------------
alter role anon set statement_timeout = '15s';
alter role authenticated set statement_timeout = '8s';

-- ---------------------------------------------------------------
-- 2) One table: the whole app state for a user is ONE jsonb payload row.
--    (decks + per-deck JSON + grading/progress + resume + settings)
-- ---------------------------------------------------------------
create table if not exists public.flesh_state (
  owner      uuid primary key references auth.users (id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every write (for optional client conflict checks).
create or replace function public.flesh_touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists flesh_state_touch on public.flesh_state;
create trigger flesh_state_touch
  before insert or update on public.flesh_state
  for each row execute function public.flesh_touch_updated();

-- ---------------------------------------------------------------
-- 3) Enable RLS (idempotent) — only the owner may access their row.
-- ---------------------------------------------------------------
alter table public.flesh_state enable row level security;

drop policy if exists "flesh_state_select_own" on public.flesh_state;
create policy "flesh_state_select_own"
  on public.flesh_state for select
  using (auth.uid() = owner);

drop policy if exists "flesh_state_insert_own" on public.flesh_state;
create policy "flesh_state_insert_own"
  on public.flesh_state for insert
  with check (auth.uid() = owner);

drop policy if exists "flesh_state_update_own" on public.flesh_state;
create policy "flesh_state_update_own"
  on public.flesh_state for update
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

drop policy if exists "flesh_state_delete_own" on public.flesh_state;
create policy "flesh_state_delete_own"
  on public.flesh_state for delete
  using (auth.uid() = owner);

-- ---------------------------------------------------------------
-- 4) OPTIONAL cleanup: run this when a user is deleted if you want to
--    remove their row (auth.users deletion normally cascades because of the
--    FK above, but this guards the table anyway).
-- ---------------------------------------------------------------
-- delete from public.flesh_state where owner not in (select id from auth.users);

-- ============================================================================
-- DONE.  You should now see `flesh_state` under the "public" schema.
-- Verify:  Security -> Policies  → 4 policies exist, RLS = ON.
-- ============================================================================
