-- ============================================================
-- Kyos Matcha CRM — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PARTNERS
-- ============================================================
create table if not exists partners (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  contact_name          text,
  email                 text,
  phone                 text,
  address               text,
  status                text not null default 'prospect'
                          check (status in ('prospect','sample_sent','active','inactive')),
  price_per_kg          numeric(10,2),
  shipping_fee          numeric(10,2),
  projected_kg_month    numeric(10,2),
  reorder_frequency_days integer,
  last_order_date       date,
  next_expected_order   date,
  total_orders          integer default 0,
  total_kg              numeric(10,2) default 0,
  notes                 text,
  created_at            timestamptz default now()
);

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists orders (
  id                uuid primary key default uuid_generate_v4(),
  invoice_number    text not null unique,
  partner_id        uuid references partners(id) on delete set null,
  partner_name      text,
  date              date not null,
  line_items        jsonb default '[]'::jsonb,
  subtotal          numeric(10,2) default 0,
  total             numeric(10,2) default 0,
  status            text not null default 'unpaid'
                      check (status in ('unpaid','paid','overdue')),
  paid_at           timestamptz,
  invoice_pdf_url   text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now()
);

-- ============================================================
-- INVOICE SEQUENCE
-- ============================================================
create table if not exists invoice_sequence (
  id           serial primary key,
  last_number  integer not null default 166
);

-- Insert initial row if not exists
-- KM-166 through KM-169 already exist — next invoice will be KM-170
insert into invoice_sequence (last_number)
select 169
where not exists (select 1 from invoice_sequence);

-- ============================================================
-- ROW LEVEL SECURITY
-- Authenticated users can read and write all records
-- (shared team tool — no per-user isolation)
-- ============================================================

alter table partners enable row level security;
alter table orders enable row level security;
alter table invoice_sequence enable row level security;

-- Drop existing policies if they exist (makes this script safe to re-run)
drop policy if exists "Team can read partners" on partners;
drop policy if exists "Team can insert partners" on partners;
drop policy if exists "Team can update partners" on partners;
drop policy if exists "Team can delete partners" on partners;
drop policy if exists "Team can read orders" on orders;
drop policy if exists "Team can insert orders" on orders;
drop policy if exists "Team can update orders" on orders;
drop policy if exists "Team can delete orders" on orders;
drop policy if exists "Team can read invoice_sequence" on invoice_sequence;
drop policy if exists "Team can update invoice_sequence" on invoice_sequence;

-- Partners policies
create policy "Team can read partners"
  on partners for select
  to authenticated
  using (true);

create policy "Team can insert partners"
  on partners for insert
  to authenticated
  with check (true);

create policy "Team can update partners"
  on partners for update
  to authenticated
  using (true)
  with check (true);

create policy "Team can delete partners"
  on partners for delete
  to authenticated
  using (true);

-- Orders policies
create policy "Team can read orders"
  on orders for select
  to authenticated
  using (true);

create policy "Team can insert orders"
  on orders for insert
  to authenticated
  with check (true);

create policy "Team can update orders"
  on orders for update
  to authenticated
  using (true)
  with check (true);

create policy "Team can delete orders"
  on orders for delete
  to authenticated
  using (true);

-- Invoice sequence policies
create policy "Team can read invoice_sequence"
  on invoice_sequence for select
  to authenticated
  using (true);

create policy "Team can update invoice_sequence"
  on invoice_sequence for update
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- REALTIME
-- Enable realtime on the orders table
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists orders_partner_id_idx on orders(partner_id);
create index if not exists orders_date_idx on orders(date desc);
create index if not exists partners_status_idx on partners(status);
