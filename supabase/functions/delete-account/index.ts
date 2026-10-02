// ユーザー本人が自分のアカウントを完全に削除するためのEdge Function。
// auth.usersの行を削除すればprofiles/highlights/circles等はon delete cascadeで
// 自動的に消えるが、Storageの写真ファイルはカスケードされないため、ここで先に削除する。
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

const BUCKET = 'highlight-photos';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    // 呼び出し元本人のJWTで誰なのかを確認する（自分のアカウントしか削除できない）
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

    // ここから先だけservice role keyを使い、本人の写真ファイルとアカウント自体を削除する
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: highlights, error: highlightsError } = await adminClient
      .from('highlights')
      .select('id')
      .eq('user_id', caller.id);
    if (highlightsError) {
      return json({ error: highlightsError.message }, 500);
    }

    for (const highlight of highlights ?? []) {
      const prefix = `${caller.id}/${highlight.id}`;
      const { data: files } = await adminClient.storage.from(BUCKET).list(prefix);
      if (files && files.length > 0) {
        await adminClient.storage.from(BUCKET).remove(files.map((f) => `${prefix}/${f.name}`));
      }
    }

    // auth.usersの削除で、profiles/highlights/circles/circle_members/reactions/
    // comments/blocks/reportsはすべてon delete cascadeで連鎖削除される
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(caller.id);
    if (deleteError) {
      return json({ error: deleteError.message }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
