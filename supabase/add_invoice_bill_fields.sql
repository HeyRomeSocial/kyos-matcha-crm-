-- Add bill-to fields to orders table for editable invoice details
alter table orders add column if not exists bill_address text;
alter table orders add column if not exists bill_contact text;
alter table orders add column if not exists bill_email text;
