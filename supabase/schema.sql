-- ═══════════════════════════════════════════════════════════════
-- Trace — notes table
-- Run this once in the SQL editor of your self-hosted Supabase
-- (https://supabase.ry-server.com → SQL Editor → paste → Run).
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.notes (
  id          text primary key,
  body        text        not null default '',
  title       text,
  tags        jsonb       not null default '[]'::jsonb,
  starred     boolean     not null default false,
  archived    boolean     not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  device      text,
  ai          jsonb
);

create index if not exists notes_updated_idx on public.notes (updated_at desc);
create index if not exists notes_created_idx on public.notes (created_at desc);
create index if not exists notes_tags_idx    on public.notes using gin (tags);

-- Full-text search index (optional, for future server-side search)
create index if not exists notes_fts_idx on public.notes
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')));

-- ── Row Level Security ────────────────────────────────────────
-- This is a single-user vault reached with the anon key from the
-- browser, so the anon role needs full access to this one table.
-- Nothing else in the database is exposed by these policies.
--
-- If you later add Supabase Auth, replace the `true` checks with
--   auth.uid() = user_id
-- and add a `user_id uuid` column.

alter table public.notes enable row level security;

drop policy if exists "trace anon read"   on public.notes;
drop policy if exists "trace anon insert" on public.notes;
drop policy if exists "trace anon update" on public.notes;
drop policy if exists "trace anon delete" on public.notes;

create policy "trace anon read"   on public.notes for select using (true);
create policy "trace anon insert" on public.notes for insert with check (true);
create policy "trace anon update" on public.notes for update using (true) with check (true);
create policy "trace anon delete" on public.notes for delete using (true);

grant usage on schema public to anon, authenticated;
grant all on public.notes to anon, authenticated;
