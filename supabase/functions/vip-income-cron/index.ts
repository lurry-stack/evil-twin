// Scheduled edge function — runs pay_daily_vip_income() at midnight.
// Configure in Supabase Dashboard > Edge Functions > Schedule (cron: 0 0 * * *)
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error: vipError } = await admin.rpc('pay_daily_vip_income');
  if (vipError) {
    return new Response(JSON.stringify({ error: vipError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: lockedError } = await admin.rpc('pay_daily_locked_income');
  if (lockedError) {
    return new Response(JSON.stringify({ error: lockedError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, message: 'Daily VIP income + locked income paid' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
