import { supabase } from './supabase';

export type BlockedUser = { id: string; displayName: string };

export async function getBlockedUserIds(): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id);
  if (error) throw error;
  return (data ?? []).map((b) => b.blocked_id);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const blockedIds = await getBlockedUserIds();
  if (blockedIds.length === 0) return [];

  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', blockedIds);
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, displayName: p.display_name ?? '不明なユーザー' }));
}

export async function blockUser(userId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('ログインしていません');

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', userId);
  if (error) throw error;
}
