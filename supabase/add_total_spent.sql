-- Add total_spent column to partners
alter table partners add column if not exists total_spent numeric(10,2) default 0;

-- Populate total_spent from existing data:
-- (total_kg * price_per_kg) + (total_orders * shipping_fee)
-- This gives an accurate estimate based on imported historical data
update partners
set total_spent =
  coalesce(total_kg, 0) * coalesce(price_per_kg, 0)
  + coalesce(total_orders, 0) * coalesce(shipping_fee, 0)
where total_kg is not null and total_kg > 0;
