-- Add Google Drive webhook URL to settings
alter table settings add column if not exists drive_webhook_url text;
