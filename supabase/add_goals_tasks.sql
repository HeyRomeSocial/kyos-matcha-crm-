-- Goals table
create table if not exists goals (
  id            uuid primary key default uuid_generate_v4(),
  month         date not null, -- first day of the month e.g. 2026-06-01
  target_revenue numeric(10,2) default 0,
  target_kg      numeric(10,2) default 0,
  target_new_cafes integer default 0,
  created_at    timestamptz default now()
);

alter table goals enable row level security;
drop policy if exists "Team can read goals" on goals;
drop policy if exists "Team can insert goals" on goals;
drop policy if exists "Team can update goals" on goals;
drop policy if exists "Team can delete goals" on goals;
create policy "Team can read goals" on goals for select to authenticated using (true);
create policy "Team can insert goals" on goals for insert to authenticated with check (true);
create policy "Team can update goals" on goals for update to authenticated using (true) with check (true);
create policy "Team can delete goals" on goals for delete to authenticated using (true);

-- Tasks table
create table if not exists tasks (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  due_date    date,
  assigned_to text,
  partner_id  uuid references partners(id) on delete set null,
  partner_name text,
  priority    text default 'medium' check (priority in ('high','medium','low')),
  status      text default 'todo' check (status in ('todo','in_progress','done')),
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table tasks enable row level security;
drop policy if exists "Team can read tasks" on tasks;
drop policy if exists "Team can insert tasks" on tasks;
drop policy if exists "Team can update tasks" on tasks;
drop policy if exists "Team can delete tasks" on tasks;
create policy "Team can read tasks" on tasks for select to authenticated using (true);
create policy "Team can insert tasks" on tasks for insert to authenticated with check (true);
create policy "Team can update tasks" on tasks for update to authenticated using (true) with check (true);
create policy "Team can delete tasks" on tasks for delete to authenticated using (true);

-- Realtime on tasks
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;
