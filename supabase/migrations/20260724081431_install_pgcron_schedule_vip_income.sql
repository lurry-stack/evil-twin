-- Install pg_cron extension (requires shared_preload_libraries, Supabase handles this)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule VIP income payment at midnight every day
SELECT cron.schedule(
  'pay_daily_vip_income',
  '0 0 * * *',
  $$SELECT public.pay_daily_vip_income();$$
);
