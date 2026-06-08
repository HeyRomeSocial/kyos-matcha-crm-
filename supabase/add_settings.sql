create table if not exists settings (
  id            serial primary key,
  from_name     text default 'Kyos Matcha',
  from_line1    text default '30 Seagull Lane',
  from_line2    text default 'E16 1PY, London',
  bank_name     text default 'KM WELNESS LTD',
  bank_sort     text default '04-00-05',
  bank_account  text default '86383529',
  updated_at    timestamptz default now()
);

-- Insert default row
insert into settings (id) values (1) on conflict (id) do nothing;

alter table settings enable row level security;
drop policy if exists "Team can read settings" on settings;
drop policy if exists "Team can update settings" on settings;
create policy "Team can read settings" on settings for select to authenticated using (true);
create policy "Team can update settings" on settings for update to authenticated using (true) with check (true);
