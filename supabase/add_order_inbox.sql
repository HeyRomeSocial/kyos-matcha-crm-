create table if not exists order_inbox (
  id uuid primary key default gen_random_uuid(),
  email_id text unique not null,
  received_at timestamptz,
  from_email text,
  from_name text,
  subject text,
  raw_body text,
  parsed_partner text,
  parsed_product text,
  parsed_quantity_kg numeric,
  parsed_notes text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz default now()
);

alter table order_inbox enable row level security;
create policy "Authenticated users can manage order_inbox"
  on order_inbox for all using (auth.role() = 'authenticated');

create table if not exists gmail_tokens (
  id int primary key default 1,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);

alter table gmail_tokens enable row level security;
create policy "Authenticated users can manage gmail_tokens"
  on gmail_tokens for all using (auth.role() = 'authenticated');
