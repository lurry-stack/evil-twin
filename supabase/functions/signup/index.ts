// signup edge function — creates auth user + profile via service role key,
// bypassing Supabase's weak-password / HIBP check so users can pick any password.
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

  try {
    const { phone, password, full_name, ref_code } = await req.json();
    if (!phone || !password) {
      return new Response(JSON.stringify({ error: 'Phone and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = `${phone.replace(/[^0-9]/g, '')}@pinoni.app`;

    // Create user with admin API — bypasses the HIBP / weak-password check.
    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: full_name || 'PINONI User', phone },
      email_confirm: true,
    });

    if (userErr) {
      return new Response(JSON.stringify({ error: userErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    // Resolve referrer first so we can set referred_by on insert.
    let referrerId: string | null = null;
    if (ref_code) {
      const { data: refProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('referral_code', ref_code)
        .maybeSingle();
      referrerId = refProfile?.id ?? null;
    }

    // Create the profile row explicitly (trigger was removed to avoid the
    // "Database error creating new user" failure inside the auth schema).
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const { error: profileErr } = await admin.from('profiles').insert({
      id: userId,
      full_name: full_name || 'PINONI User',
      phone,
      referral_code: code,
      referred_by: referrerId,
    });

    if (profileErr) {
      // Best-effort cleanup: delete the auth user if profile creation failed.
      await admin.auth.admin.deleteUser(userId);
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user_id: userId, email }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
