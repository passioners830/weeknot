import { supabase } from './supabase';

export type Circle = { id: string; name: string; inviteCode: string; ownerId: string };

export async function getCircles(): Promise<Circle[]> {
  const { data, error } = await supabase.from('circles').select('id, name, invite_code, owner_id');
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    inviteCode: c.invite_code,
    ownerId: c.owner_id,
  }));
}

export async function addCircle(name: string): Promise<Circle> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { data, error } = await supabase
    .from('circles')
    .insert({ name, owner_id: user.id })
    .select('id, name, invite_code, owner_id')
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase
    .from('circle_members')
    .insert({ circle_id: data.id, user_id: user.id });
  if (memberError) throw memberError;

  return { id: data.id, name: data.name, inviteCode: data.invite_code, ownerId: data.owner_id };
}

export async function joinCircleByCode(code: string): Promise<Circle> {
  const { data, error } = await supabase.rpc('join_circle', { code: code.trim() });
  if (error) throw error;
  const joined = data?.[0];
  if (!joined) throw new Error('招待コードが見つかりませんでした');

  const { data: full, error: fetchError } = await supabase
    .from('circles')
    .select('id, name, invite_code, owner_id')
    .eq('id', joined.id)
    .single();
  if (fetchError) throw fetchError;

  return { id: full.id, name: full.name, inviteCode: full.invite_code, ownerId: full.owner_id };
}

export type CircleMember = { id: string; displayName: string };

export async function getCircleMembers(circleId: string): Promise<CircleMember[]> {
  const { data: members, error } = await supabase
    .from('circle_members')
    .select('user_id')
    .eq('circle_id', circleId);
  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (profilesError) throw profilesError;

  return (profiles ?? []).map((p) => ({ id: p.id, displayName: p.display_name ?? '不明なユーザー' }));
}

export async function leaveCircle(circleId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', user.id);
  if (error) throw error;
}

// サークルのオーナーが他のメンバーを退会させる
export async function removeMember(circleId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('circle_members')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId);
  if (error) throw error;
}

function generateInviteCode(): string {
  const chars = '0123456789abcdef';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function regenerateInviteCode(circleId: string): Promise<string> {
  const newCode = generateInviteCode();
  const { error } = await supabase.from('circles').update({ invite_code: newCode }).eq('id', circleId);
  if (error) throw error;
  return newCode;
}

export async function deleteCircle(circleId: string): Promise<void> {
  const { error } = await supabase.from('circles').delete().eq('id', circleId);
  if (error) throw error;
}
