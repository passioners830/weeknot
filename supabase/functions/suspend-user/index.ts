// アプリ管理者(is_app_admin=true)だけが、通報されたユーザーのアカウントを
// 実際にBAN/UNBANできるようにするEdge Function。
// service role keyはこの関数の中（サーバー側）でしか使わず、クライアントには一切渡さない。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { targetUserId, action } = await req.json();
    if (!targetUserId || (action !== 'ban' && action !== 'unban')) {
      return json({ error: 'targetUserId and action ("ban" | "unban") are required' }, 400);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    // 呼び出し元本人のJWTでクライアントを作り、その人自身のprofilesしか見えない
    // （RLSがそのまま効く）状態でis_app_adminを確認する
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('is_app_admin')
      .eq('id', caller.id)
      .single();
    if (profileError || !callerProfile?.is_app_admin) {
      return json({ error: 'Forbidden: not an app admin' }, 403);
    }

    // ここから先だけservice role keyでAuth Admin APIを呼び、実際にBAN/UNBANする
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { error: banError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: action === 'ban' ? '876000h' : 'none',
    });
    if (banError) {
      return json({ error: banError.message }, 500);
    }

    // 実際のBAN状態はauth.users側にしかなくクライアントから見えないため、
    // UI表示用にprofiles.is_suspendedへも反映しておく
    const { error: profileUpdateError } = await adminClient
      .from('profiles')
      .update({ is_suspended: action === 'ban' })
      .eq('id', targetUserId);
    if (profileUpdateError) {
      return json({ error: profileUpdateError.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
