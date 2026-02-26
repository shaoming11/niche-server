-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule the edge function every 2 minutes
select cron.schedule(
  'process-ai-queue',                          -- job name (unique)
  '*/2 * * * *',                               -- every 2 minutes
  $$
  select net.http_post(
    url    := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/process-ai-queue',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body   := '{}'::jsonb
  );
  $$
);
