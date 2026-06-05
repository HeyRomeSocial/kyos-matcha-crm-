-- Fix RLS policies for orders, partners, and invoice_sequence
-- Run this in Supabase SQL Editor if you get RLS errors

-- Drop and recreate all policies cleanly
drop policy if exists "Team can read orders" on orders;
drop policy if exists "Team can insert orders" on orders;
drop policy if exists "Team can update orders" on orders;
drop policy if exists "Team can delete orders" on orders;

drop policy if exists "Team can read partners" on partners;
drop policy if exists "Team can insert partners" on partners;
drop policy if exists "Team can update partners" on partners;
drop policy if exists "Team can delete partners" on partners;

drop policy if exists "Team can read invoice_sequence" on invoice_sequence;
drop policy if exists "Team can update invoice_sequence" on invoice_sequence;

-- Re-enable RLS (in case it was disabled)
alter table orders enable row level security;
alter table partners enable row level security;
alter table invoice_sequence enable row level security;

-- Orders
create policy "Team can read orders" on orders for select to authenticated using (true);
create policy "Team can insert orders" on orders for insert to authenticated with check (true);
create policy "Team can update orders" on orders for update to authenticated using (true) with check (true);
create policy "Team can delete orders" on orders for delete to authenticated using (true);

-- Partners
create policy "Team can read partners" on partners for select to authenticated using (true);
create policy "Team can insert partners" on partners for insert to authenticated with check (true);
create policy "Team can update partners" on partners for update to authenticated using (true) with check (true);
create policy "Team can delete partners" on partners for delete to authenticated using (true);

-- Invoice sequence
create policy "Team can read invoice_sequence" on invoice_sequence for select to authenticated using (true);
create policy "Team can update invoice_sequence" on invoice_sequence for update to authenticated using (true) with check (true);

-- Storage bucket policies for invoice PDF uploads
-- (allows authenticated users to upload/read from the invoices bucket)
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;

drop policy if exists "Team can upload invoices" on storage.objects;
drop policy if exists "Team can read invoices" on storage.objects;

create policy "Team can upload invoices"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'invoices');

create policy "Team can read invoices"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices');

create policy "Team can update invoices"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'invoices');
