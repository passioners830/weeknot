import { supabase } from './supabase';

export type Circle = { id: string; name: string; inviteCode: string };

export async function getCircles(): Promise<Circle[]> {
  const { data, error } = await supabase.from('circles').select('id, name, invite_code');
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, inviteCode: c.invite_code }));
}

export async function addCircle(name: string): Promise<Circle> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { data, error } = await supabase
    .from('circles')
    .insert({ name, owner_id: user.id })
    .select('id, name, invite_code')
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase
    .from('circle_members')
    .insert({ circle_id: data.id, user_id: user.id });
  if (memberError) throw memberError;

  return { id: data.id, name: data.name, inviteCode: data.invite_code };
}

export async function joinCircleByCode(code: string): Promise<Circle> {
  const { data, error } = await supabase.rpc('join_circle', { code: code.trim() });
  if (error) throw error;
  const joined = data?.[0];
  if (!joined) throw new Error('招待コードが見つかりませんでした');

  const { data: full, error: fetchError } = await supabase
    .from('circles')
    .select('id, name, invite_code')
    .eq('id', joined.id)
    .single();
  if (fetchError) throw fetchError;

  return { id: full.id, name: full.name, inviteCode: full.invite_code };
}
