-- Campaigns table
create table if not exists campaigns (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  type        text default 'email' check (type in ('email','social','event','promotion','other')),
  status      text default 'draft' check (status in ('draft','active','paused','completed')),
  start_date  date,
  end_date    date,
  target      text, -- e.g. "All active cafes", "London cafes"
  description text,
  notes       text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

alter table campaigns enable row level security;
drop policy if exists "Team can read campaigns" on campaigns;
drop policy if exists "Team can insert campaigns" on campaigns;
drop policy if exists "Team can update campaigns" on campaigns;
drop policy if exists "Team can delete campaigns" on campaigns;
create policy "Team can read campaigns" on campaigns for select to authenticated using (true);
create policy "Team can insert campaigns" on campaigns for insert to authenticated with check (true);
create policy "Team can update campaigns" on campaigns for update to authenticated using (true) with check (true);
create policy "Team can delete campaigns" on campaigns for delete to authenticated using (true);

-- Outreach table
create table if not exists outreach (
  id            uuid primary key default uuid_generate_v4(),
  business_name text not null,
  contact_name  text,
  email         text,
  phone         text,
  location      text,
  instagram     text,
  status        text default 'to_contact' check (status in ('to_contact','contacted','responded','meeting_booked','sample_sent','converted','not_interested')),
  channel       text default 'email' check (channel in ('email','instagram','phone','referral','event','other')),
  follow_up_date date,
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

alter table outreach enable row level security;
drop policy if exists "Team can read outreach" on outreach;
drop policy if exists "Team can insert outreach" on outreach;
drop policy if exists "Team can update outreach" on outreach;
drop policy if exists "Team can delete outreach" on outreach;
create policy "Team can read outreach" on outreach for select to authenticated using (true);
create policy "Team can insert outreach" on outreach for insert to authenticated with check (true);
create policy "Team can update outreach" on outreach for update to authenticated using (true) with check (true);
create policy "Team can delete outreach" on outreach for delete to authenticated using (true);

-- Storage bucket for brand assets
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "Team can upload brand assets" on storage.objects;
drop policy if exists "Team can read brand assets" on storage.objects;
drop policy if exists "Team can delete brand assets" on storage.objects;

create policy "Team can upload brand assets" on storage.objects for insert to authenticated with check (bucket_id = 'brand-assets');
create policy "Team can read brand assets" on storage.objects for select to authenticated using (bucket_id = 'brand-assets');
create policy "Team can delete brand assets" on storage.objects for delete to authenticated using (bucket_id = 'brand-assets');
